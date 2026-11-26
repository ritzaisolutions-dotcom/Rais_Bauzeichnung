import { authConfig, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { mode, password, secret } = authConfig();
  if (mode === "locked") {
    return Response.json({ error: "Der Zugang ist noch nicht eingerichtet (APP_PASSWORD fehlt)." }, { status: 503 });
  }
  // slow down guessing: 8 attempts per minute per client
  if (!allow(`login:${clientIp(req)}`, 8, 60 * 1000)) {
    return Response.json({ error: "Zu viele Versuche. Bitte eine Minute warten." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const given = typeof body.password === "string" ? body.password : "";
  if (mode === "protected" && !passwordMatches(given, password)) {
    return Response.json({ error: "Das Passwort ist falsch." }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  if (mode === "protected") {
    const secure = process.env.NODE_ENV === "production" && !req.url.startsWith("http://localhost") ? "; Secure" : "";
    res.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=${createSessionToken(secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 3600}${secure}`,
    );
  }
  return res;
}
