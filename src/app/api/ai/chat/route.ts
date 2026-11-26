import type Anthropic from "@anthropic-ai/sdk";
import { anthropicTools, SYSTEM_PROMPT } from "@/ai/tools";
import { allowAi } from "@/lib/rateLimit";
import { clientFor, errorResponse, FALLBACK_BETA, MODEL, noKeyResponse } from "@/ai/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One assistant turn. The browser holds the conversation and runs the tools
 * against the editor, then calls this route again with the tool results.
 */
export async function POST(req: Request) {
  const limit = allowAi(req);
  if (!limit.ok) return Response.json({ error: limit.reason }, { status: 429 });
  const client = clientFor(req);
  if (!client) return noKeyResponse();
  let body: { messages?: Anthropic.Beta.BetaMessageParam[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) {
    return Response.json({ error: "Ungültiger Gesprächsverlauf." }, { status: 400 });
  }

  try {
    const tools = anthropicTools();
    // cache the stable prefix (tools + system) across turns
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } };
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return Response.json({
        content: response.content,
        stop_reason: response.stop_reason,
        notice: "Die KI hat diese Anfrage abgelehnt. Bitte formulieren Sie sie anders.",
      });
    }
    return Response.json({ content: response.content, stop_reason: response.stop_reason });
  } catch (err) {
    return errorResponse(err);
  }
}
