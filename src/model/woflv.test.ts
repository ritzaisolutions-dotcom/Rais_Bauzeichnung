import { describe, expect, it } from "vitest";
import { computeRoomGeometry } from "./geometry";
import { addWall, emptyFloor, normalizeFloor } from "./ops";
import { clipHalfPlane, heightAt, livingArea, roomAreas, slopeSides } from "./woflv";

/** 6 × 5 m attic room (axes), 20 cm walls → 5.8 × 4.8 m inside; slope on the top wall. */
function attic(slope?: { knee: number; angle: number }) {
  const f = emptyFloor();
  f.height = 2.5;
  addWall(f, { x: 0, y: 0 }, { x: 6, y: 0 }, { thickness: 0.2 });
  addWall(f, { x: 6, y: 0 }, { x: 6, y: 5 }, { thickness: 0.2 });
  addWall(f, { x: 6, y: 5 }, { x: 0, y: 5 }, { thickness: 0.2 });
  addWall(f, { x: 0, y: 5 }, { x: 0, y: 0 }, { thickness: 0.2 });
  normalizeFloor(f);
  const top = f.walls.find((w) => {
    const a = f.nodes.find((n) => n.id === w.a)!;
    const b = f.nodes.find((n) => n.id === w.b)!;
    return a.y === 0 && b.y === 0;
  })!;
  if (slope) top.slope = slope;
  return f;
}

describe("clipHalfPlane", () => {
  it("cuts a square in half", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const half = clipHalfPlane(sq, { x: 1, y: 0 }, 1);
    expect(half).toHaveLength(4);
    expect(Math.min(...half.map((p) => p.x))).toBe(1);
  });
});

describe("roomAreas (WoFlV)", () => {
  it("counts the full area without slopes", () => {
    const f = attic();
    const [r] = computeRoomGeometry(f);
    const a = roomAreas(f, r);
    expect(a.sloped).toBe(false);
    expect(a.counted).toBeCloseTo(5.8 * 4.8, 3);
  });

  it("splits the area at 1 m and 2 m under a 45° slope with 0.5 m knee wall", () => {
    const f = attic({ knee: 0.5, angle: 45 });
    const [r] = computeRoomGeometry(f);
    const sides = slopeSides(f, r);
    expect(sides).toHaveLength(1);
    // heights: inner face at y = 0.1 → 0.5 m, rising 1 m per meter
    expect(heightAt(sides, { x: 3, y: 0.1 }, 2.5)).toBeCloseTo(0.5);
    expect(heightAt(sides, { x: 3, y: 1.1 }, 2.5)).toBeCloseTo(1.5);
    expect(heightAt(sides, { x: 3, y: 4 }, 2.5)).toBeCloseTo(2.5);
    const a = roomAreas(f, r);
    // < 1 m: 0.5 m strip; 1–2 m: 1 m strip; rest ≥ 2 m (5.8 m wide)
    expect(a.none).toBeCloseTo(5.8 * 0.5, 3);
    expect(a.half).toBeCloseTo(5.8 * 1.0, 3);
    expect(a.full).toBeCloseTo(5.8 * 3.3, 3);
    expect(a.counted).toBeCloseTo(5.8 * 3.3 + 5.8 * 0.5, 3);
    expect(livingArea(f, [r])).toBeCloseTo(a.counted, 6);
  });

  it("counts a balcony by a quarter", () => {
    const f = attic();
    f.rooms[0].roomType = "balkon";
    const [r] = computeRoomGeometry(f);
    expect(roomAreas(f, r).counted).toBeCloseTo((5.8 * 4.8) / 4, 3);
  });
});
