// Living area under roof slopes (Wohnflächenverordnung, § 4): floor area with a
// clear height of at least 2 m counts fully, 1 to 2 m by half, below 1 m not at all.
// Balconies, loggias and terraces count by a quarter.
import { dist, dot, interiorPoint, polygonArea, projectToSegment, sub } from "./geometry";
import type { Floor, RoomGeometry, Vec2 } from "./types";
import { wallFrames, type WallFrame } from "./walls";

export interface SlopeSide {
  frame: WallFrame;
  /** Unit normal pointing into the room. */
  n: Vec2;
  /** A point on the wall's inner face. */
  face: Vec2;
  knee: number;
  /** tan(pitch) */
  rise: number;
}

/** Sloped walls that bound this room, with their inward direction. */
export function slopeSides(floor: Floor, room: RoomGeometry): SlopeSide[] {
  const out: SlopeSide[] = [];
  const inside = interiorPoint(room.inner);
  for (const f of wallFrames(floor)) {
    const slope = f.wall.slope;
    if (!slope) continue;
    const mid = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
    const onOutline = room.outline.some((p, i) => {
      const q = room.outline[(i + 1) % room.outline.length];
      return projectToSegment(mid, p, q).distance < 0.02 && dist(p, q) > 1e-6;
    });
    if (!onOutline) continue;
    const s = Math.sign(dot(sub(inside, f.a), f.normal)) || 1;
    const n = { x: f.normal.x * s, y: f.normal.y * s };
    const half = f.wall.thickness / 2;
    out.push({
      frame: f,
      n,
      face: { x: f.a.x + n.x * half, y: f.a.y + n.y * half },
      knee: slope.knee,
      rise: Math.tan((Math.min(Math.max(slope.angle, 1), 89) * Math.PI) / 180),
    });
  }
  return out;
}

/** Clear height at a point of the room (flat ceiling at the floor height). */
export function heightAt(sides: SlopeSide[], p: Vec2, ceiling: number) {
  let h = ceiling;
  for (const s of sides) h = Math.min(h, s.knee + s.rise * dot(sub(p, s.face), s.n));
  return h;
}

/** Keeps the part of the polygon where dot(n, p) >= c (Sutherland–Hodgman against one half-plane). */
export function clipHalfPlane(poly: Vec2[], n: Vec2, c: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = dot(a, n) - c;
    const db = dot(b, n) - c;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Part of the room where the clear height is at least h. */
function areaAtLeast(poly: Vec2[], sides: SlopeSide[], h: number) {
  let p = poly;
  for (const s of sides) {
    if (h <= s.knee) continue;
    p = clipHalfPlane(p, s.n, dot(s.face, s.n) + (h - s.knee) / s.rise);
    if (p.length < 3) return 0;
  }
  return polygonArea(p);
}

export interface AreaBreakdown {
  /** Floor area of the room (inner dimensions). */
  area: number;
  /** Area with clear height >= 2 m, 1–2 m, < 1 m. */
  full: number;
  half: number;
  none: number;
  /** Living area as counted by the WoFlV. */
  counted: number;
  sloped: boolean;
}

export function roomAreas(floor: Floor, room: RoomGeometry): AreaBreakdown {
  const area = room.area;
  if (room.meta.roomType === "balkon") {
    return { area, full: area, half: 0, none: 0, counted: area * 0.25, sloped: false };
  }
  const sides = slopeSides(floor, room);
  if (!sides.length) return { area, full: area, half: 0, none: 0, counted: area, sloped: false };
  const ceiling = floor.height;
  const a2 = ceiling >= 2 ? areaAtLeast(room.inner, sides, 2) : 0;
  const a1 = ceiling >= 1 ? areaAtLeast(room.inner, sides, 1) : 0;
  const full = Math.min(a2, area);
  const half = Math.max(0, Math.min(a1, area) - full);
  const none = Math.max(0, area - full - half);
  return { area, full, half, none, counted: full + half / 2, sloped: true };
}

export function livingArea(floor: Floor, rooms: RoomGeometry[]) {
  return rooms.reduce((s, r) => s + roomAreas(floor, r).counted, 0);
}
