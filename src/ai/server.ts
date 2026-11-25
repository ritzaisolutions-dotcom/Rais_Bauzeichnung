import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Uses the customer's own key when the browser sends one (prepared for the
 * dashboard integration), otherwise the server key from ANTHROPIC_API_KEY.
 */
export function clientFor(req: Request): Anthropic | null {
  const userKey = req.headers.get("x-anthropic-key")?.trim();
  if (userKey) return new Anthropic({ apiKey: userKey });
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return null;
}

export function noKeyResponse() {
  return Response.json(
    {
      error:
        "Kein Claude-API-Key konfiguriert. Hinterlegen Sie ANTHROPIC_API_KEY auf dem Server oder einen eigenen Key in den Einstellungen.",
    },
    { status: 400 },
  );
}

export function errorResponse(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: "Der API-Key wurde abgelehnt." }, { status: 401 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Zu viele Anfragen. Bitte gleich noch einmal versuchen." }, { status: 429 });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return Response.json({ error: `Anfrage abgelehnt: ${err.message}` }, { status: 400 });
  }
  if (err instanceof Anthropic.APIError) {
    return Response.json({ error: `KI-Dienst nicht erreichbar (${err.status ?? "?"}).` }, { status: 502 });
  }
  console.error(err);
  return Response.json({ error: "Unerwarteter Fehler bei der KI-Anfrage." }, { status: 500 });
}
