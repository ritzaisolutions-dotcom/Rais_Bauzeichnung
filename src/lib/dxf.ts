// DXF exchange. Export: AutoCAD R12 ASCII in millimetres with one layer per kind
// of element. Import: lines, polylines, arcs, circles, texts and blocks are
// flattened into plan geometry (meters, y downwards like the editor).
import DxfParser from "dxf-parser";
import { computeRoomGeometry, formatM, rectCorners } from "@/model/geometry";
import type { Floor, Vec2 } from "@/model/types";
import { pointAlong, solidIntervals, wallFrames, wallRect } from "@/model/walls";

// ------------------------------------------------------------------ export

const LAYERS: [string, number][] = [
  ["WAENDE", 7],
  ["GELAENDER", 8],
  ["OEFFNUNGEN", 4],
  ["RAEUME", 3],
  ["MOEBEL", 9],
  ["MASSE", 1],
];

class DxfWriter {
  private out: string[] = [];
  pair(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? fmt(value) : value);
  }
  text() {
    return this.out.join("\n") + "\n";
  }
}

const fmt = (v: number) => (Math.abs(v) < 1e-9 ? "0" : String(Math.round(v * 1000) / 1000));
/** Plan meters (y down) → DXF millimetres (y up). */
const P = (p: Vec2): [number, number] => [p.x * 1000, -p.y * 1000];

export function floorToDxf(floor: Floor): string {
  const w = new DxfWriter();
  w.pair(0, "SECTION");
  w.pair(2, "HEADER");
  w.pair(9, "$ACADVER");
  w.pair(1, "AC1009");
  w.pair(9, "$INSUNITS");
  w.pair(70, 4);
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "TABLES");
  w.pair(0, "TABLE");
  w.pair(2, "LTYPE");
  w.pair(70, 1);
  w.pair(0, "LTYPE");
  w.pair(2, "CONTINUOUS");
  w.pair(70, 0);
  w.pair(3, "Solid line");
  w.pair(72, 65);
  w.pair(73, 0);
  w.pair(40, 0);
  w.pair(0, "ENDTAB");
  w.pair(0, "TABLE");
  w.pair(2, "LAYER");
  w.pair(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    w.pair(0, "LAYER");
    w.pair(2, name);
    w.pair(70, 0);
    w.pair(62, color);
    w.pair(6, "CONTINUOUS");
  }
  w.pair(0, "ENDTAB");
  w.pair(0, "ENDSEC");

  w.pair(0, "SECTION");
  w.pair(2, "ENTITIES");
  const line = (layer: string, a: Vec2, b: Vec2) => {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    w.pair(0, "LINE");
    w.pair(8, layer);
    w.pair(10, x1);
    w.pair(20, y1);
    w.pair(30, 0);
    w.pair(11, x2);
    w.pair(21, y2);
    w.pair(31, 0);
  };
  const poly = (layer: string, pts: Vec2[]) => {
    w.pair(0, "POLYLINE");
    w.pair(8, layer);
    w.pair(66, 1);
    w.pair(10, 0);
    w.pair(20, 0);
    w.pair(30, 0);
    w.pair(70, 1);
    for (const p of pts) {
      const [x, y] = P(p);
      w.pair(0, "VERTEX");
      w.pair(8, layer);
      w.pair(10, x);
      w.pair(20, y);
      w.pair(30, 0);
    }
    w.pair(0, "SEQEND");
    w.pair(8, layer);
  };
  const text = (layer: string, at: Vec2, height: number, s: string) => {
    const [x, y] = P(at);
    w.pair(0, "TEXT");
    w.pair(8, layer);
    w.pair(10, x);
    w.pair(20, y);
    w.pair(30, 0);
    w.pair(40, height * 1000);
    w.pair(1, s);
    w.pair(72, 1); // centred
    w.pair(11, x);
    w.pair(21, y);
    w.pair(31, 0);
  };
  const arc = (layer: string, c: Vec2, r: number, from: Vec2, to: Vec2) => {
    const [cx, cy] = P(c);
    const ang = (p: Vec2) => {
      const [x, y] = P(p);
      return ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360;
    };
    let a0 = ang(from);
    let a1 = ang(to);
    // DXF arcs run counter-clockwise; keep the short (≤ 180°) one
    if ((a1 - a0 + 360) % 360 > 180) [a0, a1] = [a1, a0];
    w.pair(0, "ARC");
    w.pair(8, layer);
    w.pair(10, cx);
    w.pair(20, cy);
    w.pair(30, 0);
    w.pair(40, r * 1000);
    w.pair(50, a0);
    w.pair(51, a1);
  };

  for (const f of wallFrames(floor)) {
    const layer = f.wall.type === "gelaender" ? "GELAENDER" : "WAENDE";
    for (const [s, e] of solidIntervals(f)) poly(layer, wallRect(f, s, e));
    const t = f.wall.thickness;
    for (const o of f.openings) {
      const s = o.offset - o.width / 2;
      const e = o.offset + o.width / 2;
      // reveals
      line("OEFFNUNGEN", pointAlong(f, s, t / 2), pointAlong(f, s, -t / 2));
      line("OEFFNUNGEN", pointAlong(f, e, t / 2), pointAlong(f, e, -t / 2));
      if (o.kind === "fenster" || o.kind === "bodenfenster") {
        line("OEFFNUNGEN", pointAlong(f, s, 0.02), pointAlong(f, e, 0.02));
        line("OEFFNUNGEN", pointAlong(f, s, -0.02), pointAlong(f, e, -0.02));
      } else if (o.kind === "tuer") {
        const side = o.flipSide ? -1 : 1;
        const hingeS = o.flipHinge ? e : s;
        const otherS = o.flipHinge ? s : e;
        const hinge = pointAlong(f, hingeS, (side * t) / 2);
        const other = pointAlong(f, otherS, (side * t) / 2);
        const tip = { x: hinge.x + f.normal.x * side * o.width, y: hinge.y + f.normal.y * side * o.width };
        line("OEFFNUNGEN", hinge, tip);
        arc("OEFFNUNGEN", hinge, o.width, tip, other);
      } else if (o.kind === "schiebetuer") {
        const side = o.flipSide ? -1 : 1;
        line("OEFFNUNGEN", pointAlong(f, s, side * (t / 2 + 0.03)), pointAlong(f, e, side * (t / 2 + 0.03)));
      }
    }
  }
  for (const r of computeRoomGeometry(floor)) {
    text("RAEUME", { x: r.centroid.x, y: r.centroid.y - 0.12 }, 0.2, r.meta.name);
    text("RAEUME", { x: r.centroid.x, y: r.centroid.y + 0.18 }, 0.15, `${formatM(r.area)} m2`);
  }
  for (const it of floor.items) poly("MOEBEL", rectCorners(it.x, it.y, it.w, it.d, it.rotation));
  for (const d of floor.dimensions) line("MASSE", d.a, d.b);
  for (const l of floor.labels) text("RAEUME", l, Math.max(0.1, l.size), l.text);
  w.pair(0, "ENDSEC");
  w.pair(0, "EOF");
  return w.text();
}

