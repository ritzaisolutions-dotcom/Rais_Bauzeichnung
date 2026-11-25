import type { Floor, RoomGeometry, RoomMeta, Vec2, Wall, WallNode } from "./types";

export const EPS = 1e-9;

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
/** Left-hand normal in y-down screen coordinates (rotate -90°). */
export const perp = (a: Vec2): Vec2 => ({ x: a.y, y: -a.x });
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export const polygonArea = (poly: Vec2[]) => Math.abs(signedArea(poly));

export function polygonPerimeter(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < EPS) {
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + EPS) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Returns a point guaranteed to be inside the polygon (centroid if possible). */
export function interiorPoint(poly: Vec2[]): Vec2 {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;
  // Horizontal scanline through the centroid: take the midpoint of the widest inside span.
  const ys = [c.y, ...poly.map((p) => p.y)];
  let best: { p: Vec2; w: number } | null = null;
  for (const yBase of ys) {
    const y = yBase + 1e-4;
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (!best || w > best.w) best = { p: { x: (xs[i] + xs[i + 1]) / 2, y }, w };
    }
  }
  return best?.p ?? c;
}

/** Projects p onto segment ab. Returns parameter t (clamped) and the projected point. */
export function projectToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = lerp(a, b, t);
  return { t, point, distance: dist(p, point) };
}

/** Intersection of segments p1p2 and p3p4 (proper or touching). */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2) {
  const r = sub(p2, p1);
  const s = sub(p4, p3);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = sub(p3, p1);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t, u, point: add(p1, mul(r, t)) };
}

function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-7) return null;
  const t = cross(sub(q, p), e) / denom;
  return add(p, mul(d, t));
}

/**
 * Offsets every edge of a polygon towards its inside by insets[i]
 * (edge i goes from poly[i] to poly[i+1]).
 */
