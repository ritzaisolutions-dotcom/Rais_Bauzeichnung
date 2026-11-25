import { add, dist, mul, nodeMap, norm, perp, sub } from "./geometry";
import type { Floor, Opening, Vec2, Wall } from "./types";

export interface WallFrame {
  wall: Wall;
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  normal: Vec2;
  length: number;
  /** Extension beyond node a / b so corners close cleanly. */
  extA: number;
  extB: number;
  openings: Opening[];
}

export function wallFrames(floor: Floor): WallFrame[] {
  const nodes = nodeMap(floor);
  const degree = new Map<string, number>();
  for (const w of floor.walls) {
    degree.set(w.a, (degree.get(w.a) ?? 0) + 1);
    degree.set(w.b, (degree.get(w.b) ?? 0) + 1);
  }
  const frames: WallFrame[] = [];
  for (const wall of floor.walls) {
    const na = nodes.get(wall.a);
    const nb = nodes.get(wall.b);
    if (!na || !nb) continue;
    const a = { x: na.x, y: na.y };
    const b = { x: nb.x, y: nb.y };
    const length = dist(a, b);
    if (length < 1e-6) continue;
    const dir = norm(sub(b, a));
    // half of the thickest other wall at the node, so the corner is filled
    const ext = (nodeId: string) => {
      if ((degree.get(nodeId) ?? 0) < 2) return 0;
      let m = 0;
      for (const o of floor.walls)
        if (o.id !== wall.id && (o.a === nodeId || o.b === nodeId)) m = Math.max(m, o.thickness / 2);
      return m;
    };
    frames.push({
      wall,
      a,
      b,
      dir,
      normal: perp(dir),
      length,
      extA: ext(wall.a),
      extB: ext(wall.b),
      openings: floor.openings.filter((o) => o.wallId === wall.id).sort((m, n) => m.offset - n.offset),
    });
  }
  return frames;
}

/** Solid intervals along the wall axis, from -extA to length+extB, minus openings. */
export function solidIntervals(f: WallFrame): [number, number][] {
  const out: [number, number][] = [];
  let cur = -f.extA;
  for (const o of f.openings) {
    const s = o.offset - o.width / 2;
    const e = o.offset + o.width / 2;
    if (s > cur + 1e-4) out.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (f.length + f.extB > cur + 1e-4) out.push([cur, f.length + f.extB]);
  return out;
}

/** Rectangle along the wall between s and e (meters along the axis) as polygon. */
export function wallRect(f: WallFrame, s: number, e: number, thickness = f.wall.thickness): Vec2[] {
  const p0 = add(f.a, mul(f.dir, s));
  const p1 = add(f.a, mul(f.dir, e));
  const h = thickness / 2;
  return [add(p0, mul(f.normal, h)), add(p1, mul(f.normal, h)), add(p1, mul(f.normal, -h)), add(p0, mul(f.normal, -h))];
}

export const pointAlong = (f: WallFrame, s: number, side = 0) => add(add(f.a, mul(f.dir, s)), mul(f.normal, side));
