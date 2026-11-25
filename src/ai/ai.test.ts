import { beforeEach, describe, expect, it } from "vitest";
import { computeRoomGeometry } from "@/model/geometry";
import { emptyFloor } from "@/model/ops";
import { createProject } from "@/model/project";
import type { Underlay } from "@/model/types";
import { useEditor } from "@/store/editor";
import { applyRecognisedPlan } from "./applyPlan";
import { executeTool } from "./execute";
import { anthropicTools } from "./tools";

const underlay: Underlay = {
  dataUrl: "",
  pxPerMeter: 100,
  x: 0,
  y: 0,
  opacity: 1,
  widthPx: 1000,
  heightPx: 800,
  visible: true,
};

describe("applyRecognisedPlan", () => {
  it("turns a recognised pixel plan into rooms, openings and names", () => {
    const f = emptyFloor();
    applyRecognisedPlan(
      f,
      {
        // slightly imprecise corners, as a vision model would return them
        walls: [
          { x1: 100, y1: 100, x2: 702, y2: 101, thickness_px: 30, type: "aussen" },
          { x1: 701, y1: 99, x2: 700, y2: 500, thickness_px: 30, type: "aussen" },
          { x1: 700, y1: 501, x2: 100, y2: 500, thickness_px: 30, type: "aussen" },
          { x1: 99, y1: 500, x2: 100, y2: 100, thickness_px: 30, type: "aussen" },
          { x1: 400, y1: 100, x2: 401, y2: 500, thickness_px: 11, type: "innen" },
        ],
        openings: [
          { x: 400, y: 300, kind: "tuer", width_px: 88 },
          { x: 250, y: 100, kind: "fenster", width_px: 126 },
        ],
        rooms: [
          { name: "Wohnen", x: 250, y: 300, area_m2: 11.3 },
          { name: "Schlafen", x: 550, y: 300, area_m2: 0 },
        ],
        notes: "",
      },
      underlay,
      1,
    );
    const rooms = computeRoomGeometry(f);
    expect(rooms.map((r) => r.meta.name).sort()).toEqual(["Schlafen", "Wohnen"]);
    expect(rooms.find((r) => r.meta.name === "Wohnen")!.meta.targetArea).toBe(11.3);
    expect(f.openings.map((o) => o.kind).sort()).toEqual(["fenster", "tuer"]);
    expect(f.openings.find((o) => o.kind === "tuer")!.width).toBeCloseTo(0.88, 2);
    // walls snapped to exact corners: 4 outer walls split by the inner wall + inner wall
    expect(f.walls.length).toBe(7);
  });
});

describe("assistant tools", () => {
  beforeEach(() => useEditor.getState().load(createProject("Test", "beispiel")));

  it("exposes JSON schemas for every tool", () => {
    const tools = anthropicTools();
    expect(tools.length).toBeGreaterThan(10);
    for (const t of tools) expect(t.input_schema.type).toBe("object");
  });

  it("reads the plan and furnishes a room", () => {
    const plan = JSON.parse(executeTool("get_plan", {}).result);
    const bad = plan.rooms.find((r: { name: string }) => r.name === "Bad");
    expect(bad.area_m2).toBeGreaterThan(8);
    const res = executeTool("stage_room", { room_id: bad.id, style: "modern" });
    expect(res.ok).toBe(true);
    const floor = useEditor.getState().project!.floors[0];
    expect(floor.items.some((i) => i.defId === "badewanne")).toBe(true);
  });

  it("rejects invalid input and unknown ids without changing the plan", () => {
    const before = useEditor.getState().project;
    expect(executeTool("place_furniture", { type_id: "sofa-3" }).ok).toBe(false);
    expect(executeTool("move_wall", { wall_id: "nope", offset: 1 }).ok).toBe(false);
    expect(executeTool("does_not_exist", {}).ok).toBe(false);
    expect(useEditor.getState().project).toBe(before);
  });

  it("places, moves and deletes furniture", () => {
    const placed = JSON.parse(executeTool("place_furniture", { type_id: "sofa-3", x: 3, y: 7, rotation: 0 }).result);
    expect(executeTool("move_furniture", { item_id: placed.item_id, x: 2, rotation: 90 }).ok).toBe(true);
    const item = useEditor.getState().project!.floors[0].items.find((i) => i.id === placed.item_id)!;
    expect([item.x, item.rotation]).toEqual([2, 90]);
    executeTool("delete_elements", { ids: [placed.item_id] });
    expect(useEditor.getState().project!.floors[0].items).toHaveLength(0);
  });
});
