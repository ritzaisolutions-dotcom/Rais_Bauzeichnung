import { describe, expect, it } from "vitest";
import { clientErrorSchema } from "./logSchema";

describe("client error log", () => {
  it("cuts long texts and keeps only the path of the URL", () => {
    const r = clientErrorSchema.parse({
      kind: "error",
      message: "x".repeat(900),
      url: "https://rais.example/teilen/AbC123secret?utm=1#x",
    });
    expect(r.message).toHaveLength(500);
    expect(r.url).toBe("/teilen/…");
    expect(clientErrorSchema.parse({ kind: "boundary", message: "m", url: "https://a.b/project/42?x" }).url).toBe(
      "/project/42",
    );
  });
  it("rejects unknown kinds", () => {
    expect(clientErrorSchema.safeParse({ kind: "spam", message: "x" }).success).toBe(false);
  });
});
