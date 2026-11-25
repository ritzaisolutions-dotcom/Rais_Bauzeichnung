// Mutating operations on a Floor. Call them on a draft (immer) or a clone.
import { nanoid } from "nanoid";
import {
  add,
  dist,
  mul,
  nodeMap,
  norm,
  perp,
  projectToSegment,
  segmentIntersection,
  sub,
  syncRooms,
  wallEnds,
} from "./geometry";
import type { Floor, Opening, OpeningKind, Vec2, Wall, WallNode, WallType } from "./types";

export const uid = () => nanoid(10);

export const DEFAULT_WALL = {
  aussen: 0.36,
  innen: 0.115,
  tragend: 0.24,
} satisfies Record<WallType, number>;

export const NODE_SNAP = 0.02;

export function emptyFloor(name = "Erdgeschoss"): Floor {
  return {
    id: uid(),
    name,
    height: 2.6,
    nodes: [],
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    labels: [],
    dimensions: [],
  };
}

function findNodeNear(floor: Floor, p: Vec2, tol: number): WallNode | undefined {
  let best: WallNode | undefined;
  let bestD = tol;
  for (const n of floor.nodes) {
    const d = dist(n, p);
    if (d <= bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Splits a wall at point p (projected onto it). Returns the new node. */
export function splitWall(floor: Floor, wallId: string, p: Vec2): WallNode | null {
  const wall = floor.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const ends = wallEnds(floor, wall);
  if (!ends) return null;
  const proj = projectToSegment(p, ends.a, ends.b);
  const total = dist(ends.a, ends.b);
  const splitAt = proj.t * total;
  if (splitAt < NODE_SNAP || total - splitAt < NODE_SNAP) {
    const id = proj.t < 0.5 ? wall.a : wall.b;
    return floor.nodes.find((n) => n.id === id) ?? null;
  }
  const node: WallNode = { id: uid(), x: proj.point.x, y: proj.point.y };
  floor.nodes.push(node);
  const second: Wall = { ...wall, id: uid(), a: node.id, b: wall.b };
  wall.b = node.id;
  floor.walls.push(second);
  for (const o of floor.openings) {
    if (o.wallId !== wall.id) continue;
    if (o.offset > splitAt) {
      o.wallId = second.id;
      o.offset -= splitAt;
    }
  }
  return node;
}

/**
 * Returns a node at p: an existing node within tol, a new node splitting a wall
 * within tol, or a fresh free node.
 */
export function nodeAt(floor: Floor, p: Vec2, tol = NODE_SNAP): WallNode {
  const existing = findNodeNear(floor, p, tol);
  if (existing) return existing;
  const nodes = nodeMap(floor);
  for (const w of floor.walls) {
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const pr = projectToSegment(p, a, b);
    if (pr.distance <= tol && pr.t > 0 && pr.t < 1) {
      const n = splitWall(floor, w.id, pr.point);
      if (n) return n;
    }
  }
  const node: WallNode = { id: uid(), x: p.x, y: p.y };
  floor.nodes.push(node);
  return node;
}

export interface WallOptions {
  thickness?: number;
  height?: number;
  type?: WallType;
}

/**
 * Adds a wall from p1 to p2. Endpoints snap to nodes/walls, and the wall is
 * split wherever it crosses existing walls so the graph stays planar.
 * Returns the ids of the created wall segments.
 */
export function addWall(floor: Floor, p1: Vec2, p2: Vec2, opts: WallOptions = {}): string[] {
  if (dist(p1, p2) < NODE_SNAP * 2) return [];
  const type = opts.type ?? "innen";
  const thickness = opts.thickness ?? DEFAULT_WALL[type];
  const height = opts.height ?? floor.height;

  const n1 = nodeAt(floor, p1);
  const n2 = nodeAt(floor, p2);
  if (n1.id === n2.id) return [];

  // collect intersections with existing walls
  const nodes = nodeMap(floor);
  const cuts: { t: number; node: WallNode }[] = [];
  const a = { x: n1.x, y: n1.y };
  const b = { x: n2.x, y: n2.y };
  const total = dist(a, b);
  for (const w of floor.walls.slice()) {
    if (w.a === n1.id || w.b === n1.id || w.a === n2.id || w.b === n2.id) continue;
    const wa = nodes.get(w.a);
    const wb = nodes.get(w.b);
    if (!wa || !wb) continue;
    const hit = segmentIntersection(a, b, wa, wb);
    if (!hit) continue;
    if (hit.t * total < NODE_SNAP || (1 - hit.t) * total < NODE_SNAP) continue;
    const node = nodeAt(floor, hit.point);
    cuts.push({ t: hit.t, node });
  }
  // nodes lying exactly on the new segment (collinear endpoints of other walls)
  for (const n of floor.nodes) {
    if (n.id === n1.id || n.id === n2.id || cuts.some((c) => c.node.id === n.id)) continue;
    const pr = projectToSegment(n, a, b);
    if (pr.distance < NODE_SNAP && pr.t > 0 && pr.t < 1) cuts.push({ t: pr.t, node: n });
  }
  cuts.sort((m, n) => m.t - n.t);
  const chain = [n1, ...cuts.map((c) => c.node), n2];
  const created: string[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const from = chain[i];
    const to = chain[i + 1];
    if (from.id === to.id) continue;
    const dup = floor.walls.find((w) => (w.a === from.id && w.b === to.id) || (w.a === to.id && w.b === from.id));
    if (dup) continue;
    const wall: Wall = { id: uid(), a: from.id, b: to.id, thickness, height, type };
    floor.walls.push(wall);
    created.push(wall.id);
  }
  return created;
}

/** Adds a closed polygon of walls (e.g. a rectangular room). */
export function addPolygonWalls(floor: Floor, pts: Vec2[], opts: WallOptions = {}) {
  const ids: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    ids.push(...addWall(floor, pts[i], pts[(i + 1) % pts.length], opts));
  }
  return ids;
}

export function addRectRoom(floor: Floor, x: number, y: number, w: number, h: number, opts: WallOptions = {}) {
  return addPolygonWalls(
    floor,
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    opts,
  );
}

export function removeOrphanNodes(floor: Floor) {
  const used = new Set<string>();
  for (const w of floor.walls) {
    used.add(w.a);
    used.add(w.b);
  }
  floor.nodes = floor.nodes.filter((n) => used.has(n.id));
}

/** Merges a degree-2 node between two collinear walls of equal type. */
export function mergeCollinearAt(floor: Floor, nodeId: string) {
  const walls = floor.walls.filter((w) => w.a === nodeId || w.b === nodeId);
  if (walls.length !== 2) return;
  const [w1, w2] = walls;
  if (Math.abs(w1.thickness - w2.thickness) > 1e-6) return;
  const nodes = nodeMap(floor);
  const other1 = w1.a === nodeId ? w1.b : w1.a;
  const other2 = w2.a === nodeId ? w2.b : w2.a;
  const p = nodes.get(nodeId)!;
  const a = nodes.get(other1)!;
  const b = nodes.get(other2)!;
  const pr = projectToSegment(p, a, b);
  if (pr.distance > 1e-4) return;
  if (floor.openings.some((o) => o.wallId === w1.id || o.wallId === w2.id)) return;
  w1.a = other1;
  w1.b = other2;
  floor.walls = floor.walls.filter((w) => w.id !== w2.id);
  removeOrphanNodes(floor);
}

export function deleteWall(floor: Floor, wallId: string) {
  const wall = floor.walls.find((w) => w.id === wallId);
  if (!wall) return;
  floor.walls = floor.walls.filter((w) => w.id !== wallId);
  floor.openings = floor.openings.filter((o) => o.wallId !== wallId);
  removeOrphanNodes(floor);
  for (const id of [wall.a, wall.b]) {
    if (floor.nodes.some((n) => n.id === id)) mergeCollinearAt(floor, id);
  }
}

export function moveNode(floor: Floor, nodeId: string, p: Vec2) {
  const n = floor.nodes.find((x) => x.id === nodeId);
  if (!n) return;
  n.x = p.x;
  n.y = p.y;
  clampOpenings(floor);
}

/** Moves a wall parallel to itself; connected walls stretch along. */
export function moveWallParallel(floor: Floor, wallId: string, offset: number) {
  const wall = floor.walls.find((w) => w.id === wallId);
  if (!wall) return;
  const ends = wallEnds(floor, wall);
  if (!ends) return;
  const n = perp(norm(sub(ends.b, ends.a)));
  const delta = mul(n, offset);
  for (const id of [wall.a, wall.b]) {
    const node = floor.nodes.find((x) => x.id === id)!;
    node.x += delta.x;
    node.y += delta.y;
  }
  clampOpenings(floor);
}

/** Sets the length of a wall by moving its b node along the wall direction. */
export function setWallLength(floor: Floor, wallId: string, length: number) {
  const wall = floor.walls.find((w) => w.id === wallId);
  if (!wall || length <= 0.05) return;
  const ends = wallEnds(floor, wall);
  if (!ends) return;
  const d = norm(sub(ends.b, ends.a));
  const p = add(ends.a, mul(d, length));
  moveNode(floor, wall.b, p);
}

export function clampOpenings(floor: Floor) {
  const nodes = nodeMap(floor);
  for (const o of floor.openings) {
    const w = floor.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const e = wallEnds(floor, w, nodes);
    if (!e) continue;
    const L = dist(e.a, e.b);
    const half = o.width / 2;
    o.offset = Math.max(Math.min(half, L / 2), Math.min(o.offset, L - half));
  }
}

export const OPENING_DEFAULTS: Record<OpeningKind, Pick<Opening, "width" | "height" | "sill">> = {
  tuer: { width: 0.885, height: 2.01, sill: 0 },
  schiebetuer: { width: 1.01, height: 2.01, sill: 0 },
  durchgang: { width: 1.0, height: 2.1, sill: 0 },
  fenster: { width: 1.26, height: 1.385, sill: 0.875 },
  bodenfenster: { width: 2.01, height: 2.26, sill: 0 },
};

export function addOpening(
  floor: Floor,
  wallId: string,
  offset: number,
  kind: OpeningKind,
  overrides: Partial<Opening> = {},
): Opening | null {
  const w = floor.walls.find((x) => x.id === wallId);
  if (!w) return null;
  const o: Opening = {
    id: uid(),
    wallId,
    offset,
    kind,
    flipSide: false,
    flipHinge: false,
    ...OPENING_DEFAULTS[kind],
    ...overrides,
  };
  floor.openings.push(o);
  clampOpenings(floor);
  return o;
}

/** Recomputes the room list after any change to the wall graph. */
export function normalizeFloor(floor: Floor) {
  removeOrphanNodes(floor);
  floor.openings = floor.openings.filter((o) => floor.walls.some((w) => w.id === o.wallId));
  floor.rooms = syncRooms(floor, uid);
}

/** Finds the wall closest to p (within maxDist) and the offset of p along it. */
export function wallAtPoint(floor: Floor, p: Vec2, maxDist = 0.5) {
  const nodes = nodeMap(floor);
  let best: { wall: Wall; offset: number; distance: number; length: number } | null = null;
  for (const w of floor.walls) {
    const e = wallEnds(floor, w, nodes);
    if (!e) continue;
    const pr = projectToSegment(p, e.a, e.b);
    const length = dist(e.a, e.b);
    if (pr.distance <= maxDist && (!best || pr.distance < best.distance)) {
      best = { wall: w, offset: pr.t * length, distance: pr.distance, length };
    }
  }
  return best;
}

export function addOpeningAtPoint(floor: Floor, p: Vec2, kind: OpeningKind, overrides: Partial<Opening> = {}) {
  const hit = wallAtPoint(floor, p);
  if (!hit) return null;
  return addOpening(floor, hit.wall.id, hit.offset, kind, overrides);
}
