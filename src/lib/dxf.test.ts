import { describe, expect, it } from "vitest";
import { floorBounds } from "@/model/geometry";
import { sampleFloor } from "@/model/project";
import { floorToDxf, parseDxf } from "./dxf";

describe("DXF", () => {
  const f = sampleFloor();
  const text = floorToDxf(f);

  it("writes layers, walls, door arcs and room texts in millimetres", () => {
    expect(text).toContain("AC1009");
    for (const l of ["WAENDE", "OEFFNUNGEN", "RAEUME"]) expect(text).toContain(l);
    expect(text).toContain("ARC");
    expect(text).toContain("Wohnen / Essen");
    expect(text.trim().endsWith("EOF")).toBe(true);
  });

  it("reads its own export back at the right size", () => {
    const g = parseDxf(text);
    expect(g.unitLabel).toBe("mm");
    const b = floorBounds(f);
    // walls reach half the outer wall thickness beyond the axes
    expect(g.bounds.maxX).toBeCloseTo(b.w + 0.36, 1);
    expect(g.bounds.maxY).toBeCloseTo(b.h + 0.36, 1);
    expect(g.segments.length).toBeGreaterThan(100);
    expect(g.texts.map((t) => t.str)).toContain("Schlafen");
  });

  it("expands blocks and guesses units without header", () => {
    const dxf = [
      "0",
      "SECTION",
      "2",
      "BLOCKS",
      "0",
      "BLOCK",
      "2",
      "B1",
      "70",
      "0",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "0",
      "LINE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "11",
      "100",
      "21",
      "0",
      "31",
      "0",
      "0",
      "ENDBLK",
      "0",
      "ENDSEC",
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LINE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "11",
      "600",
      "21",
      "0",
      "31",
      "0",
      "0",
      "LINE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "11",
      "0",
      "21",
      "400",
      "31",
      "0",
      "0",
      "INSERT",
      "8",
      "0",
      "2",
      "B1",
      "10",
      "100",
      "20",
      "400",
      "30",
      "0",
      "50",
      "0",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const g = parseDxf(dxf);
    expect(g.unitLabel).toBe("cm");
    expect(g.segments).toHaveLength(3);
    expect(g.bounds.maxX).toBeCloseTo(6);
    expect(g.bounds.maxY).toBeCloseTo(4);
  });
});
