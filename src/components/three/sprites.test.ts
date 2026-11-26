import { describe, expect, it } from "vitest";
import { findDef } from "@/furniture/catalog";
import type { FurnitureDef } from "@/model/types";
import { contentHash } from "./sprites";

describe("sprite cache key", () => {
  it("is stable for the same definition and changes when the model changes", () => {
    const sofa = findDef("sofa-3")!;
    const copy: FurnitureDef = structuredClone(sofa);
    expect(contentHash(copy, findDef)).toBe(contentHash(sofa, findDef));
    const changed: FurnitureDef = structuredClone(sofa);
    changed.parts[0].color = "#ff0000";
    expect(contentHash(changed, findDef)).not.toBe(contentHash(sofa, findDef));
  });
  it("includes the pieces of composites (dining set → chairs)", () => {
    const set = findDef("essgruppe-6")!;
    expect(set.children?.length).toBeGreaterThan(0);
    const altered = (id: string) => {
      const d = findDef(id);
      if (!d || d.id !== set.children![0].defId) return d;
      const c = structuredClone(d);
      c.h += 0.1;
      return c;
    };
    expect(contentHash(structuredClone(set), altered)).not.toBe(contentHash(structuredClone(set), findDef));
  });
});
