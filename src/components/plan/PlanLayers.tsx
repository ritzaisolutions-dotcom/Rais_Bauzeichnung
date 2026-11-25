import { memo, useMemo } from "react";
import { findDef } from "@/furniture/catalog";
import { add, cross, dist, formatArea, formatM, mul, norm, perp, sub } from "@/model/geometry";
import { FLOOR_MATERIALS } from "@/model/materials";
import type { Dimension, Floor, FloorMaterial, FurnitureDef, Opening, RoomGeometry, Vec2 } from "@/model/types";
import { pointAlong, solidIntervals, wallFrames, wallRect, type WallFrame } from "@/model/walls";
import { FurnitureShape } from "./FurnitureSymbol";

export interface PlanLayersProps {
  floor: Floor;
  rooms: RoomGeometry[];
  defs: FurnitureDef[];
  /** Pixels per meter, used for constant-size text and handles. */
  scale: number;
  presentation: boolean;
  selectedIds?: Set<string>;
  layers: { underlay: boolean; furniture: boolean; dimensions: boolean; roomLabels: boolean };
  interactive?: boolean;
}

const pts = (poly: Vec2[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

export function MaterialPatterns() {
  return (
    <defs>
      {(Object.keys(FLOOR_MATERIALS) as FloorMaterial[]).map((key) => {
        const m = FLOOR_MATERIALS[key];
        const s = m.size;
        if (m.pattern === "planks" || m.pattern === "deck") {
          const L = m.pattern === "deck" ? 2.4 : 1.2;
          return (
            <pattern key={key} id={`mat-${key}`} patternUnits="userSpaceOnUse" width={L} height={s * 2}>
              <rect width={L} height={s * 2} fill={m.base} />
              <rect y={s} width={L} height={s} fill={m.line} opacity={0.18} />
              <line x1={0} y1={s} x2={L} y2={s} stroke={m.line} strokeWidth={0.008} />
              <line x1={0} y1={0} x2={L} y2={0} stroke={m.line} strokeWidth={0.008} />
              <line x1={L * 0.35} y1={0} x2={L * 0.35} y2={s} stroke={m.line} strokeWidth={0.008} />
              <line x1={L * 0.85} y1={s} x2={L * 0.85} y2={s * 2} stroke={m.line} strokeWidth={0.008} />
            </pattern>
          );
        }
        if (m.pattern === "tiles") {
          return (
            <pattern key={key} id={`mat-${key}`} patternUnits="userSpaceOnUse" width={s} height={s}>
              <rect width={s} height={s} fill={m.base} />
              <path d={`M0 0 H${s} M0 0 V${s}`} stroke={m.line} strokeWidth={0.01} fill="none" />
            </pattern>
          );
        }
        return (
          <pattern key={key} id={`mat-${key}`} patternUnits="userSpaceOnUse" width={1} height={1}>
            <rect width={1} height={1} fill={m.base} />
          </pattern>
        );
      })}
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx={0.03} dy={0.05} stdDeviation={0.05} floodColor="#000" floodOpacity={0.28} />
      </filter>
      <filter id="wallshadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx={0} dy={0} stdDeviation={0.08} floodColor="#000" floodOpacity={0.35} />
      </filter>
    </defs>
  );
}

function OpeningSymbol({ f, o, px, selected }: { f: WallFrame; o: Opening; px: number; selected: boolean }) {
  const t = f.wall.thickness;
  const s = o.offset - o.width / 2;
  const e = o.offset + o.width / 2;
  const color = selected ? "var(--color-select)" : "#3a3936";
  const thin = { stroke: color, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const, fill: "none" };
  const hit = (
    <polygon
      points={pts(wallRect(f, s, e, t + 0.1))}
      fill="transparent"
      data-kind="opening"
      data-id={o.id}
      style={{ cursor: "move" }}
    />
  );
  if (o.kind === "fenster" || o.kind === "bodenfenster") {
    return (
      <g>
        <polygon
          points={pts(wallRect(f, s, e, t))}
          fill="#eef6f8"
          stroke={color}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={pts(wallRect(f, s, e, 0.05))}
          fill="#a7d3e0"
          stroke={color}
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
        />
        {o.kind === "bodenfenster" && (
          <line
            {...thin}
            {...seg(pointAlong(f, s, -t / 2 - 0.04), pointAlong(f, e, -t / 2 - 0.04))}
            strokeDasharray="3 2"
          />
        )}
        {hit}
      </g>
    );
  }
  if (o.kind === "schiebetuer") {
    return (
      <g>
        <polygon
          points={pts(shift(wallRect(f, s, o.offset + 0.05, 0.04), f.normal, 0.025))}
          {...thin}
          fill="#fff"
          fillOpacity={1}
        />
        <polygon
          points={pts(shift(wallRect(f, o.offset - 0.05, e, 0.04), f.normal, -0.025))}
          {...thin}
          fill="#fff"
          fillOpacity={1}
        />
        {hit}
      </g>
    );
  }
  if (o.kind === "durchgang") {
    return (
      <g>
        <line {...thin} {...seg(pointAlong(f, s, t / 2), pointAlong(f, e, t / 2))} strokeDasharray="4 3" />
        <line {...thin} {...seg(pointAlong(f, s, -t / 2), pointAlong(f, e, -t / 2))} strokeDasharray="4 3" />
        {hit}
      </g>
    );
  }
  // hinged door
  const side = o.flipSide ? -1 : 1;
  const hingeS = o.flipHinge ? e : s;
  const otherS = o.flipHinge ? s : e;
  const hinge = pointAlong(f, hingeS, (side * t) / 2);
  const other = pointAlong(f, otherS, (side * t) / 2);
  const tip = add(hinge, mul(f.normal, side * o.width));
  const sweep = cross(sub(tip, hinge), sub(other, hinge)) > 0 ? 1 : 0;
  const leafW = 0.04;
  const leafDir = norm(sub(tip, hinge));
  const leafN = perp(leafDir);
  const leaf = [
    hinge,
    tip,
    add(tip, mul(leafN, leafW * (o.flipHinge ? 1 : -1) * side)),
    add(hinge, mul(leafN, leafW * (o.flipHinge ? 1 : -1) * side)),
  ];
  void px;
  return (
    <g>
      <polygon points={pts(leaf)} fill="#fff" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path
        d={`M${tip.x},${tip.y} A${o.width},${o.width} 0 0 ${sweep} ${other.x},${other.y}`}
        {...thin}
        strokeWidth={0.8}
        strokeDasharray="4 3"
      />
      {hit}
    </g>
  );
}

const seg = (a: Vec2, b: Vec2) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
const shift = (poly: Vec2[], n: Vec2, d: number) => poly.map((p) => add(p, mul(n, d)));

export function DimensionLine({
  dim,
  px,
  color = "#4b4945",
  selected,
}: {
  dim: Dimension;
  px: number;
  color?: string;
  selected?: boolean;
}) {
  const d = norm(sub(dim.b, dim.a));
  const n = perp(d);
  const a = add(dim.a, mul(n, dim.offset));
  const b = add(dim.b, mul(n, dim.offset));
  const L = dist(dim.a, dim.b);
  const mid = mul(add(a, b), 0.5);
  const tick = 5 / px;
  const angle = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  const upright = angle > 90 || angle < -90 ? angle + 180 : angle;
  const c = selected ? "var(--color-select)" : color;
  const st = { stroke: c, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
  return (
    <g data-kind="dimension" data-id={dim.id} style={{ cursor: "move" }}>
      <line {...seg(dim.a, a)} {...st} strokeOpacity={0.5} />
      <line {...seg(dim.b, b)} {...st} strokeOpacity={0.5} />
      <line {...seg(a, b)} {...st} />
      {[a, b].map((p, i) => (
        <line key={i} {...seg(add(p, mul(add(d, n), -tick)), add(p, mul(add(d, n), tick)))} {...st} strokeWidth={1.5} />
      ))}
      <line {...seg(a, b)} stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
      <text
        x={mid.x}
        y={mid.y}
        transform={`rotate(${upright} ${mid.x} ${mid.y}) translate(0 ${-4 / px})`}
        fontSize={11 / px}
        textAnchor="middle"
        fill={c}
      >
        {formatM(L)}
      </text>
    </g>
  );
}

export const PlanLayers = memo(function PlanLayers({
  floor,
  rooms,
  defs,
  scale: px,
  presentation,
  selectedIds = new Set(),
  layers,
}: PlanLayersProps) {
  const frames = useMemo(() => wallFrames(floor), [floor]);
  const u = floor.underlay;
  const wallColor = presentation ? "#1d1c1a" : "#2b2a28";

  return (
    <g>
      {u && u.visible && layers.underlay && (
        <image
          href={u.dataUrl}
          x={u.x}
          y={u.y}
          width={u.widthPx / u.pxPerMeter}
          height={u.heightPx / u.pxPerMeter}
          opacity={u.opacity}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* room floors */}
      {rooms.map((r) => (
        <polygon
          key={r.meta.id}
          points={pts(r.outline)}
          data-kind="room"
          data-id={r.meta.id}
          fill={presentation ? `url(#mat-${r.meta.floorMaterial})` : selectedIds.has(r.meta.id) ? "#e6eefc" : "#fbfaf7"}
          fillOpacity={u && u.visible && layers.underlay && !presentation ? 0.35 : 1}
          stroke="none"
        />
      ))}

      {/* furniture */}
      {layers.furniture && (
        <g filter={presentation ? "url(#shadow)" : undefined}>
          {floor.items
            .slice()
            .sort((a, b) => (a.elevation ?? 0) + a.h - ((b.elevation ?? 0) + b.h))
            .map((it) => {
              const def = findDef(it.defId, defs);
              if (!def) return null;
              return (
                <g
                  key={it.id}
                  transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}
                  data-kind="item"
                  data-id={it.id}
                  style={{ cursor: "move" }}
                >
                  <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} fill="transparent" />
                  <FurnitureShape def={def} item={it} presentation={presentation} />
                </g>
              );
            })}
        </g>
      )}

      {/* walls */}
      <g filter={presentation ? "url(#wallshadow)" : undefined}>
        {frames.map((f) => {
          const sel = selectedIds.has(f.wall.id);
          return (
            <g key={f.wall.id} data-kind="wall" data-id={f.wall.id} style={{ cursor: "pointer" }}>
              {solidIntervals(f).map(([s, e], i) => (
                <polygon
                  key={i}
                  points={pts(wallRect(f, s, e))}
                  fill={sel ? "#3b6fd8" : f.wall.type === "innen" && !presentation ? "#55524d" : wallColor}
                />
              ))}
            </g>
          );
        })}
      </g>

      {/* openings */}
      {frames.map((f) =>
        f.openings.map((o) => <OpeningSymbol key={o.id} f={f} o={o} px={px} selected={selectedIds.has(o.id)} />),
      )}

      {/* wall lengths */}
      {layers.dimensions &&
        !presentation &&
        frames.map((f) => {
          if (f.length < 0.6) return null;
          const off = f.wall.thickness / 2 + 9 / px;
          const mid = pointAlong(f, f.length / 2, off);
          const angle = (Math.atan2(f.dir.y, f.dir.x) * 180) / Math.PI;
          const upright = angle > 90 || angle <= -90 ? angle + 180 : angle;
          return (
            <text
              key={`len-${f.wall.id}`}
              x={mid.x}
              y={mid.y}
              transform={`rotate(${upright} ${mid.x} ${mid.y})`}
              fontSize={10 / px}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={selectedIds.has(f.wall.id) ? "#2563eb" : "#8a857c"}
            >
              {formatM(f.length)}
            </text>
          );
        })}

      {layers.dimensions &&
        floor.dimensions.map((d) => <DimensionLine key={d.id} dim={d} px={px} selected={selectedIds.has(d.id)} />)}

      {/* room labels */}
      {layers.roomLabels &&
        rooms.map((r) => {
          const fs = presentation ? Math.max(0.2, Math.min(0.32, 13 / px)) : 12 / px;
          const diff = r.meta.targetArea !== undefined ? r.area - r.meta.targetArea : null;
          const bad = diff !== null && Math.abs(diff) > Math.max(0.15, r.meta.targetArea! * 0.02);
          return (
            <g key={`lbl-${r.meta.id}`}>
              {presentation && (
                <rect
                  x={r.centroid.x - fs * 3.6}
                  y={r.centroid.y - fs * 1.25}
                  width={fs * 7.2}
                  height={fs * 2.6}
                  rx={fs * 0.4}
                  fill="#ffffff"
                  fillOpacity={0.78}
                  style={{ pointerEvents: "none" }}
                />
              )}
              <text
                x={r.centroid.x}
                y={r.centroid.y - fs * 0.2}
                fontSize={fs}
                fontWeight={600}
                textAnchor="middle"
                fill="#1f1e1c"
              >
                {r.meta.name}
              </text>
              <text
                x={r.centroid.x}
                y={r.centroid.y + fs * 1.0}
                fontSize={fs * 0.85}
                textAnchor="middle"
                fill="#4b4945"
              >
                {formatArea(r.area)}
              </text>
              {diff !== null && !presentation && (
                <text
                  x={r.centroid.x}
                  y={r.centroid.y + fs * 2.1}
                  fontSize={fs * 0.75}
                  textAnchor="middle"
                  fill={bad ? "#b91c1c" : "#15803d"}
                >
                  Plan: {formatArea(r.meta.targetArea!)} ({diff >= 0 ? "+" : ""}
                  {formatM(diff)})
                </text>
              )}
            </g>
          );
        })}

      {/* free text */}
      {floor.labels.map((l) => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          fontSize={l.size}
          textAnchor="middle"
          dominantBaseline="middle"
          data-kind="label"
          data-id={l.id}
          fill={selectedIds.has(l.id) ? "#2563eb" : "#1f1e1c"}
          style={{ pointerEvents: "all", cursor: "move" }}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
});
