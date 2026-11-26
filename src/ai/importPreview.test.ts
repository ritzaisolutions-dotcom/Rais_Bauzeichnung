import { describe, expect, it } from "vitest";
import { addWall, emptyFloor, normalizeFloor } from "@/model/ops";
import type { Underlay } from "@/model/types";
import type { RecognisedPlan } from "./planSchema";
import { buildPreview, commitRecognised, cropFromDrag, textForAi } from "./importPreview";

const u: Underlay = { dataUrl: "", pxPerMeter: 100, x: 0, y: 0, opacity: 1, widthPx: 2000, heightPx: 1500, visible: true };

// a 6 × 4 m room drawn in a crop that starts at (500, 300) and was downscaled by 0.5
const plan: RecognisedPlan = {
  walls: [
    { x1: 0, y1: 0, x2: 300, y2: 0, thickness_px: 12, type: "aussen" },
    { x1: 300, y1: 0, x2: 300, y2: 200, thickness_px: 12, type: "aussen" },
    { x1: 300, y1: 200, x2: 0, y2: 200, thickness_px: 12, type: "aussen" },
    { x1: 0, y1: 200, x2: 0, y2: 0, thickness_px: 12, type: "aussen" },
  ],
  openings: [{ x: 150, y: 0, kind: "fenster", width_px: 60 }],
  rooms: [{ name: "Wohnen", x: 150, y: 100, area_m2: 20 }],
  notes: "",
};

describe("cropFromDrag", () => {
  it("normalises the drag direction and clamps to the image", () => {
    expect(cropFromDrag({ x: 900, y: 700 }, { x: -50, y: 100 }, 800, 600)).toEqual({ x: 0, y: 100, w: 800, h: 500 });
  });
  it("ignores tiny drags (a click)", () => {
    expect(cropFromDrag({ x: 10, y: 10 }, { x: 30, y: 40 }, 800, 600)).toBeNull();
  });
});

describe("textForAi", () => {
  it("keeps text inside the crop and maps it into AI image pixels", () => {
    const items = [
      { str: "Wohnen", px: 700, py: 400 },
      { str: "Nachbar", px: 100, py: 100 },
    ];
    expect(textForAi(items, { x: 500, y: 300, w: 600, h: 400 }, 0.5)).toEqual([{ str: "Wohnen", px: 100, py: 50 }]);
  });
});

describe("buildPreview", () => {
  it("maps crop pixels back to world meters and compares areas", () => {
    const p = buildPreview(plan, u, 2, { x: 500, y: 300 }, 2.6);
    const xs = p.floor.nodes.map((n) => n.x);
    const ys = p.floor.nodes.map((n) => n.y);
    expect(Math.min(...xs)).toBeCloseTo(5);
    expect(Math.max(...xs)).toBeCloseTo(11);
    expect(Math.min(...ys)).toBeCloseTo(3);
    expect(Math.max(...ys)).toBeCloseTo(7);
    expect(p.walls).toBe(4);
    expect(p.openings).toBe(1);
    expect(p.rooms).toHaveLength(1);
    expect(p.rooms[0].name).toBe("Wohnen");
    expect(p.rooms[0].target).toBe(20);
    // inner area of a 6 × 4 m axis rectangle with 24 cm walls (12 px × k 2)
    expect(p.rooms[0].area).toBeCloseTo(5.76 * 3.76, 1);
    expect(p.rooms[0].deviation).toBeCloseTo((5.76 * 3.76 - 20) / 20, 2);
  });
});

describe("commitRecognised", () => {
  it("adds to existing walls and shares their corners", () => {
    const f = emptyFloor();
    // existing neighbour room left of the recognised one, sharing the wall x = 5
    addWall(f, { x: 1, y: 3 }, { x: 5, y: 3 });
    addWall(f, { x: 5, y: 3 }, { x: 5, y: 7 });
    addWall(f, { x: 5, y: 7 }, { x: 1, y: 7 });
    addWall(f, { x: 1, y: 7 }, { x: 1, y: 3 });
    normalizeFloor(f);
    commitRecognised(f, plan, u, 2, { x: 500, y: 300 }, "add");
    expect(f.walls).toHaveLength(7);
    expect(f.rooms).toHaveLength(2);
  });
  it("replaces existing walls", () => {
    const f = emptyFloor();
    addWall(f, { x: 0, y: 0 }, { x: 1, y: 0 });
    commitRecognised(f, plan, u, 2, { x: 500, y: 300 }, "replace");
    expect(f.walls).toHaveLength(4);
  });
});
