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

describe("open-plan kitchen", () => {
  it("recognises open-plan living room names", async () => {
    const { detectRoomType } = await import("./materials");
    expect(detectRoomType("Wohnen/Essen/Kochen")).toBe("wohnkueche");
    expect(detectRoomType("Wohnküche")).toBe("wohnkueche");
    expect(detectRoomType("Kochen / Wohnen")).toBe("wohnkueche");
    expect(detectRoomType("Wohnen / Essen")).toBe("wohnen");
    expect(detectRoomType("Küche")).toBe("kueche");
  });

  it("furnishes an open-plan room with kitchen, dining and sofa, without collisions", async () => {
    const { addRectRoom, normalizeFloor, emptyFloor } = await import("./ops");
    const { collidingItems } = await import("./editing");
    const f = emptyFloor();
    addRectRoom(f, 0, 0, 8, 5.5, { type: "aussen", thickness: 0.3 });
    normalizeFloor(f);
    f.rooms[0].name = "Wohnen/Essen/Kochen";
    const [room] = computeRoomGeometry(f);
    const items = stageRoom(room, [], "warm", [], doorClearances(f));
    const ids = items.map((i) => i.defId);
    expect(ids).toEqual(expect.arrayContaining(["sofa-3", "essgruppe-6"]));
    // 40 m² → L-shaped kitchen
    expect(ids).toContain("kuechenzeile-l");
    for (const it of items) {
      for (const c of rectCorners(it.x, it.y, it.w - 0.02, it.d - 0.02, it.rotation)) {
        expect(pointInPolygon(c, room.inner)).toBe(true);
      }
    }
    f.items = items;
    expect(collidingItems(f).size).toBe(0);
  });

  it("puts a kitchen row into the largest living room when the flat has no kitchen", async () => {
    const { kitchenHostRoom } = await import("./staging");
    const f = sampleFloor();
    const rooms = computeRoomGeometry(f);
    const host = kitchenHostRoom(rooms);
    expect(rooms.find((r) => r.meta.id === host)?.meta.name).toBe("Wohnen / Essen");
    const living = rooms.find((r) => r.meta.id === host)!;
    const items = stageRoom(living, [], "warm", [], doorClearances(f), { addKitchen: true });
    expect(items.map((i) => i.defId)).toContain("kuechenzeile");
    // with a kitchen room on the floor, nobody gets an extra kitchen
    f.rooms.find((m) => m.name === "HWR")!.roomType = "kueche";
    expect(kitchenHostRoom(computeRoomGeometry(f))).toBeNull();
  });
});
