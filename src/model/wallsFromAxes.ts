// Turns wall axes detected in a drawing (see lib/underlayLines) into editor walls:
// ends are pulled onto the centre line of the wall they run into, so corners and
// T-junctions close and rooms are found.
import type { WallAxis } from "@/lib/underlayLines";
import { addOpeningAtPoint, addWall, normalizeFloor } from "./ops";
import type { Floor, OpeningKind, Vec2, WallType } from "./types";

export interface DerivedWall {
  a: Vec2;
  b: Vec2;
  thickness: number;
  type: WallType;
}

export interface DerivedOpening {
  at: Vec2;
  width: number;
  kind: OpeningKind;
}

const typeFor = (t: number): WallType => (t >= 0.3 ? "aussen" : t >= 0.2 ? "tragend" : "innen");

/** Widest gap in a wall that is still read as a door or window. */
const MAX_OPENING = 2.6;

/**
 * Joins collinear pieces of the same wall across door and window gaps. Gaps where
 * another wall joins (T-junction in outline drawings) are closed without an opening.
 */
export function bridgeGaps(axes: WallAxis[]): { axes: WallAxis[]; openings: DerivedOpening[] } {
  const openings: DerivedOpening[] = [];
  const out: WallAxis[] = [];
  for (const dir of ["h", "v"] as const) {
    const list = axes
      .filter((a) => a.dir === dir)
      .sort((p, q) => p.at - q.at || p.from - q.from)
      .map((a) => ({ ...a }));
    const perp = axes.filter((a) => a.dir !== dir);
    const used = new Set<WallAxis>();
    for (const a of list) {
      if (used.has(a)) continue;
      used.add(a);
      const cur = a;
      for (;;) {
        const next = list
          .filter(
            (b) =>
              !used.has(b) &&
              Math.abs(b.at - cur.at) < 0.04 &&
              Math.abs(b.thickness - cur.thickness) < 0.05 &&
              b.from >= cur.from &&
              b.from - cur.to <= MAX_OPENING,
          )
          .sort((p, q) => p.from - q.from)[0];
        if (!next) break;
        used.add(next);
        const g0 = cur.to;
        const g1 = next.from;
        const joint = perp.some(
          (o) =>
            o.at > g0 - 0.02 &&
            o.at < g1 + 0.02 &&
            (Math.abs(o.from - cur.at) < cur.thickness + o.thickness ||
              Math.abs(o.to - cur.at) < cur.thickness + o.thickness),
        );
        if (g1 - g0 > 0.5 && !joint) {
          const mid = (g0 + g1) / 2;
          openings.push({
            at: dir === "h" ? { x: mid, y: cur.at } : { x: cur.at, y: mid },
            width: Math.round((g1 - g0) * 100) / 100,
            kind: cur.thickness >= 0.3 ? "fenster" : "tuer",
          });
        }
        cur.to = Math.max(cur.to, next.to);
      }
      out.push(cur);
    }
  }
  return { axes: out, openings };
}

export function wallsFromAxes(axes: WallAxis[], minLength = 0.3): DerivedWall[] {
  const out: DerivedWall[] = [];
  for (const ax of axes) {
    const perp = axes.filter((o) => o.dir !== ax.dir);
    const snapEnd = (end: number, sign: -1 | 1) => {
      // nearest crossing wall whose centre line lies within reach of this end
      let best: number | null = null;
      for (const o of perp) {
        if (ax.at < o.from - ax.thickness || ax.at > o.to + ax.thickness) continue;
        const reach = o.thickness / 2 + ax.thickness / 2 + 0.02;
        const d = (o.at - end) * sign;
        if (d > reach || d < -reach) continue;
        if (best === null || Math.abs(o.at - end) < Math.abs(best - end)) best = o.at;
      }
      return best ?? end;
    };
    const s = snapEnd(ax.from, -1);
    const e = snapEnd(ax.to, 1);
    if (e - s < minLength) continue;
    const pt = (v: number): Vec2 => (ax.dir === "h" ? { x: v, y: ax.at } : { x: ax.at, y: v });
    const thickness = Math.round(ax.thickness * 200) / 200;
    out.push({ a: pt(s), b: pt(e), thickness, type: typeFor(thickness) });
  }
  return out;
}

/** Adds derived walls (and openings) to a floor, merging with existing walls. Returns the wall count. */
export function addDerivedWalls(floor: Floor, walls: DerivedWall[], openings: DerivedOpening[] = []) {
  let n = 0;
  for (const w of walls) n += addWall(floor, w.a, w.b, { thickness: w.thickness, type: w.type }).length ? 1 : 0;
  normalizeFloor(floor);
  for (const o of openings) addOpeningAtPoint(floor, o.at, o.kind, { width: o.width });
  normalizeFloor(floor);
  return n;
}

/** Full pipeline: detected axes → bridged walls with openings → floor. */
export function deriveFromAxes(floor: Floor, axes: WallAxis[]) {
  const bridged = bridgeGaps(axes);
  const walls = wallsFromAxes(bridged.axes);
  const n = addDerivedWalls(floor, walls, bridged.openings);
  return { walls: n, openings: bridged.openings.length };
}
