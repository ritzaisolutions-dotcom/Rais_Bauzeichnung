import { describe, expect, it } from "vitest";
import { computeRoomGeometry, pointInPolygon, rectCorners } from "./geometry";
import { sampleFloor } from "./project";
import { doorClearances, stageRoom } from "./staging";

describe("home staging", () => {
  const f = sampleFloor();
  const rooms = computeRoomGeometry(f);
  const doors = doorClearances(f);
  const staged = new Map(rooms.map((r) => [r.meta.name, stageRoom(r, [], "warm", [], doors)]));

  it("furnishes every typed room of the sample flat", () => {
    expect(staged.get("Bad")!.map((i) => i.defId)).toEqual(expect.arrayContaining(["badewanne", "wc"]));
    expect(staged.get("Schlafen")!.map((i) => i.defId)).toContain("bett-180");
    expect(staged.get("Wohnen / Essen")!.map((i) => i.defId)).toEqual(
      expect.arrayContaining(["sofa-3", "essgruppe-6"]),
    );
  });

  it("keeps all furniture inside its room", () => {
    for (const r of rooms) {
      for (const it of staged.get(r.meta.name)!) {
        for (const c of rectCorners(it.x, it.y, it.w - 0.02, it.d - 0.02, it.rotation)) {
          expect(pointInPolygon(c, r.inner)).toBe(true);
        }
      }
    }
  });
});
