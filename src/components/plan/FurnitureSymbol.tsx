import { memo } from "react";
import type { DefLookup } from "@/components/three/build";
import { SPRITE_MARGIN, useSprite } from "@/components/three/sprites";
import { partColor } from "@/model/materials";
import type { FurnitureDef, FurnitureItem } from "@/model/types";

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Top-view symbol of a furniture item, drawn in local coordinates centered at 0,0. */
export const FurnitureShape = memo(function FurnitureShape({
  def,
  item,
  presentation,
  lookup,
}: {
  def: FurnitureDef;
  item: Pick<FurnitureItem, "w" | "d" | "h" | "color">;
  presentation: boolean;
  lookup?: DefLookup;
}) {
  const parts = def.parts
    .filter((p) => p.plan !== false)
    .slice()
    .sort((a, b) => a.z + a.h - (b.z + b.h));
  const { w, d } = item;
  const sx = w / def.w;
  const sy = d / def.d;
  // composites (e.g. dining set): seats first, the table on top
  const kids = (def.children ?? [])
    .map((c) => ({ c, cdef: lookup?.(c.defId) }))
    .filter((k): k is { c: (typeof k)["c"]; cdef: FurnitureDef } => !!k.cdef)
    .reverse();
  return (
    <>
      {kids.map(({ c, cdef }, i) => (
        <g key={`c${i}`} transform={`translate(${c.x * sx} ${c.y * sy}) rotate(${c.rotation})`}>
          <FurnitureShape
            def={cdef}
            item={{ w: cdef.w, d: cdef.d, h: cdef.h, color: item.color }}
            presentation={presentation}
            lookup={lookup}
          />
        </g>
      ))}
      {parts.map((p, i) => {
        const pw = p.w * w;
        const pd = p.d * d;
        const cx = (p.x - 0.5) * w;
        const cy = (p.y - 0.5) * d;
        const color = partColor(p, def, item);
        const fill = presentation ? shade(color, 0.9 + 0.12 * (p.z + p.h)) : "#ffffff";
        const stroke = presentation ? shade(color, 0.7) : "#3a3936";
        const common = {
          fill,
          fillOpacity: p.finish === "glas" ? 0.35 : 1,
          stroke,
          strokeWidth: presentation ? 0.6 : 1,
          vectorEffect: "non-scaling-stroke" as const,
        };
        if (p.shape === "faucet") return null;
        const rectLike = ["box", "duvet", "throw", "pillow", "towel", "tub", "tray", "cushion", "sink"].includes(
          p.shape,
        );
        if (rectLike) {
          const soft = p.finish === "stoff" || p.shape === "tub" || p.shape === "pillow";
          const r = soft ? Math.min(pw, pd) * (p.shape === "pillow" ? 0.3 : 0.12) : 0;
          return <rect key={i} x={cx - pw / 2} y={cy - pd / 2} width={pw} height={pd} rx={r} {...common} />;
        }
        return <ellipse key={i} cx={cx} cy={cy} rx={pw / 2} ry={pd / 2} {...common} />;
      })}
    </>
  );
});

/**
 * Furniture in the plan: a rendered photoreal top view in presentation mode,
 * otherwise (or until the render is ready) the technical outline.
 */
export function FurnitureGraphic({
  def,
  item,
  presentation,
  lookup,
  pxPerMeter = 300,
}: {
  def: FurnitureDef;
  item: Pick<FurnitureItem, "w" | "d" | "h" | "color">;
  presentation: boolean;
  lookup: DefLookup;
  pxPerMeter?: number;
}) {
  const url = useSprite(def, item, lookup, pxPerMeter, presentation);
  if (presentation && url) {
    const W = item.w * (1 + 2 * SPRITE_MARGIN);
    const D = item.d * (1 + 2 * SPRITE_MARGIN);
    return <image href={url} x={-W / 2} y={-D / 2} width={W} height={D} preserveAspectRatio="none" />;
  }
  return <FurnitureShape def={def} item={item} presentation={presentation} lookup={lookup} />;
}
