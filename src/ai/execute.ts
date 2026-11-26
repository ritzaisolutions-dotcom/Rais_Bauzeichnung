"use client";

import { LIBRARY, findDef } from "@/furniture/catalog";
import { boundsOf, computeRoomGeometry, wallEnds, wallLength } from "@/model/geometry";
import { defaultMaterialFor, detectRoomType, STYLES } from "@/model/materials";
import {
  addOpening,
  addRectRoom,
  addWall,
  DEFAULT_WALL,
  deleteWall,
  moveWallParallel,
  setWallLength,
  uid,
} from "@/model/ops";
import { nameRoomAt } from "@/model/project";
import { doorClearances, itemsInRoom, kitchenHostRoom, stageRoom } from "@/model/staging";
import type { Floor } from "@/model/types";
import { useEditor } from "@/store/editor";
import { toolSchemas, type ToolName } from "./tools";

const r2 = (v: number) => Math.round(v * 100) / 100;

export function planSnapshot(floor: Floor, defs = useEditor.getState().project?.customFurniture ?? []) {
  const rooms = computeRoomGeometry(floor);
  return {
    floor: floor.name,
    units: "Meter, x nach rechts, y nach unten",
    rooms: rooms.map((r) => {
      const b = boundsOf(r.inner);
      return {
        id: r.meta.id,
        name: r.meta.name,
        type: r.meta.roomType ?? detectRoomType(r.meta.name),
        floor_material: r.meta.floorMaterial,
        area_m2: r2(r.area),
        target_area_m2: r.meta.targetArea,
        bounds: { minX: r2(b.minX), minY: r2(b.minY), maxX: r2(b.maxX), maxY: r2(b.maxY) },
        polygon: r.inner.map((p) => [r2(p.x), r2(p.y)]),
      };
    }),
    walls: floor.walls.map((w) => {
      const e = wallEnds(floor, w)!;
      return {
        id: w.id,
        a: [r2(e.a.x), r2(e.a.y)],
        b: [r2(e.b.x), r2(e.b.y)],
        length: r2(wallLength(floor, w)),
        thickness: w.thickness,
        type: w.type,
      };
    }),
    openings: floor.openings.map((o) => ({
      id: o.id,
      wall_id: o.wallId,
      kind: o.kind,
      position: r2(o.offset),
      width: o.width,
    })),
    furniture: floor.items.map((it) => ({
      id: it.id,
      type_id: it.defId,
      name: findDef(it.defId, defs)?.name,
      x: r2(it.x),
      y: r2(it.y),
      rotation: it.rotation,
      width: it.w,
      depth: it.d,
      color: it.color,
    })),
  };
}

