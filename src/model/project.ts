import { pointInPolygon } from "./geometry";
import { defaultMaterialFor, detectRoomType } from "./materials";
import { addOpeningAtPoint, addRectRoom, addWall, emptyFloor, normalizeFloor, uid } from "./ops";
import { computeRoomGeometry } from "./geometry";
import type { Floor, Project, Vec2 } from "./types";

export function createProject(name: string, template: "leer" | "beispiel" = "leer"): Project {
  const floor = template === "beispiel" ? sampleFloor() : emptyFloor("Erdgeschoss");
  const now = Date.now();
  return { id: uid(), name, floors: [floor], customFurniture: [], createdAt: now, updatedAt: now };
}

/** Names the room that contains point p and derives its type and floor material. */
export function nameRoomAt(floor: Floor, p: Vec2, name: string, targetArea?: number) {
  const geo = computeRoomGeometry(floor).find((r) => pointInPolygon(p, r.outline));
  if (!geo) return false;
  const meta = floor.rooms.find((r) => r.id === geo.meta.id)!;
  meta.name = name;
  meta.roomType = detectRoomType(name);
  meta.floorMaterial = defaultMaterialFor(meta.roomType);
  if (targetArea !== undefined) meta.targetArea = targetArea;
  return true;
}

/** A 3-room sample apartment so a new user can try every tool right away. */
export function sampleFloor(): Floor {
  const f = emptyFloor("1. OG");
  addRectRoom(f, 0, 0, 12, 9, { type: "aussen", thickness: 0.36 });
  const inner = { type: "innen" as const, thickness: 0.115 };
  addWall(f, { x: 0, y: 4 }, { x: 12, y: 4 }, { type: "tragend", thickness: 0.24 });
  addWall(f, { x: 4, y: 0 }, { x: 4, y: 4 }, inner);
  addWall(f, { x: 7, y: 0 }, { x: 7, y: 4 }, inner);
  addWall(f, { x: 4, y: 5.5 }, { x: 12, y: 5.5 }, inner);
  addWall(f, { x: 4, y: 4 }, { x: 4, y: 5.5 }, inner);
  addWall(f, { x: 8, y: 5.5 }, { x: 8, y: 9 }, inner);
  addWall(f, { x: 10, y: 5.5 }, { x: 10, y: 9 }, inner);

  addOpeningAtPoint(f, { x: 2.2, y: 4 }, "tuer");
  addOpeningAtPoint(f, { x: 5.5, y: 4 }, "tuer", { flipSide: true });
  addOpeningAtPoint(f, { x: 8.6, y: 4 }, "tuer", { flipSide: true });
  addOpeningAtPoint(f, { x: 9, y: 5.5 }, "tuer");
  addOpeningAtPoint(f, { x: 11, y: 5.5 }, "tuer");
  addOpeningAtPoint(f, { x: 4, y: 4.75 }, "durchgang", { width: 1.2 });
  addOpeningAtPoint(f, { x: 12, y: 4.75 }, "tuer", { width: 1.01, flipSide: true });

  addOpeningAtPoint(f, { x: 2, y: 0 }, "fenster");
  addOpeningAtPoint(f, { x: 5.5, y: 0 }, "fenster", { width: 0.885 });
  addOpeningAtPoint(f, { x: 8.6, y: 0 }, "fenster");
  addOpeningAtPoint(f, { x: 10.8, y: 0 }, "fenster", { width: 1.01 });
  addOpeningAtPoint(f, { x: 2, y: 9 }, "fenster", { width: 1.51 });
  addOpeningAtPoint(f, { x: 5.5, y: 9 }, "bodenfenster", { width: 2.51 });
  addOpeningAtPoint(f, { x: 0, y: 6.8 }, "fenster");
  addOpeningAtPoint(f, { x: 12, y: 7.2 }, "fenster", { width: 0.76 });

  normalizeFloor(f);
  nameRoomAt(f, { x: 2, y: 2 }, "Zimmer");
  nameRoomAt(f, { x: 5.5, y: 2 }, "Bad");
  nameRoomAt(f, { x: 9.5, y: 2 }, "Schlafen");
  nameRoomAt(f, { x: 8, y: 4.75 }, "Flur");
  nameRoomAt(f, { x: 3, y: 7 }, "Wohnen / Essen");
  nameRoomAt(f, { x: 9, y: 7 }, "WC");
  nameRoomAt(f, { x: 11, y: 7 }, "HWR");
  return f;
}
