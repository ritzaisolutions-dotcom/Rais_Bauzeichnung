// Editing helpers without React: marquee selection, clipboard, furniture
// snapping to walls and collision checks. All coordinates in meters.
import { dist, dot, nodeMap, rectCorners, sub } from "./geometry";
import { addOpeningAtPoint, addWall, uid } from "./ops";
import { solidIntervals, wallFrames, wallRect } from "./walls";
import type { Dimension, Floor, FurnitureItem, Opening, TextLabel, Vec2, WallType } from "./types";

export interface Sel {
  kind: "wall" | "node" | "opening" | "room" | "item" | "label" | "dimension";
  id: string;
}

// ---------------------------------------------------------------- marquee

/** Everything fully inside the rectangle spanned by a and b. */
export function selectInRect(floor: Floor, a: Vec2, b: Vec2): Sel[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const inside = (p: Vec2) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const out: Sel[] = [];
  const nodes = nodeMap(floor);
  for (const w of floor.walls) {
    const na = nodes.get(w.a);
    const nb = nodes.get(w.b);
    if (na && nb && inside(na) && inside(nb)) out.push({ kind: "wall", id: w.id });
  }
  for (const it of floor.items) {
    if (rectCorners(it.x, it.y, it.w, it.d, it.rotation).every(inside)) out.push({ kind: "item", id: it.id });
  }
  for (const l of floor.labels) if (inside(l)) out.push({ kind: "label", id: l.id });
  for (const d of floor.dimensions) if (inside(d.a) && inside(d.b)) out.push({ kind: "dimension", id: d.id });
  return out;
}

// ---------------------------------------------------------------- clipboard

export interface Clip {
  sourceFloorId: string;
  walls: { a: Vec2; b: Vec2; thickness: number; height: number; type: WallType }[];
  openings: { at: Vec2; opening: Omit<Opening, "id" | "wallId" | "offset"> }[];
  items: Omit<FurnitureItem, "id">[];
  labels: Omit<TextLabel, "id">[];
  dimensions: Omit<Dimension, "id">[];
}

export function copySelection(floor: Floor, selection: Sel[]): Clip | null {
  const ids = (k: Sel["kind"]) => new Set(selection.filter((s) => s.kind === k).map((s) => s.id));
  const wallIds = ids("wall");
  const itemIds = ids("item");
  const labelIds = ids("label");
  const dimIds = ids("dimension");
  const openingIds = ids("opening");
  const nodes = nodeMap(floor);
  const clip: Clip = { sourceFloorId: floor.id, walls: [], openings: [], items: [], labels: [], dimensions: [] };
  for (const w of floor.walls) {
    if (!wallIds.has(w.id)) continue;
    const a = nodes.get(w.a)!;
    const b = nodes.get(w.b)!;
    clip.walls.push({
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      thickness: w.thickness,
      height: w.height,
      type: w.type,
    });
    const len = dist(a, b);
    // openings travel with their wall
    for (const o of floor.openings) {
      if (o.wallId !== w.id) continue;
      const t = o.offset / len;
      clip.openings.push({ at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, opening: openingProps(o) });
    }
  }
  // openings copied without their wall can only be pasted onto a wall at the same spot
  for (const o of floor.openings) {
    if (!openingIds.has(o.id) || wallIds.has(o.wallId)) continue;
    const w = floor.walls.find((x) => x.id === o.wallId);
    const a = w && nodes.get(w.a);
    const b = w && nodes.get(w.b);
    if (!a || !b) continue;
    const t = o.offset / dist(a, b);
    clip.openings.push({ at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, opening: openingProps(o) });
  }
  for (const it of floor.items) if (itemIds.has(it.id)) clip.items.push(strip(it));
  for (const l of floor.labels) if (labelIds.has(l.id)) clip.labels.push(strip(l));
  for (const d of floor.dimensions) if (dimIds.has(d.id)) clip.dimensions.push(strip(d));
  const n = clip.walls.length + clip.openings.length + clip.items.length + clip.labels.length + clip.dimensions.length;
  return n ? clip : null;
}

function strip<T extends { id: string }>(o: T): Omit<T, "id"> {
  const copy: Partial<T> = structuredClone(o);
  delete copy.id;
  return copy as Omit<T, "id">;
}

const openingProps = (o: Opening): Clip["openings"][number]["opening"] => ({
  width: o.width,
  height: o.height,
  sill: o.sill,
  kind: o.kind,
  flipSide: o.flipSide,
  flipHinge: o.flipHinge,
});