// ------------------------------------------------------------------ import

export interface DxfGeometry {
  segments: [Vec2, Vec2][];
  texts: { str: string; x: number; y: number; height: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Meters per drawing unit that was used. */
  unit: number;
  unitLabel: string;
}

const UNITS: Record<number, [number, string]> = {
  1: [0.0254, "Zoll"],
  4: [0.001, "mm"],
  5: [0.01, "cm"],
  6: [1, "m"],
};

type AnyEntity = Record<string, unknown> & { type: string };
type Tf = (x: number, y: number) => Vec2;

export class DwgError extends Error {}

export function parseDxf(text: string): DxfGeometry {
  const parsed = new DxfParser().parseSync(text) as unknown as {
    header?: Record<string, unknown>;
    entities: AnyEntity[];
    blocks?: Record<string, { entities?: AnyEntity[]; position?: { x: number; y: number } }>;
  } | null;
  if (!parsed) throw new Error("Die DXF-Datei ist leer oder beschädigt.");
  const raw: { segs: [Vec2, Vec2][]; texts: DxfGeometry["texts"] } = { segs: [], texts: [] };
  const identity: Tf = (x, y) => ({ x, y });

  const walk = (entities: AnyEntity[], tf: Tf, scale: number, depth: number) => {
    for (const e of entities) {
      if (e.layer && /^(defpoints)$/i.test(String(e.layer))) continue;
      switch (e.type) {
        case "LINE": {
          const v = e.vertices as { x: number; y: number }[];
          if (v?.length >= 2) raw.segs.push([tf(v[0].x, v[0].y), tf(v[1].x, v[1].y)]);
          break;
        }
        case "LWPOLYLINE":
        case "POLYLINE": {
          const v = (e.vertices as { x: number; y: number; bulge?: number }[]) ?? [];
          const n = v.length;
          for (let i = 0; i < (e.shape ? n : n - 1); i++) {
            const a = v[i];
            const b = v[(i + 1) % n];
            if (a.bulge) {
              // arc segment: bulge = tan(angle / 4)
              const ang = 4 * Math.atan(a.bulge);
              const chord = Math.hypot(b.x - a.x, b.y - a.y);
              const r = chord / (2 * Math.sin(ang / 2));
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              const h = r * Math.cos(ang / 2);
              const nx = -(b.y - a.y) / chord;
              const ny = (b.x - a.x) / chord;
              const cx = mx + nx * h;
              const cy = my + ny * h;
              const a0 = Math.atan2(a.y - cy, a.x - cx);
              pushArc(raw.segs, tf, cx, cy, Math.abs(r), a0, a0 + ang);
            } else raw.segs.push([tf(a.x, a.y), tf(b.x, b.y)]);
          }
          break;
        }
        case "ARC": {
          const c = e.center as { x: number; y: number };
          let a1 = e.endAngle as number;
          const a0 = e.startAngle as number;
          if (a1 < a0) a1 += Math.PI * 2;
          pushArc(raw.segs, tf, c.x, c.y, e.radius as number, a0, a1);
          break;
        }
        case "CIRCLE": {
          const c = e.center as { x: number; y: number };
          pushArc(raw.segs, tf, c.x, c.y, e.radius as number, 0, Math.PI * 2);
          break;
        }
        case "TEXT":
        case "MTEXT": {
          const p = (e.startPoint ?? e.position) as { x: number; y: number } | undefined;
          const str = String(e.text ?? "")
            .replace(/\\P/g, " ")
            .replace(/\\[A-Za-z][^;]*;/g, "")
            .replace(/[{}]/g, "")
            .trim();
          if (p && str) {
            const q = tf(p.x, p.y);
            raw.texts.push({ str, x: q.x, y: q.y, height: ((e.textHeight ?? e.height ?? 2.5) as number) * scale });
          }
          break;
        }
        case "INSERT": {
          if (depth > 4) break;
          const block = parsed.blocks?.[e.name as string];
          if (!block?.entities) break;
          const pos = e.position as { x: number; y: number };
          const sx = (e.xScale as number) ?? 1;
          const sy = (e.yScale as number) ?? 1;
          const rot = (((e.rotation as number) ?? 0) * Math.PI) / 180;
          const base = block.position ?? { x: 0, y: 0 };
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const sub: Tf = (x, y) => {
            const lx = (x - base.x) * sx;
            const ly = (y - base.y) * sy;
            return tf(pos.x + lx * cos - ly * sin, pos.y + lx * sin + ly * cos);
          };
          walk(block.entities, sub, scale * Math.abs(sx), depth + 1);
          break;
        }
      }
    }
  };
  walk(parsed.entities ?? [], identity, 1, 0);
  if (!raw.segs.length) throw new Error("In der DXF-Datei wurden keine Linien gefunden.");

  // units: header, otherwise guessed from the size (a flat is 5–40 m across)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [a, b] of raw.segs) {
    for (const p of [a, b]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY);
  const code = Number(parsed.header?.["$INSUNITS"] ?? 0);
  const [unit, unitLabel] = UNITS[code] ?? (span > 2000 ? UNITS[4] : span > 200 ? UNITS[5] : UNITS[6]);
  // to plan meters with y downwards, origin at the top-left corner
  const conv = (p: Vec2): Vec2 => ({ x: (p.x - minX) * unit, y: (maxY - p.y) * unit });
  return {
    segments: raw.segs.map(([a, b]) => [conv(a), conv(b)]),
    texts: raw.texts.map((t) => ({ ...conv(t), str: t.str, height: t.height * unit })),
    bounds: { minX: 0, minY: 0, maxX: (maxX - minX) * unit, maxY: (maxY - minY) * unit },
    unit,
    unitLabel,
  };
}

function pushArc(segs: [Vec2, Vec2][], tf: Tf, cx: number, cy: number, r: number, a0: number, a1: number) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) / (Math.PI * 2)) * 48));
  let prev = tf(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const p = tf(cx + r * Math.cos(a), cy + r * Math.sin(a));
    segs.push([prev, p]);
    prev = p;
  }
}
