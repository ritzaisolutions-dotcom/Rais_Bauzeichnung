// Small in-memory limiter. On serverless each instance counts on its own, which is
// enough to stop a runaway client; the daily cap bounds the cost per instance.

const windows = new Map<string, { start: number; count: number }>();

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns true when the call is allowed. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()) {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  if (w.count >= limit) return false;
  w.count++;
  return true;
}

const DAY = 24 * 3600 * 1000;

/** Limits for the paid AI routes: per client per minute and a daily cap for the whole instance. */
export function allowAi(req: Request) {
  const daily = Number(process.env.AI_DAILY_LIMIT ?? 300);
  if (!allow("ai:day", daily, DAY)) return { ok: false, reason: "Das Tageslimit für KI-Anfragen ist erreicht." };
  if (!allow(`ai:${clientIp(req)}`, 20, 60 * 1000))
    return { ok: false, reason: "Zu viele KI-Anfragen. Bitte kurz warten." };
  return { ok: true, reason: "" };
}