/** Runs one tool call against the editor. Returns a JSON string for the tool_result. */
export function executeTool(name: string, rawInput: unknown): { ok: boolean; result: string } {
  if (!(name in toolSchemas)) return { ok: false, result: `Unbekanntes Werkzeug: ${name}` };
  const parsed = toolSchemas[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, result: `Ungültige Parameter: ${parsed.error.message}` };
  const input = parsed.data as Record<string, unknown>;
  const st = useEditor.getState();
  const floor = st.project?.floors.find((f) => f.id === st.floorId);
  if (!floor) return { ok: false, result: "Keine Etage geöffnet." };
  const custom = [...(st.project?.customFurniture ?? []), ...st.globalFurniture];
  const mutate = (fn: (f: Floor) => void, normalize = true) => st.mutate(fn, { history: false, normalize });
  const ok = (v: unknown) => ({ ok: true, result: typeof v === "string" ? v : JSON.stringify(v) });
  const fail = (msg: string) => ({ ok: false, result: msg });

  switch (name as ToolName) {
    case "get_plan":
      return ok(planSnapshot(floor, custom));
    case "list_furniture_types":
      return ok(
        [...custom, ...LIBRARY].map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          width: d.w,
          depth: d.d,
          height: d.h,
        })),
      );
    case "add_wall": {
      const i = input as {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        wall_type?: "aussen" | "innen" | "tragend" | "gelaender";
      };
      let ids: string[] = [];
      mutate((f) => {
        ids = addWall(f, { x: i.x1, y: i.y1 }, { x: i.x2, y: i.y2 }, { type: i.wall_type ?? "innen" });
      });
      return ok({ created_wall_ids: ids });
    }
    case "add_rect_room": {
      const i = input as {
        x: number;
        y: number;
        width: number;
        height: number;
        name?: string;
        wall_type?: "aussen" | "innen" | "tragend" | "gelaender";
      };
      mutate((f) => {
        addRectRoom(f, i.x, i.y, i.width, i.height, {
          type: i.wall_type ?? "innen",
          thickness: DEFAULT_WALL[i.wall_type ?? "innen"],
        });
      });
      if (i.name) mutate((f) => void nameRoomAt(f, { x: i.x + i.width / 2, y: i.y + i.height / 2 }, i.name!), false);
      return ok("Raum angelegt.");
    }
    case "move_wall": {
      const i = input as { wall_id: string; offset: number };
      if (!floor.walls.some((w) => w.id === i.wall_id)) return fail("Wand nicht gefunden.");
      mutate((f) => moveWallParallel(f, i.wall_id, i.offset));
      return ok("Wand verschoben.");
    }
    case "set_wall_length": {
      const i = input as { wall_id: string; length: number };
      if (!floor.walls.some((w) => w.id === i.wall_id)) return fail("Wand nicht gefunden.");
      mutate((f) => setWallLength(f, i.wall_id, i.length));
      return ok("Länge gesetzt.");
    }
    case "set_wall_thickness": {
      const i = input as { wall_id: string; thickness: number };
      if (!floor.walls.some((w) => w.id === i.wall_id)) return fail("Wand nicht gefunden.");
      mutate((f) => {
        f.walls.find((w) => w.id === i.wall_id)!.thickness = i.thickness;
      });
      return ok("Dicke gesetzt.");
    }
    case "delete_elements": {
      const ids = new Set((input as { ids: string[] }).ids);
      mutate((f) => {
        for (const w of f.walls.filter((x) => ids.has(x.id))) deleteWall(f, w.id);
        f.openings = f.openings.filter((x) => !ids.has(x.id));
        f.items = f.items.filter((x) => !ids.has(x.id));
        f.labels = f.labels.filter((x) => !ids.has(x.id));
        f.dimensions = f.dimensions.filter((x) => !ids.has(x.id));
      });
      return ok("Gelöscht.");
    }
    case "add_opening": {
      const i = input as { wall_id: string; kind: "tuer"; position: number; width?: number };
      if (!floor.walls.some((w) => w.id === i.wall_id)) return fail("Wand nicht gefunden.");
      let id = "";
      mutate((f) => {
        id = addOpening(f, i.wall_id, i.position, i.kind, i.width ? { width: i.width } : {})?.id ?? "";
      }, false);
      return ok({ opening_id: id });
    }
    case "update_room": {
      const i = input as {
        room_id: string;
        name?: string;
        room_type?: string;
        floor_material?: string;
        target_area?: number;
      };
      if (!floor.rooms.some((r) => r.id === i.room_id)) return fail("Raum nicht gefunden.");
      mutate((f) => {
        const m = f.rooms.find((r) => r.id === i.room_id)!;
        if (i.name) m.name = i.name;
        if (i.room_type) {
          m.roomType = i.room_type as typeof m.roomType;
          if (!i.floor_material) m.floorMaterial = defaultMaterialFor(m.roomType!);
        }
        if (i.floor_material) m.floorMaterial = i.floor_material as typeof m.floorMaterial;
        if (i.target_area !== undefined) m.targetArea = i.target_area > 0 ? i.target_area : undefined;
      }, false);
      return ok("Raum aktualisiert.");
    }
    case "place_furniture": {
      const i = input as {
        type_id: string;
        x: number;
        y: number;
        rotation?: number;
        color?: string;
        width?: number;
        depth?: number;
      };
      const def = findDef(i.type_id, custom);
      if (!def) return fail(`Möbeltyp ${i.type_id} unbekannt. list_furniture_types aufrufen.`);
      const id = uid();
      mutate((f) => {
        f.items.push({
          id,
          defId: def.id,
          x: i.x,
          y: i.y,
          rotation: (((i.rotation ?? 0) % 360) + 360) % 360,
          w: i.width ?? def.w,
          d: i.depth ?? def.d,
          h: def.h,
          color: i.color,
          elevation: def.elevation,
        });
      }, false);
      return ok({ item_id: id });
    }
    case "move_furniture": {
      const i = input as { item_id: string; x?: number; y?: number; rotation?: number; color?: string };
      if (!floor.items.some((x) => x.id === i.item_id)) return fail("Möbel nicht gefunden.");
      mutate((f) => {
        const it = f.items.find((x) => x.id === i.item_id)!;
        if (i.x !== undefined) it.x = i.x;
        if (i.y !== undefined) it.y = i.y;
        if (i.rotation !== undefined) it.rotation = ((i.rotation % 360) + 360) % 360;
        if (i.color !== undefined) it.color = i.color || undefined;
      }, false);
      return ok("Möbel aktualisiert.");
    }
    case "stage_room": {
      const i = input as { room_id: string; style?: keyof typeof STYLES; replace?: boolean };
      const room = computeRoomGeometry(floor).find((r) => r.meta.id === i.room_id);
      if (!room) return fail("Raum nicht gefunden.");
      let count = 0;
      mutate((f) => {
        if (i.replace !== false) {
          const ids = new Set(itemsInRoom(room, f.items).map((x) => x.id));
          f.items = f.items.filter((x) => !ids.has(x.id));
        }
        const addKitchen = kitchenHostRoom(computeRoomGeometry(f)) === room.meta.id;
        const added = stageRoom(room, f.items, i.style ?? "warm", custom, doorClearances(f), { addKitchen });
        count = added.length;
        f.items.push(...added);
      }, false);
      return ok(
        count ? `${count} Möbel platziert.` : "Für diesen Raumtyp gibt es keine Vorlage oder der Raum ist zu klein.",
      );
    }
    case "clear_furniture": {
      const i = input as { room_id?: string };
      if (!i.room_id) {
        mutate((f) => {
          f.items = [];
        }, false);
        return ok("Alle Möbel entfernt.");
      }
      const room = computeRoomGeometry(floor).find((r) => r.meta.id === i.room_id);
      if (!room) return fail("Raum nicht gefunden.");
      const ids = new Set(itemsInRoom(room, floor.items).map((x) => x.id));
      mutate((f) => {
        f.items = f.items.filter((x) => !ids.has(x.id));
      }, false);
      return ok(`${ids.size} Möbel entfernt.`);
    }
  }
}
