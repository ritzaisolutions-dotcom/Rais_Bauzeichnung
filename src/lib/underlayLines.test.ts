import { describe, expect, it } from "vitest";
import { detectUnderlayLines, thicknessAlong, toWorldLines, type Bitmap } from "./underlayLines";

function canvas(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 0;
  };
  return { bmp: { data, width: w, height: h, channels: 1 } as Bitmap, fill };
}

describe("detectUnderlayLines", () => {
  it("finds filled walls with their centre and thickness, and the corners", () => {
    // 100 px/m: a 6 × 4 m room with 24 cm filled outer walls (axes at x 100/700, y 100/500)
    const { bmp, fill } = canvas(800, 600);
    fill(88, 88, 712, 112); // top
    fill(88, 488, 712, 512); // bottom
    fill(88, 88, 112, 512); // left
    fill(688, 88, 712, 512); // right
    // text-like specks are ignored
    fill(300, 300, 310, 305);
    const r = detectUnderlayLines(bmp, 100);
    const h = r.axes.filter((a) => a.dir === "h").map((a) => [a.at, a.thickness]);
    const v = r.axes.filter((a) => a.dir === "v").map((a) => [a.at, a.thickness]);
    expect(h).toEqual(
      expect.arrayContaining([
        [100, 24],
        [500, 24],
      ]),
    );
    expect(v).toEqual(
      expect.arrayContaining([
        [100, 24],
        [700, 24],
      ]),
    );
    expect(r.axes).toHaveLength(4);
    expect(r.corners).toHaveLength(4);
    expect(r.corners).toEqual(expect.arrayContaining([{ x: 100, y: 100, thickness: 24 }]));
  });

  it("pairs outlined walls (two thin lines) into one axis", () => {
    const { bmp, fill } = canvas(800, 300);
    // 11.5 cm inner wall drawn as two 2 px lines, 200 → 600 px long
    fill(200, 100, 600, 102);
    fill(200, 113, 600, 115);
    // a lone dimension line far away stays unpaired
    fill(100, 250, 700, 251);
    const r = detectUnderlayLines(bmp, 100);
    expect(r.axes).toHaveLength(1);
    expect(r.axes[0]).toMatchObject({ dir: "h", at: 107.5, thickness: 13, from: 200, to: 600 });
  });

  it("splits a wall at a door opening", () => {
    const { bmp, fill } = canvas(800, 200);
    fill(50, 90, 300, 110);
    fill(390, 90, 750, 110);
    const r = detectUnderlayLines(bmp, 100);
    expect(r.axes.map((a) => [a.from, a.to])).toEqual(
      expect.arrayContaining([
        [50, 300],
        [390, 750],
      ]),
    );
  });
});

describe("toWorldLines / thicknessAlong", () => {
  const lines = {
    axes: [
      { dir: "h" as const, at: 100, from: 88, to: 712, thickness: 24 },
      { dir: "v" as const, at: 700, from: 88, to: 512, thickness: 24 },
    ],
    corners: [{ x: 700, y: 100, thickness: 24 }],
  };
  // analysed at half resolution (k = 0.5) of an underlay with 200 px/m placed at (2, 1)
  const world = toWorldLines(lines, { x: 2, y: 1, pxPerMeter: 200 }, 0.5);
  it("converts pixels to meters", () => {
    expect(world.axes[0].at).toBeCloseTo(2);
    expect(world.axes[0].thickness).toBeCloseTo(0.24);
    expect(world.corners[0].x).toBeCloseTo(9);
    expect(world.corners[0].y).toBeCloseTo(2);
  });
  it("finds the thickness of the drawn wall a new wall follows", () => {
    expect(thicknessAlong({ x: 3, y: 2 }, { x: 9, y: 2 }, world.axes)).toBeCloseTo(0.24);
    expect(thicknessAlong({ x: 9, y: 2 }, { x: 9, y: 5 }, world.axes)).toBeCloseTo(0.24);
    expect(thicknessAlong({ x: 3, y: 3 }, { x: 9, y: 3 }, world.axes)).toBeUndefined();
    expect(thicknessAlong({ x: 3, y: 2 }, { x: 9, y: 4 }, world.axes)).toBeUndefined();
  });
});
