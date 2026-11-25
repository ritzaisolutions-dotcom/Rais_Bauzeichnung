import { describe, expect, it } from "vitest";
import { computeRoomGeometry, findFaces, insetPolygon, polygonArea } from "./geometry";
import { addOpening, addRectRoom, addWall, deleteWall, emptyFloor, moveWallParallel, normalizeFloor } from "./ops";
import { sampleFloor } from "./project";

function rooms(floor: ReturnType<typeof emptyFloor>) {
  normalizeFloor(floor);
  return computeRoomGeometry(floor);
}

describe("room detection", () => {
  it("finds one room in a rectangle and computes the clear area", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 5, 4, { thickness: 0.2 });
    const r = rooms(f);
    expect(r).toHaveLength(1);
    // clear dimensions 4.8 x 3.8
    expect(r[0].area).toBeCloseTo(4.8 * 3.8, 5);
  });

  it("splits a room with an internal wall into two rooms", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 6, 4, { thickness: 0.2 });
    addWall(f, { x: 3, y: 0 }, { x: 3, y: 4 }, { thickness: 0.1 });
    const r = rooms(f);
    expect(r).toHaveLength(2);
    const areas = r.map((x) => x.area).sort();
    // left: x 0.1..2.95, y 0.1..3.9
    expect(areas[0]).toBeCloseTo(2.85 * 3.8, 5);
    expect(areas[1]).toBeCloseTo(2.85 * 3.8, 5);
  });

  it("handles a wall crossing through the middle (auto-splitting)", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 6, 6, { thickness: 0.2 });
    addWall(f, { x: 3, y: 0 }, { x: 3, y: 6 });
    addWall(f, { x: 0, y: 3 }, { x: 6, y: 3 });
    expect(rooms(f)).toHaveLength(4);
  });

  it("ignores dead-end walls inside a room", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 5, 4, { thickness: 0.2 });
    addWall(f, { x: 2.5, y: 0 }, { x: 2.5, y: 2 });
    const r = rooms(f);
    expect(r).toHaveLength(1);
    expect(r[0].outline.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps room metadata when a wall is moved", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 5, 4, { thickness: 0.2 });
    normalizeFloor(f);
    f.rooms[0].name = "Wohnen";
    const wall = f.walls[0];
    moveWallParallel(f, wall.id, 0.5);
    normalizeFloor(f);
    expect(f.rooms[0].name).toBe("Wohnen");
  });

  it("merges rooms again when the separating wall is deleted", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 6, 4, { thickness: 0.2 });
    const [mid] = addWall(f, { x: 3, y: 0 }, { x: 3, y: 4 }, { thickness: 0.1 });
    expect(rooms(f)).toHaveLength(2);
    deleteWall(f, mid);
    const r = rooms(f);
    expect(r).toHaveLength(1);
    expect(f.walls).toHaveLength(4);
  });

  it("only counts bounded faces", () => {
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 2, 2);
    expect(findFaces(f)).toHaveLength(1);
  });
});

describe("openings", () => {
  it("moves openings to the right segment when a wall is split", () => {
    const f = emptyFloor();
    const [w] = addWall(f, { x: 0, y: 0 }, { x: 6, y: 0 });
    addOpening(f, w, 4.5, "fenster");
    addWall(f, { x: 3, y: 0 }, { x: 3, y: 3 });
    const o = f.openings[0];
    const host = f.walls.find((x) => x.id === o.wallId)!;
    expect(host.id).not.toBe(w);
    expect(o.offset).toBeCloseTo(1.5, 5);
  });
});

describe("inset", () => {
  it("insets a square", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(polygonArea(insetPolygon(sq, [0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(9, 5);
    expect(polygonArea(insetPolygon(sq.slice().reverse(), [0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(9, 5);
  });
});

describe("sample project", () => {
  it("builds the sample apartment with named rooms", () => {
    const f = sampleFloor();
    const r = computeRoomGeometry(f);
    expect(r.map((x) => x.meta.name).sort()).toEqual(
      ["Bad", "Flur", "HWR", "Schlafen", "WC", "Wohnen / Essen", "Zimmer"].sort(),
    );
    expect(f.openings.length).toBe(15);
  });
});
