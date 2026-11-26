import { describe, expect, it } from "vitest";
import { createSessionToken, passwordMatches, verifySessionToken } from "./auth";
import { allow } from "./rateLimit";

describe("session tokens", () => {
  it("accepts its own token and rejects tampering, other secrets and expiry", () => {
    const t = createSessionToken("geheim", 1000);
    expect(verifySessionToken(t, "geheim", 2000)).toBe(true);
    expect(verifySessionToken(t, "anders", 2000)).toBe(false);
    expect(verifySessionToken(t.replace(/.$/, "x"), "geheim", 2000)).toBe(false);
    expect(verifySessionToken(t, "geheim", 1000 + 31 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySessionToken(undefined, "geheim")).toBe(false);
    expect(verifySessionToken("abc", "geheim")).toBe(false);
  });
  it("compares passwords", () => {
    expect(passwordMatches("a", "a")).toBe(true);
    expect(passwordMatches("a", "b")).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after the limit within a window", () => {
    expect(allow("t", 2, 1000, 0)).toBe(true);
    expect(allow("t", 2, 1000, 10)).toBe(true);
    expect(allow("t", 2, 1000, 20)).toBe(false);
    expect(allow("t", 2, 1000, 1001)).toBe(true);
  });
});
