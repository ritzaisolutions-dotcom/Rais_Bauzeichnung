import { describe, expect, it } from "vitest";
import type { WallAxis } from "@/lib/underlayLines";
import { computeRoomGeometry } from "./geometry";
import { emptyFloor } from "./ops";
import { addDerivedWalls, bridgeGaps, deriveFromAxes, wallsFromAxes } from "./wallsFromAxes";

// as detected from a filled 6 × 4 m room with 24 cm walls (meters), plus an inner wall
const axes: WallAxis[] = [
  { dir: "h", at: 0, from: -0.12, to: 6.12, thickness: 0.24 },
  { dir: "h", at: 4, from: -0.12, to: 6.12, thickness: 0.24 },
  { dir: "v", at: 0, from: -0.12, to: 4.12, thickness: 0.24 },
  { dir: "v", at: 6, from: -0.12, to: 4.12, thickness: 0.24 },
  // inner wall from face to face (T-junctions)
  { dir: "v", at: 2.5, from: 0.12, to: 3.88, thickness: 0.115 },
];

describe("wallsFromAxes", () => {
  it("pulls the ends onto the crossing walls' centre lines", () => {
    const w = wallsFromAxes(axes);
    expect(w).toHaveLength(5);
    const top = w[0];
    expect(top.a).toEqual({ x: 0, y: 0 });
    expect(top.b).toEqual({ x: 6, y: 0 });
    expect(top.type).toBe("tragend");
    const inner = w[4];
    expect(inner.a).toEqual({ x: 2.5, y: 0 });
    expect(inner.b).toEqual({ x: 2.5, y: 4 });
    expect(inner.type).toBe("innen");
  });

  it("produces closed rooms in the editor", () => {
    const f = emptyFloor();
    addDerivedWalls(f, wallsFromAxes(axes));
    const rooms = computeRoomGeometry(f);
    expect(rooms).toHaveLength(2);
  });
});

describe("bridgeGaps", () => {
  it("closes a door gap and turns it into a door; joints are not openings", () => {
    const withDoor: WallAxis[] = [
      ...axes.slice(0, 4),
      // inner wall with a 0.9 m door gap between y 1.5 and 2.4
      { dir: "v", at: 2.5, from: 0.12, to: 1.5, thickness: 0.115 },
      { dir: "v", at: 2.5, from: 2.4, to: 3.88, thickness: 0.115 },
      // outer top wall broken where the inner wall joins (outline drawing)
    ];
    withDoor[0] = { dir: "h", at: 0, from: -0.12, to: 2.44, thickness: 0.24 };
    withDoor.push({ dir: "h", at: 0, from: 2.56, to: 6.12, thickness: 0.24 });
    const b = bridgeGaps(withDoor);
    expect(b.axes).toHaveLength(5);
    expect(b.openings).toHaveLength(1);
    expect(b.openings[0]).toMatchObject({ kind: "tuer", width: 0.9 });
    const f = emptyFloor();
    const r = deriveFromAxes(f, withDoor);
    expect(r.openings).toBe(1);
    expect(f.openings).toHaveLength(1);
    expect(computeRoomGeometry(f)).toHaveLength(2);
  });
});