export function insetPolygon(poly: Vec2[], insets: number[]): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.slice();
  const orientation = Math.sign(signedArea(poly)) || 1;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const d = norm(sub(q, p));
    // inward normal: for positive signed area (y-down, clockwise on screen) inward is -perp.
    const nrm = mul(perp(d), -orientation);
    return { p: add(p, mul(nrm, insets[i] ?? 0)), d, n: nrm };
  });
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const hit = lineIntersection(prev.p, prev.d, cur.p, cur.d);
    out.push(hit ?? add(poly[i], mul(cur.n, insets[i] ?? 0)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wall graph helpers

export function nodeMap(floor: Pick<Floor, "nodes">): Map<string, WallNode> {
  return new Map(floor.nodes.map((n) => [n.id, n]));
}

export function wallEnds(floor: Pick<Floor, "nodes">, wall: Wall, nodes = nodeMap(floor)) {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return null;
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
}

export function wallLength(floor: Pick<Floor, "nodes">, wall: Wall, nodes = nodeMap(floor)) {
  const e = wallEnds(floor, wall, nodes);
  return e ? dist(e.a, e.b) : 0;
}

type HalfEdge = { from: string; to: string; wall: Wall; angle: number };

/**
 * Finds the bounded faces of the planar wall graph. Each face is returned as a
 * list of node ids and the walls along its boundary.
 */
export function findFaces(floor: Pick<Floor, "nodes" | "walls">) {
  const nodes = nodeMap(floor);
  const out = new Map<string, HalfEdge[]>();
  for (const w of floor.walls) {
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b || w.a === w.b) continue;
    const ab: HalfEdge = { from: w.a, to: w.b, wall: w, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    const ba: HalfEdge = { from: w.b, to: w.a, wall: w, angle: Math.atan2(a.y - b.y, a.x - b.x) };
    if (!out.has(w.a)) out.set(w.a, []);
    if (!out.has(w.b)) out.set(w.b, []);
    out.get(w.a)!.push(ab);
    out.get(w.b)!.push(ba);
  }
  for (const list of out.values()) list.sort((m, n) => m.angle - n.angle);

  const key = (h: HalfEdge) => `${h.wall.id}:${h.from}`;
  const visited = new Set<string>();
  const faces: { nodeIds: string[]; walls: Wall[]; area: number }[] = [];

  for (const list of out.values()) {
    for (const start of list) {
      if (visited.has(key(start))) continue;
      const nodeIds: string[] = [];
      const walls: Wall[] = [];
      let h: HalfEdge = start;
      let guard = 0;
      while (!visited.has(key(h)) && guard++ < 10000) {
        visited.add(key(h));
        nodeIds.push(h.from);
        walls.push(h.wall);
        const around = out.get(h.to)!;
        const idx = around.findIndex((e) => e.wall.id === h.wall.id && e.to === h.from);
        // Next edge: the one just before the twin in angle order (turn as far as possible).
        h = around[(idx - 1 + around.length) % around.length];
      }
      const poly = nodeIds.map((id) => nodes.get(id)!);
      faces.push({ nodeIds, walls, area: signedArea(poly) });
    }
  }
  // With y-down coordinates and the "previous in angle order" rule, bounded faces
  // have positive signed area; the unbounded (outer) face of each component is negative.
  return faces.filter((f) => f.area > 1e-6);
}

export function computeRoomGeometry(floor: Floor): RoomGeometry[] {
  const nodes = nodeMap(floor);
  const faces = findFaces(floor);
  const result: RoomGeometry[] = [];
  const used = new Set<string>();
  for (const face of faces) {
    const { ids, ws } = cleanFace(face.nodeIds, face.walls);
    if (ids.length < 3) continue;
    const outline = ids.map((id) => {
      const n = nodes.get(id)!;
      return { x: n.x, y: n.y };
    });
    const inner = insetPolygon(
      outline,
      ws.map((w) => w.thickness / 2),
    );
    const area = polygonArea(inner);
    if (area < 0.2 || polygonArea(outline) < 0.3) continue;
    const meta = floor.rooms.find((r) => !used.has(r.id) && pointInPolygon(r.anchor, outline));
    if (!meta) continue;
    used.add(meta.id);
    result.push({
      meta,
      outline,
      inner,
      area,
      perimeter: polygonPerimeter(inner),
      centroid: interiorPoint(inner),
    });
  }
  return result;
}

/**
 * Removes spikes (dead-end walls reaching into a room) from a face boundary.
 * Edge i runs from ids[i] to ids[i+1] along ws[i].
 */
export function cleanFace(nodeIds: string[], walls: Wall[]) {
  let ids = nodeIds.slice();
  let ws = walls.slice();
  for (let guard = 0; guard < 1000 && ids.length >= 3; guard++) {
    const n = ids.length;
    let i = -1;
    for (let k = 0; k < n; k++) {
      if (ws[k].id === ws[(k + 1) % n].id) {
        i = k;
        break;
      }
    }
    if (i < 0) break;
    // rotate so the spike edge pair sits at 0 and 1, then drop the tip and its duplicate
    ids = [...ids.slice(i), ...ids.slice(0, i)];
    ws = [...ws.slice(i), ...ws.slice(0, i)];
    ids = [ids[0], ...ids.slice(3)];
    ws = ws.slice(2);
  }
  if (ids.length < 3) return { ids: [], ws: [] };
  return { ids, ws };
}

/**
 * Re-binds room metadata to the current faces: existing metadata keeps its face,
 * new faces get a fresh room, metadata without a face is dropped.
 */
export function syncRooms(floor: Floor, makeId: () => string): RoomMeta[] {
  const nodes = nodeMap(floor);
  const faces = findFaces(floor);
  const used = new Set<string>();
  const rooms: RoomMeta[] = [];
  let counter = floor.rooms.length;
  for (const face of faces) {
    const { ids, ws } = cleanFace(face.nodeIds, face.walls);
    if (ids.length < 3) continue;
    const outline = ids.map((id) => nodes.get(id)!).map((n) => ({ x: n.x, y: n.y }));
    if (polygonArea(outline) < 0.3) continue;
    const inner = insetPolygon(
      outline,
      ws.map((w) => w.thickness / 2),
    );
    const anchor = interiorPoint(inner.length >= 3 ? inner : outline);
    const existing = floor.rooms.find((r) => !used.has(r.id) && pointInPolygon(r.anchor, outline)) ?? null;
    if (existing) {
      used.add(existing.id);
      rooms.push({ ...existing, anchor });
    } else {
      counter++;
      rooms.push({
        id: makeId(),
        anchor,
        name: `Raum ${counter}`,
        floorMaterial: "parkett_eiche",
        roomType: "sonstiges",
      });
    }
  }
  return rooms;
}

export function boundsOf(points: Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function floorBounds(floor: Floor) {
  const pts: Vec2[] = floor.nodes.map((n) => ({ x: n.x, y: n.y }));
  for (const it of floor.items) {
    pts.push({ x: it.x - it.w / 2, y: it.y - it.d / 2 }, { x: it.x + it.w / 2, y: it.y + it.d / 2 });
  }
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 8, w: 10, h: 8 };
  return boundsOf(pts);
}

/** Corners of a rotated rectangle (furniture footprint). */
export function rectCorners(cx: number, cy: number, w: number, d: number, rotationDeg: number): Vec2[] {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

export function formatM(v: number, digits = 2) {
  return v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatArea(v: number) {
  return `${formatM(v, 2)} m²`;
}
