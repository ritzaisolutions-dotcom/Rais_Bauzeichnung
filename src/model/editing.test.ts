import { describe, expect, it } from "vitest";
import { collidingItems, copySelection, pasteClip, selectInRect, snapItemToWall } from "./editing";
import { addOpeningAtPoint, addWall, emptyFloor, normalizeFloor } from "./ops";
import type { Floor, FurnitureItem } from "./types";

function room(): Floor {
  // 5 × 4 m room, 20 cm walls, axes at x 0/5, y 0/4; inner faces at 0.1 / 4.9 and 0.1 / 3.9
  const f = emptyFloor();
  addWall(f, { x: 0, y: 0 }, { x: 5, y: 0 }, { thickness: 0.2 });
  addWall(f, { x: 5, y: 0 }, { x: 5, y: 4 }, { thickness: 0.2 });
  addWall(f, { x: 5, y: 4 }, { x: 0, y: 4 }, { thickness: 0.2 });
  addWall(f, { x: 0, y: 4 }, { x: 0, y: 0 }, { thickness: 0.2 });
  normalizeFloor(f);
  return f;
}

const item = (o: Partial<FurnitureItem>): FurnitureItem => ({
  id: Math.random().toString(36).slice(2),
  defId: "sofa",
  x: 2,
  y: 2,
  rotation: 0,
  w: 2,
  d: 0.9,
  h: 0.8,
  ...o,
});

describe("selectInRect", () => {
  it("selects walls and items fully inside", () => {
    const f = room();
    f.items.push(item({ id: "in", x: 2, y: 2 }), item({ id: "edge", x: 4.6, y: 2 }));
    const sel = selectInRect(f, { x: -1, y: -1 }, { x: 5.5, y: 2.5 });
    expect(sel.filter((s) => s.kind === "wall")).toHaveLength(1); // only the top wall
    expect(sel.filter((s) => s.kind === "item").map((s) => s.id)).toEqual(["in"]);
  });
});

describe("clipboard", () => {
  it("copies walls with their openings and pastes them shifted", () => {
    const f = room();
    addOpeningAtPoint(f, { x: 2.5, y: 0 }, "fenster", { width: 1.2 });
    f.items.push(item({ id: "sofa" }));
    const top = f.walls.find((w) => f.openings[0].wallId === w.id)!;
    const clip = copySelection(f, [
      { kind: "wall", id: top.id },
      { kind: "item", id: "sofa" },
    ])!;
    expect(clip.walls).toHaveLength(1);
    expect(clip.openings).toHaveLength(1);
    const target = emptyFloor();
    const sel = pasteClip(target, clip, { x: 1, y: 1 });
    normalizeFloor(target);
    expect(target.walls).toHaveLength(1);
    expect(target.openings).toHaveLength(1);
    expect(target.openings[0].width).toBeCloseTo(1.2);
    expect(target.items[0]).toMatchObject({ x: 3, y: 3, defId: "sofa" });
    expect(target.items[0].id).not.toBe("sofa");
    expect(sel.map((s) => s.kind).sort()).toEqual(["item", "opening", "wall"]);
  });
  it("returns null for an empty selection", () => {
    expect(copySelection(room(), [])).toBeNull();
  });
});

describe("snapItemToWall", () => {
  it("puts the back against the nearest wall face and turns the item into the room", () => {
    const f = room();
    // near the bottom wall (inner face y = 3.9): front must face up (rotation 180)
    const s = snapItemToWall(f, { w: 2, d: 0.9, rotation: 0 }, { x: 2.5, y: 3.35 })!;
    expect(s.y).toBeCloseTo(3.9 - 0.45);
    expect(s.x).toBeCloseTo(2.5);
    expect(s.rotation).toBeCloseTo(180);
    // near the left wall (inner face x = 0.1): front faces +x (rotation 270)
    const l = snapItemToWall(f, { w: 2, d: 0.9, rotation: 0 }, { x: 0.6, y: 2 })!;
    expect(l.x).toBeCloseTo(0.1 + 0.45);
    expect(l.rotation).toBeCloseTo(270);
  });
  it("does nothing in the middle of the room", () => {
    expect(snapItemToWall(room(), { w: 2, d: 0.9, rotation: 0 }, { x: 2.5, y: 2 })).toBeNull();
  });
});

describe("collidingItems", () => {
  it("flags overlapping furniture and furniture in walls, but not rugs or stacked items", () => {
    const f = room();
    f.items.push(
      item({ id: "a", x: 2, y: 2 }),
      item({ id: "b", x: 2.5, y: 2.2 }),
      item({ id: "wall", x: 4.5, y: 1 }),
      item({ id: "rug", x: 2, y: 2, h: 0.01 }),
      item({ id: "free", x: 2, y: 3.4, w: 1, d: 0.4 }),
      item({ id: "upper", x: 2, y: 3.4, w: 1, d: 0.4, elevation: 1.5, h: 0.6 }),
    );
    expect([...collidingItems(f)].sort()).toEqual(["a", "b", "wall"]);
  });
});
