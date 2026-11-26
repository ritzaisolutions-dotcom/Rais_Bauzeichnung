"use client";

import { useRef, useState } from "react";
import { cropFromDrag, type Crop } from "@/ai/importPreview";
import { nodeMap } from "@/model/geometry";
import type { Floor, Vec2 } from "@/model/types";

/**
 * The drawing with an optional crop rectangle (drag to set) and, after recognition,
 * the recognised walls, openings and room areas drawn on top. All coordinates in
 * image pixels; the preview floor is converted back with its underlay.
 */
export function PlanPreview({
  src,
  width,
  height,
  crop,
  onCrop,
  result,
}: {
  src: string;
  width: number;
  height: number;
  crop: Crop | null;
  onCrop?: (c: Crop | null) => void;
  result?: Floor | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ a: Vec2; b: Vec2 } | null>(null);

  const toImage = (e: React.PointerEvent): Vec2 => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  const shown = drag ? cropFromDrag(drag.a, drag.b, width, height) : crop;
  const stroke = Math.max(width, height) / 400;

  const overlay = (() => {
    if (!result?.underlay) return null;
    const u = result.underlay;
    const px = (p: Vec2) => ({ x: (p.x - u.x) * u.pxPerMeter, y: (p.y - u.y) * u.pxPerMeter });
    const nodes = nodeMap(result);
    return (
      <>
        {result.walls.map((w) => {
          const a = nodes.get(w.a);
          const b = nodes.get(w.b);
          if (!a || !b) return null;
          const pa = px(a);
          const pb = px(b);
          return (
            <line
              key={w.id}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={w.type === "innen" ? "#2563eb" : "#dc2626"}
              strokeOpacity={0.75}
              strokeWidth={Math.max(w.thickness * u.pxPerMeter, stroke * 2)}
              strokeLinecap="square"
            />
          );
        })}
        {result.openings.map((o) => {
          const w = result.walls.find((x) => x.id === o.wallId);
          const a = w && nodes.get(w.a);
          const b = w && nodes.get(w.b);
          if (!a || !b) return null;
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const t = o.offset / L;
          const c = px({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          return (
            <circle
              key={o.id}
              cx={c.x}
              cy={c.y}
              r={(o.width / 2) * u.pxPerMeter}
              fill={o.kind === "fenster" || o.kind === "bodenfenster" ? "#0ea5e9" : "#16a34a"}
              fillOpacity={0.35}
              stroke="#fff"
              strokeWidth={stroke}
            />
          );
        })}
      </>
    );
  })();

  return (
    <div
      ref={ref}
      className="relative select-none"
      style={{ aspectRatio: `${width} / ${height}`, cursor: onCrop ? "crosshair" : undefined }}
      onPointerDown={(e) => {
        if (!onCrop) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = toImage(e);
        setDrag({ a: p, b: p });
      }}
      onPointerMove={(e) => drag && setDrag({ a: drag.a, b: toImage(e) })}
      onPointerUp={() => {
        if (!drag || !onCrop) return;
        const c = cropFromDrag(drag.a, drag.b, width, height);
        if (c) onCrop(c);
        setDrag(null);
      }}
      data-testid="plan-preview"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Vorschau der Bauzeichnung" className="absolute inset-0 h-full w-full" draggable={false} />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {shown && (
          <path
            d={`M0 0H${width}V${height}H0Z M${shown.x} ${shown.y}v${shown.h}h${shown.w}v${-shown.h}Z`}
            fill="#000"
            fillOpacity={0.35}
            fillRule="evenodd"
          />
        )}
        {shown && (
          <rect
            x={shown.x}
            y={shown.y}
            width={shown.w}
            height={shown.h}
            fill="none"
            stroke="#f97316"
            strokeWidth={stroke * 1.5}
            strokeDasharray={`${stroke * 6} ${stroke * 4}`}
          />
        )}
        {overlay}
      </svg>
    </div>
  );
}
