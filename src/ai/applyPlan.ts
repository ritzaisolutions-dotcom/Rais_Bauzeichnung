import { dist } from "@/model/geometry";
import { addOpeningAtPoint, addWall, DEFAULT_WALL, normalizeFloor } from "@/model/ops";
import { nameRoomAt } from "@/model/project";
import type { Floor, Underlay, Vec2 } from "@/model/types";
import type { RecognisedPlan } from "./planSchema";

/**
 * Converts a plan recognised in image pixels into walls, openings and rooms.
 * k converts AI-image pixels to underlay pixels; offset is the top-left corner of
 * the crop that was sent, in underlay pixels.
 */
export function applyRecognisedPlan(
  floor: Floor,
  plan: RecognisedPlan,
  u: Underlay,
  k: number,
  offset: Vec2 = { x: 0, y: 0 },
) {
  const toWorld = (x: number, y: number): Vec2 => ({
    x: u.x + (offset.x + x * k) / u.pxPerMeter,
    y: u.y + (offset.y + y * k) / u.pxPerMeter,
  });
  const toM = (px: number) => (px * k) / u.pxPerMeter;

  // cluster endpoints so corners meet exactly
  const anchors: Vec2[] = [];
  const tol = 0.12;
  const snap = (p: Vec2) => {
    const hit = anchors.find((a) => dist(a, p) < tol);
    if (hit) return hit;
    anchors.push(p);
    return p;
  };

  for (const w of plan.walls) {
    let a = toWorld(w.x1, w.y1);
    let b = toWorld(w.x2, w.y2);
    // straighten nearly orthogonal walls
    if (Math.abs(a.y - b.y) < 0.06 && Math.abs(a.x - b.x) > 0.3) {
      const y = (a.y + b.y) / 2;
      a = { ...a, y };
      b = { ...b, y };
    } else if (Math.abs(a.x - b.x) < 0.06 && Math.abs(a.y - b.y) > 0.3) {
      const x = (a.x + b.x) / 2;
      a = { ...a, x };
      b = { ...b, x };
    }
    a = snap(a);
    b = snap(b);
    const t = toM(w.thickness_px);
    const thickness = t > 0.04 && t < 0.8 ? Math.round(t * 200) / 200 : DEFAULT_WALL[w.type];
    addWall(floor, a, b, { type: w.type, thickness, height: floor.height });
  }
  normalizeFloor(floor);
  for (const o of plan.openings) {
    const width = toM(o.width_px);
    addOpeningAtPoint(
      floor,
      toWorld(o.x, o.y),
      o.kind,
      width > 0.4 && width < 6 ? { width: Math.round(width * 100) / 100 } : {},
    );
  }
  for (const r of plan.rooms) {
    nameRoomAt(floor, toWorld(r.x, r.y), r.name, r.area_m2 > 0 ? r.area_m2 : undefined);
  }
}

/** Uses the room labels from the PDF text layer to name the detected rooms. */
export function applyUnderlayLabels(floor: Floor) {
  let n = 0;
  for (const l of floor.underlay?.labels ?? []) {
    if (nameRoomAt(floor, { x: l.x, y: l.y }, l.name, l.area)) n++;
  }
  return n;
}
