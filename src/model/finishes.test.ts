import { describe, expect, it } from "vitest";
import { finishedWallSides, sunAt } from "./finishes";
import { computeRoomGeometry } from "./geometry";
import { addWall, emptyFloor, normalizeFloor } from "./ops";

describe("finishedWallSides", () => {
  it("finds the room-facing side of each wall of a coloured room only", () => {
    const f = emptyFloor();
    for (const [a, b] of [
      [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      [
        { x: 8, y: 0 },
        { x: 8, y: 4 },
      ],
      [
        { x: 8, y: 4 },
        { x: 0, y: 4 },
      ],
      [
        { x: 0, y: 4 },
        { x: 0, y: 0 },
      ],
      [
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
    ])
      addWall(f, a, b, { thickness: 0.2 });
    normalizeFloor(f);
    const rooms = computeRoomGeometry(f);
    expect(rooms).toHaveLength(2);
    const left = rooms.find((r) => r.centroid.x < 4)!;
    f.rooms.find((m) => m.id === left.meta.id)!.wallColor = "#c9d6c0";
    const sides = finishedWallSides(f, computeRoomGeometry(f));
    // top, bottom, left outer wall pieces of the left room and the middle wall
    expect(sides).toHaveLength(4);
    expect(new Set(sides.map((s) => s.room.meta.id)).size).toBe(1);
  });
});

describe("sunAt", () => {
  it("rises in the east, stands south at noon, sets in the west", () => {
    expect(sunAt(7).dir.x).toBeGreaterThan(0.8);
    const noon = sunAt(13);
    expect(noon.dir.z).toBeGreaterThan(0.4);
    expect(noon.dir.y).toBeGreaterThan(0.8);
    expect(noon.daylight).toBe(1);
    expect(sunAt(19).dir.x).toBeLessThan(-0.8);
    expect(sunAt(22).daylight).toBe(0);
  });
});
