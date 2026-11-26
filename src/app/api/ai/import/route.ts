import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { planSchema } from "@/ai/planSchema";
import { allowAi } from "@/lib/rateLimit";
import { clientFor, errorResponse, FALLBACK_BETA, MODEL, noKeyResponse } from "@/ai/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  image: z.string().min(100).max(12_000_000),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  pxPerMeter: z.number().positive().optional(),
  textItems: z
    .array(z.object({ str: z.string().max(200), px: z.number(), py: z.number() }))
    .max(2000)
    .default([]),
});

const TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_floorplan",
  description: "Gibt die erkannte Grundrissgeometrie in Bildpixeln zurück.",
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["walls", "openings", "rooms", "notes"],
    properties: {
      walls: {
        type: "array",
        description: "Wandsegmente als Achslinien (Mittellinie der Wand) in Bildpixeln.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["x1", "y1", "x2", "y2", "thickness_px", "type"],
          properties: {
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
            thickness_px: { type: "number", description: "Wanddicke in Pixeln" },
            type: { type: "string", enum: ["aussen", "innen", "tragend"] },
          },
        },
      },
      openings: {
        type: "array",
        description: "Türen und Fenster: Mittelpunkt auf der Wandachse und lichte Breite in Pixeln.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "kind", "width_px"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            kind: { type: "string", enum: ["tuer", "fenster", "schiebetuer", "durchgang", "bodenfenster"] },
            width_px: { type: "number" },
          },
        },
      },
      rooms: {
        type: "array",
        description:
          "Räume mit Name, einem Punkt im Rauminneren (Pixel) und der Fläche laut Plan (0, wenn nicht angegeben).",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "x", "y", "area_m2"],
          properties: {
            name: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            area_m2: { type: "number" },
          },
        },
      },
      notes: { type: "string", description: "Kurze Hinweise auf Unsicherheiten, auf Deutsch." },
    },
  },
};

const PROMPT = (
  w: number,
  h: number,
  ppm: number | undefined,
  text: string,
) => `Dies ist eine Bauzeichnung (Grundriss) als Bild mit ${w} × ${h} Pixeln. Koordinatenursprung oben links, x nach rechts, y nach unten.
${ppm ? `Maßstab: ${ppm.toFixed(2)} Pixel entsprechen 1 Meter.` : "Der Maßstab ist unbekannt."}

Aufgabe: Übertragen Sie die Wohnung, die im Plan im Vordergrund steht (kräftig gezeichnet), in Vektorgeometrie. Ausgegraute oder blasse Nachbarwohnungen, Treppenhäuser anderer Einheiten, Möbel, Bemaßungen und Schraffuren ignorieren Sie.

Regeln:
- Jede Wand als gerades Segment entlang ihrer Mittellinie. Wände laufen durch Tür- und Fensteröffnungen durch; die Öffnungen geben Sie separat an.
- Wände, die sich treffen, müssen exakt gemeinsame Endpunkte haben (gleiche Koordinaten). T-Stöße enden auf der Achse der anderen Wand.
- Waagerechte und senkrechte Wände exakt achsparallel angeben.
- Außenwände sind die dicken Wände der Gebäudehülle, tragende Innenwände mittel, leichte Trennwände dünn.
- Türen erkennen Sie am Öffnungsbogen, Fenster an der dünnen Doppellinie (oft farbig) in der Außenwand.
- Räume: Name und Fläche aus der Beschriftung übernehmen. Balkon/Loggia/Terrasse ebenfalls als Raum mit eigenen Begrenzungswänden, wenn sie gezeichnet sind.

Texte aus dem PDF mit Position (Pixel) als Hilfe:
${text || "(keine)"}

Rufen Sie zum Schluss genau einmal das Werkzeug submit_floorplan auf.`;

export async function POST(req: Request) {
  const limit = allowAi(req);
  if (!limit.ok) return Response.json({ error: limit.reason }, { status: 429 });
  const client = clientFor(req);
  if (!client) return noKeyResponse();
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const { image, width, height, pxPerMeter, textItems } = parsed.data;
  const text = textItems
    .slice(0, 400)
    .map((t) => `"${t.str}" @ (${Math.round(t.px)}, ${Math.round(t.py)})`)
    .join("\n");

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "high" },
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: PROMPT(width, height, pxPerMeter, text) },
          ],
        },
      ],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      return Response.json({ error: "Die KI hat die Erkennung abgelehnt." }, { status: 422 });
    }
    if (message.stop_reason === "max_tokens") {
      return Response.json(
        { error: "Der Plan ist zu umfangreich für einen Durchgang. Bitte einen Ausschnitt importieren." },
        { status: 422 },
      );
    }
    const call = message.content.find((b) => b.type === "tool_use" && b.name === TOOL.name);
    if (!call || call.type !== "tool_use") {
      return Response.json(
        { error: "Die KI hat keinen Grundriss geliefert. Bitte erneut versuchen." },
        { status: 422 },
      );
    }
    const plan = planSchema.safeParse(call.input);
    if (!plan.success) {
      return Response.json(
        { error: "Die erkannte Geometrie war unvollständig. Bitte erneut versuchen." },
        { status: 422 },
      );
    }
    return Response.json({ plan: plan.data, imageWidth: width, imageHeight: height });
  } catch (err) {
    return errorResponse(err);
  }
}
