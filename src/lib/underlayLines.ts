// Finds wall axes in a construction drawing so tracing can snap onto them.
// Works on a grey/RGBA bitmap: filled (poché) walls become thick dark bands,
// outlined walls become pairs of thin parallel lines. Only horizontal and
// vertical walls are detected; everything is in image pixels.

export interface WallAxis {
  /** "h": runs along x at constant y; "v": runs along y at constant x. */
  dir: "h" | "v";
  /** Constant coordinate (y for "h", x for "v"), centre of the wall. */
  at: number;
  from: number;
  to: number;
  thickness: number;
}

export interface UnderlayLines {
  axes: WallAxis[];
  corners: { x: number; y: number; thickness: number }[];
}

export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** 1 for greyscale, 4 for RGBA. */
  channels?: 1 | 4;
}

interface Band {
  a0: number; // first line (row for "h")
  a1: number; // last line
  from: number;
  to: number;
  last: [number, number];
}

const DARK = 140;

function darkMask(b: Bitmap) {
  const ch = b.channels ?? 4;
  const m = new Uint8Array(b.width * b.height);
  for (let i = 0, j = 0; i < m.length; i++, j += ch) {
    const lum = ch === 1 ? b.data[j] : 0.299 * b.data[j] + 0.587 * b.data[j + 1] + 0.114 * b.data[j + 2];
    // transparent pixels count as paper
    m[i] = ch === 4 && b.data[j + 3] < 128 ? 0 : lum < DARK ? 1 : 0;
  }
  return m;
}

/** Long dark runs along one direction, grouped across neighbouring lines into bands. */
function bands(mask: Uint8Array, w: number, h: number, dir: "h" | "v", minRun: number): Band[] {
  const lines = dir === "h" ? h : w;
  const len = dir === "h" ? w : h;
  const at =
    dir === "h" ? (line: number, i: number) => mask[line * w + i] : (line: number, i: number) => mask[i * w + line];
  const open: Band[] = [];
  const done: Band[] = [];
  for (let line = 0; line < lines; line++) {
    const runs: [number, number][] = [];
    let s = -1;
    for (let i = 0; i <= len; i++) {
      const d = i < len && at(line, i);
      if (d && s < 0) s = i;
      else if (!d && s >= 0) {
        if (i - s >= minRun) runs.push([s, i - 1]);
        s = -1;
      }
    }
    const continued = new Set<Band>();
    for (const r of runs) {
      const b = open.find((o) => {
        if (continued.has(o) || o.a1 !== line - 1) return false;
        const ov = Math.min(o.last[1], r[1]) - Math.max(o.last[0], r[0]);
        return ov > 0.6 * Math.min(o.last[1] - o.last[0], r[1] - r[0]);
      });
      if (b) {
        b.a1 = line;
        b.from = Math.min(b.from, r[0]);
        b.to = Math.max(b.to, r[1]);
        b.last = r;
        continued.add(b);
      } else {
        const nb = { a0: line, a1: line, from: r[0], to: r[1], last: r };
        open.push(nb);
        continued.add(nb);
      }
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (!continued.has(open[i])) done.push(...open.splice(i, 1));
    }
  }
  return done.concat(open);
}

/**
 * @param ppm image pixels per meter (to judge wall thickness and minimum length)
 */
