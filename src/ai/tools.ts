// Tool definitions for the floor-plan assistant. The server sends them to Claude;
// the browser executes them against the editor store (the plan lives client-side).
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const ROOM_TYPES = [
  "wohnen",
  "wohnkueche",
  "schlafen",
  "kind",
  "bad",
  "wc",
  "kueche",
  "essen",
  "flur",
  "arbeiten",
  "abstell",
  "hwr",
  "ankleide",
  "balkon",
  "sonstiges",
] as const;
const MATERIALS = [
  "parkett_eiche",
  "parkett_hell",
  "parkett_dunkel",
  "fliese_hell",
  "fliese_grau",
  "beton",
  "teppich",
  "terrasse",
] as const;
const STYLES = ["skandinavisch", "modern", "klassisch", "warm"] as const;
const OPENINGS = ["tuer", "fenster", "schiebetuer", "durchgang", "bodenfenster"] as const;

export const toolSchemas = {
  get_plan: z.object({}),
  list_furniture_types: z.object({}),
  add_wall: z.object({
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    wall_type: z.enum(["aussen", "innen", "tragend", "gelaender"]).optional(),
  }),
  add_rect_room: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    name: z.string().optional(),
    wall_type: z.enum(["aussen", "innen", "tragend", "gelaender"]).optional(),
  }),
  move_wall: z.object({ wall_id: z.string(), offset: z.number() }),
  set_wall_length: z.object({ wall_id: z.string(), length: z.number().positive() }),
  set_wall_thickness: z.object({ wall_id: z.string(), thickness: z.number().positive() }),
  delete_elements: z.object({ ids: z.array(z.string()).min(1) }),
  add_opening: z.object({
    wall_id: z.string(),
    kind: z.enum(OPENINGS),
    position: z.number(),
    width: z.number().positive().optional(),
  }),
  update_room: z.object({
    room_id: z.string(),
    name: z.string().optional(),
    room_type: z.enum(ROOM_TYPES).optional(),
    floor_material: z.enum(MATERIALS).optional(),
    target_area: z.number().optional(),
  }),
  place_furniture: z.object({
    type_id: z.string(),
    x: z.number(),
    y: z.number(),
    rotation: z.number().optional(),
    color: z.string().optional(),
    width: z.number().positive().optional(),
    depth: z.number().positive().optional(),
  }),
  move_furniture: z.object({
    item_id: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    rotation: z.number().optional(),
    color: z.string().optional(),
  }),
  stage_room: z.object({ room_id: z.string(), style: z.enum(STYLES).optional(), replace: z.boolean().optional() }),
  clear_furniture: z.object({ room_id: z.string().optional() }),
} as const;

export type ToolName = keyof typeof toolSchemas;

const desc: Record<ToolName, string> = {
  get_plan:
    "Liefert den aktuellen Plan der aktiven Etage als JSON: Räume (id, name, typ, fläche, Begrenzungsrechteck, Polygon), Wände (id, Endpunkte, Dicke, Art), Öffnungen und Möbel. Vor Änderungen aufrufen, wenn IDs oder Koordinaten unbekannt sind.",
  list_furniture_types: "Liefert alle verfügbaren Möbeltypen mit id, Name, Kategorie und Standardmaßen in Metern.",
  add_wall:
    "Zeichnet eine gerade Wand zwischen zwei Punkten (Wandachse, Meter). Endpunkte docken an vorhandene Ecken/Wände an; Kreuzungen werden automatisch geteilt.",
  add_rect_room:
    "Legt einen rechteckigen Raum mit vier Wänden an. x/y ist die linke obere Ecke der Wandachsen. Optional mit Raumname.",
  move_wall:
    "Verschiebt eine Wand parallel um offset Meter entlang ihrer Normalen (positiv = links von der Laufrichtung a→b, bei waagerechter Wand von links nach rechts also nach oben). Angrenzende Wände werden mitgezogen.",
  set_wall_length: "Setzt die Achslänge einer Wand; der Endpunkt b wird entlang der Wand verschoben.",
  set_wall_thickness: "Setzt die Wanddicke in Metern.",
  delete_elements: "Löscht Wände, Öffnungen, Möbel, Texte oder Maßketten anhand ihrer IDs.",
  add_opening:
    "Setzt eine Tür, ein Fenster, eine Schiebetür, einen Durchgang oder ein bodentiefes Fenster in eine Wand. position = Abstand der Öffnungsmitte vom Wandanfang (Knoten a) in Metern.",
  update_room: "Ändert Name, Raumtyp, Bodenbelag oder Soll-Fläche (laut Plan) eines Raums.",
  place_furniture:
    "Stellt ein Möbel auf. x/y = Mittelpunkt in Metern, rotation in Grad im Uhrzeigersinn. Bei rotation 0 steht die Rückseite oben (an einer Wand mit kleinerem y), 90 = Rückseite rechts, 180 = unten, 270 = links. Optional Farbe (Hex) und abweichende Breite/Tiefe.",
  move_furniture: "Verschiebt, dreht oder färbt ein vorhandenes Möbel.",
  stage_room:
    "Richtet einen Raum automatisch passend zum Raumtyp ein (Home Staging). replace=true entfernt vorher die Möbel im Raum.",
  clear_furniture: "Entfernt alle Möbel eines Raums oder, ohne room_id, der ganzen Etage.",
};

export function anthropicTools(): Anthropic.Beta.BetaTool[] {
  return (Object.keys(toolSchemas) as ToolName[]).map((name) => {
    const schema = z.toJSONSchema(toolSchemas[name], { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name,
      description: desc[name],
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

export const SYSTEM_PROMPT = `Sie sind der Planungsassistent in „Rais Bauzeichnung“, einem Grundriss-Editor für Möbelberatung, Makler und Home Staging. Sie sprechen Deutsch und siezen die Nutzerin oder den Nutzer.

Sie bearbeiten den Grundriss über die bereitgestellten Werkzeuge. Koordinaten sind in Metern, x nach rechts, y nach unten (wie auf dem Bildschirm). Wände sind durch ihre Achse definiert; Flächenangaben sind lichte Maße. Räume entstehen automatisch aus geschlossenen Wänden.

Arbeitsweise:
- Holen Sie sich mit get_plan den aktuellen Stand, bevor Sie IDs oder Koordinaten verwenden. Erfinden Sie keine IDs.
- Für Möbel: Typen mit list_furniture_types nachschlagen. Achten Sie auf Abstände (Laufwege ca. 0,8 m, vor Schränken 0,9 m) und darauf, dass Möbel vollständig im Raum stehen.
- Für schnelles Einrichten eines Raums ist stage_room gut; feine Wünsche setzen Sie mit place_furniture und move_furniture um.
- Wenn eine Anweisung unklar ist oder ein Werkzeug fehlt, sagen Sie das kurz, statt zu raten.
- Antworten Sie knapp: was Sie geändert haben, in ein bis drei Sätzen. Alle Änderungen kann die Nutzerin mit Rückgängig (Strg+Z) zurücknehmen.`;
