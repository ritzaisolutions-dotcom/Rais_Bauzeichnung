// Shared-password protection: an HMAC-signed session cookie, checked by src/proxy.ts.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "rais_session";
export const SESSION_DAYS = 30;

export type AuthMode = "open" | "protected" | "locked";

export function authConfig(): { mode: AuthMode; password: string; secret: string } {
  const password = process.env.APP_PASSWORD?.trim() ?? "";
  if (!password) {
    // password protection is optional: without APP_PASSWORD the app is open
    return { mode: "open", password: "", secret: "" };
  }
  // the secret defaults to a hash of the password, so changing the password logs everybody out
  const secret =
    process.env.APP_SESSION_SECRET?.trim() || createHash("sha256").update(`rais:${password}`).digest("hex");
  return { mode: "protected", password, secret };
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createSessionToken(secret: string, now = Date.now()) {
  const exp = String(now + SESSION_DAYS * 24 * 3600 * 1000);
  return `${exp}.${sign(exp, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(sign(exp, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Constant-time password comparison (compares fixed-length hashes). */
export function passwordMatches(given: string, password: string) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}