export function detectUnderlayLines(b: Bitmap, ppm: number): UnderlayLines {
  const mask = darkMask(b);
  const minRun = Math.max(12, Math.round(0.45 * ppm));
  const minWall = 0.05 * ppm; // thicker than this: a filled wall
  const maxWall = 0.65 * ppm;
  const axes: WallAxis[] = [];
  const thinByDir: Record<"h" | "v", Band[]> = { h: [], v: [] };
  for (const dir of ["h", "v"] as const) {
    for (const bd of bands(mask, b.width, b.height, dir, minRun)) {
      const t = bd.a1 - bd.a0 + 1;
      if (t >= minWall && t <= maxWall) {
        axes.push({ dir, at: (bd.a0 + bd.a1 + 1) / 2, from: bd.from, to: bd.to + 1, thickness: t });
      } else if (t < minWall) thinByDir[dir].push(bd);
    }
  }
  // A drawing uses one wall style. With filled walls, thin parallel lines are
  // furniture, stairs or dimensions, so only outline-style drawings get paired.
  if (axes.length < 4) {
    const maxPair = 0.5 * ppm;
    for (const dir of ["h", "v"] as const) {
      const thin = thinByDir[dir].sort((p, q) => p.a0 - q.a0);
      const used = new Set<Band>();
      for (const p of thin) {
        if (used.has(p)) continue;
        let best: Band | null = null;
        for (const q of thin) {
          if (q === p || used.has(q)) continue;
          const gap = q.a0 - p.a0;
          if (gap < minWall || gap > maxPair) continue;
          const ov = Math.min(p.to, q.to) - Math.max(p.from, q.from);
          if (ov < 0.6 * Math.min(p.to - p.from, q.to - q.from)) continue;
          if (!best || gap < best.a0 - p.a0) best = q;
        }
        if (!best) continue;
        used.add(p).add(best);
        const outer0 = p.a0;
        const outer1 = best.a1 + 1;
        axes.push({
          dir,
          at: (outer0 + outer1) / 2,
          from: Math.max(p.from, best.from),
          to: Math.min(p.to, best.to) + 1,
          thickness: outer1 - outer0,
        });
      }
    }
  }
  // corners where a horizontal and a vertical axis meet (within the wall thickness)
  const corners: UnderlayLines["corners"] = [];
  const hs = axes.filter((a) => a.dir === "h");
  const vs = axes.filter((a) => a.dir === "v");
  for (const hA of hs) {
    for (const vA of vs) {
      const tx = vA.thickness;
      const ty = hA.thickness;
      if (vA.at < hA.from - tx || vA.at > hA.to + tx) continue;
      if (hA.at < vA.from - ty || hA.at > vA.to + ty) continue;
      corners.push({ x: vA.at, y: hA.at, thickness: Math.max(tx, ty) });
    }
  }
  return { axes, corners };
}

/** Converts detected lines from image pixels (scaled by k) into world meters for an underlay. */
export function toWorldLines(
  lines: UnderlayLines,
  u: { x: number; y: number; pxPerMeter: number },
  k = 1,
): UnderlayLines {
  const s = 1 / (k * u.pxPerMeter);
  return {
    axes: lines.axes.map((a) => ({
      dir: a.dir,
      at: (a.dir === "h" ? u.y : u.x) + a.at * s,
      from: (a.dir === "h" ? u.x : u.y) + a.from * s,
      to: (a.dir === "h" ? u.x : u.y) + a.to * s,
      thickness: a.thickness * s,
    })),
    corners: lines.corners.map((c) => ({ x: u.x + c.x * s, y: u.y + c.y * s, thickness: c.thickness * s })),
  };
}

/**
 * Thickness of the drawn wall that a new wall from a to b follows (world meters),
 * or undefined if it does not run along a detected wall.
 */
export function thicknessAlong(
  a: { x: number; y: number },
  b: { x: number; y: number },
  axes: WallAxis[],
  tol = 0.03,
): number | undefined {
  const dir = Math.abs(a.y - b.y) < 1e-6 ? "h" : Math.abs(a.x - b.x) < 1e-6 ? "v" : null;
  if (!dir) return undefined;
  const at = dir === "h" ? a.y : a.x;
  const lo = Math.min(dir === "h" ? a.x : a.y, dir === "h" ? b.x : b.y);
  const hi = Math.max(dir === "h" ? a.x : a.y, dir === "h" ? b.x : b.y);
  let best: WallAxis | undefined;
  let bestCover = 0;
  for (const ax of axes) {
    if (ax.dir !== dir || Math.abs(ax.at - at) > tol) continue;
    // share of the new wall that lies on this drawn wall (openings split drawn walls)
    const cover = Math.min(hi, ax.to + ax.thickness) - Math.max(lo, ax.from - ax.thickness);
    if (cover > bestCover) {
      bestCover = cover;
      best = ax;
    }
  }
  return best && bestCover > 0.3 * (hi - lo) ? Math.round(best.thickness * 200) / 200 : undefined;
}