/** Inserts the clip shifted by offset and returns the new selection. Room re-detection is left to the caller. */
export function pasteClip(floor: Floor, clip: Clip, offset: Vec2): Sel[] {
  const mv = (p: Vec2) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const sel: Sel[] = [];
  for (const w of clip.walls) {
    for (const id of addWall(floor, mv(w.a), mv(w.b), { thickness: w.thickness, height: w.height, type: w.type })) {
      sel.push({ kind: "wall", id });
    }
  }
  for (const o of clip.openings) {
    const made = addOpeningAtPoint(floor, mv(o.at), o.opening.kind, o.opening);
    if (made) sel.push({ kind: "opening", id: made.id });
  }
  for (const it of clip.items) {
    const id = uid();
    floor.items.push({ ...structuredClone(it), ...mv(it), id });
    sel.push({ kind: "item", id });
  }
  for (const l of clip.labels) {
    const id = uid();
    floor.labels.push({ ...structuredClone(l), ...mv(l), id });
    sel.push({ kind: "label", id });
  }
  for (const d of clip.dimensions) {
    const id = uid();
    floor.dimensions.push({ ...structuredClone(d), a: mv(d.a), b: mv(d.b), id });
    sel.push({ kind: "dimension", id });
  }
  return sel;
}

// ---------------------------------------------------------------- furniture and walls

/** Rotation (degrees, clockwise) that turns the item's front (+y) towards n. */
const rotationFacing = (n: Vec2) => ((((Math.atan2(-n.x, n.y) * 180) / Math.PI) % 360) + 360) % 360;

/**
 * Moves an item at pos so its back touches a nearby wall face and turns it to face
 * into the room. Returns null if no wall face is within tol.
 */
export function snapItemToWall(
  floor: Floor,
  item: Pick<FurnitureItem, "w" | "d" | "rotation">,
  pos: Vec2,
  tol = 0.2,
): { x: number; y: number; rotation: number } | null {
  let best: { x: number; y: number; rotation: number; gap: number } | null = null;
  for (const f of wallFrames(floor)) {
    for (const side of [1, -1]) {
      const n = { x: f.normal.x * side, y: f.normal.y * side };
      const face = { x: f.a.x + n.x * (f.wall.thickness / 2), y: f.a.y + n.y * (f.wall.thickness / 2) };
      const rot = rotationFacing(n);
      // prefer keeping the current orientation class: depth along n if turned to face n
      const s = dot(sub(pos, face), n);
      const gap = s - item.d / 2;
      if (Math.abs(gap) > tol) continue;
      const along = dot(sub(pos, f.a), f.dir);
      // the item must lie mostly in front of a solid part of the wall
      const half = item.w / 2;
      const solid = solidIntervals(f).some(([s0, e0]) => along - half * 0.5 >= s0 && along + half * 0.5 <= e0);
      if (!solid) continue;
      if (best && Math.abs(gap) >= Math.abs(best.gap)) continue;
      best = { x: pos.x - n.x * gap, y: pos.y - n.y * gap, rotation: rot, gap };
    }
  }
  return best && { x: best.x, y: best.y, rotation: best.rotation };
}

// separating axis test for two convex polygons (shrunk slightly to allow touching)
function overlaps(p: Vec2[], q: Vec2[]) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ax = { x: -(b.y - a.y), y: b.x - a.x };
      let pMin = Infinity;
      let pMax = -Infinity;
      let qMin = Infinity;
      let qMax = -Infinity;
      for (const v of p) {
        const d = dot(v, ax);
        pMin = Math.min(pMin, d);
        pMax = Math.max(pMax, d);
      }
      for (const v of q) {
        const d = dot(v, ax);
        qMin = Math.min(qMin, d);
        qMax = Math.max(qMax, d);
      }
      if (pMax <= qMin || qMax <= pMin) return false;
    }
  }
  return true;
}

const SLACK = 0.01;

/** Items that overlap a wall or another item at the same height (rugs are ignored). */
export function collidingItems(floor: Floor): Set<string> {
  const out = new Set<string>();
  const solid = floor.items.filter((it) => it.h >= 0.05);
  const poly = new Map(
    solid.map((it) => [
      it.id,
      rectCorners(it.x, it.y, Math.max(0, it.w - SLACK * 2), Math.max(0, it.d - SLACK * 2), it.rotation),
    ]),
  );
  for (let i = 0; i < solid.length; i++) {
    const a = solid[i];
    const az0 = a.elevation ?? 0;
    for (let j = i + 1; j < solid.length; j++) {
      const b = solid[j];
      const bz0 = b.elevation ?? 0;
      if (az0 + a.h <= bz0 + SLACK || bz0 + b.h <= az0 + SLACK) continue;
      if (overlaps(poly.get(a.id)!, poly.get(b.id)!)) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  // building parts (chimneys, columns, radiators) may sit in or on walls
  const loose = solid.filter((it) => !it.defId.startsWith("bau-"));
  for (const f of wallFrames(floor)) {
    if (f.wall.type === "gelaender") continue;
    for (const [s, e] of solidIntervals(f)) {
      const r = wallRect(f, s, e);
      for (const it of loose) if (!out.has(it.id) && overlaps(poly.get(it.id)!, r)) out.add(it.id);
    }
  }
  return out;
}
