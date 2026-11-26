// Pure helpers for the AI import: crop rectangle, text filtering and the
// preview floor that is shown before anything touches the project.
import { computeRoomGeometry } from "@/model/geometry";
import { emptyFloor, normalizeFloor } from "@/model/ops";
import type { Floor, Underlay, Vec2 } from "@/model/types";
import { applyRecognisedPlan, applyUnderlayLabels } from "./applyPlan";
import type { RecognisedPlan } from "./planSchema";

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_CROP_PX = 80;

/** Rectangle from two drag points (image pixels), clamped to the image. Null if too small. */
export function cropFromDrag(a: Vec2, b: Vec2, width: number, height: number): Crop | null {
  const x1 = Math.max(0, Math.min(a.x, b.x));
  const y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(width, Math.max(a.x, b.x));
  const y2 = Math.min(height, Math.max(a.y, b.y));
  if (x2 - x1 < MIN_CROP_PX || y2 - y1 < MIN_CROP_PX) return null;
  return { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) };
}

/** PDF text items inside the crop, in the coordinates of the image sent to the AI. */
export function textForAi(items: { str: string; px: number; py: number }[], crop: Crop | null, factor: number) {
  const ox = crop?.x ?? 0;
  const oy = crop?.y ?? 0;
  return items
    .filter((t) => !crop || (t.px >= crop.x && t.px <= crop.x + crop.w && t.py >= crop.y && t.py <= crop.y + crop.h))
    .map((t) => ({ str: t.str.slice(0, 200), px: (t.px - ox) * factor, py: (t.py - oy) * factor }));
}

export interface RoomCheck {
  name: string;
  area: number;
  target?: number;
  /** Relative deviation from the target area, e.g. 0.04 for 4 %. */
  deviation?: number;
}

export interface ImportPreview {
  floor: Floor;
  rooms: RoomCheck[];
  walls: number;
  openings: number;
}

/** Builds the recognised plan on an empty floor so it can be shown and checked first. */
export function buildPreview(
  plan: RecognisedPlan,
  u: Underlay,
  k: number,
  offset: Vec2,
  height: number,
): ImportPreview {
  const floor = emptyFloor("Vorschau");
  floor.height = height;
  floor.underlay = u;
  applyRecognisedPlan(floor, plan, u, k, offset);
  normalizeFloor(floor);
  applyUnderlayLabels(floor);
  const rooms = computeRoomGeometry(floor).map((r) => ({
    name: r.meta.name,
    area: r.area,
    target: r.meta.targetArea,
    deviation: r.meta.targetArea ? (r.area - r.meta.targetArea) / r.meta.targetArea : undefined,
  }));
  return { floor, rooms, walls: floor.walls.length, openings: floor.openings.length };
}

/**
 * Puts the recognised plan into a real floor. "replace" clears the walls first,
 * "add" merges with the existing walls (shared corners snap together).
 */
export function commitRecognised(
  target: Floor,
  plan: RecognisedPlan,
  u: Underlay,
  k: number,
  offset: Vec2,
  mode: "replace" | "add",
) {
  if (mode === "replace") {
    target.nodes = [];
    target.walls = [];
    target.openings = [];
    target.rooms = [];
  }
  applyRecognisedPlan(target, plan, u, k, offset);
  normalizeFloor(target);
  applyUnderlayLabels(target);
}
