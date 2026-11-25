import { memo } from "react";
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
}: {
  def: FurnitureDef;
  item: Pick<FurnitureItem, "w" | "d" | "h" | "color">;
  presentation: boolean;
}) {
  const parts = def.parts
    .filter((p) => p.plan !== false)
    .slice()
    .sort((a, b) => a.z + a.h - (b.z + b.h));
  const { w, d } = item;
  return (
    <>
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
        if (p.shape === "box") {
          const r = p.finish === "stoff" ? Math.min(pw, pd) * 0.12 : 0;
          return <rect key={i} x={cx - pw / 2} y={cy - pd / 2} width={pw} height={pd} rx={r} {...common} />;
        }
        return <ellipse key={i} cx={cx} cy={cy} rx={pw / 2} ry={pd / 2} {...common} />;
      })}
    </>
  );
});
