"use client";

import { RoundedBox } from "@react-three/drei";
import { memo } from "react";
import { partColor } from "@/model/materials";
import type { FurnitureDef, FurnitureItem } from "@/model/types";
import { partMaterial } from "./materials";

/** 3D model of a furniture item in local coordinates (origin at footprint center, floor level). */
export const FurnitureModel = memo(function FurnitureModel({
  def,
  item,
}: {
  def: FurnitureDef;
  item: Pick<FurnitureItem, "w" | "d" | "h" | "color">;
}) {
  const { w, d, h } = item;
  return (
    <group>
      {def.parts.map((p, i) => {
        const pw = Math.max(0.002, p.w * w);
        const pd = Math.max(0.002, p.d * d);
        const ph = Math.max(0.002, p.h * h);
        const pos: [number, number, number] = [(p.x - 0.5) * w, (p.z + p.h / 2) * h, (p.y - 0.5) * d];
        const mat = partMaterial(partColor(p, def, item), p.finish);
        const shadow = p.finish !== "glas";
        if (p.shape === "box") {
          // soft, rounded edges catch light like real furniture; upholstery gets a fuller radius
          const minSide = Math.min(pw, ph, pd);
          const radius = Math.min(minSide * (p.finish === "stoff" ? 0.3 : 0.12), p.finish === "stoff" ? 0.06 : 0.012);
          if (radius < 0.002) {
            return (
              <mesh key={i} position={pos} material={mat} castShadow={shadow} receiveShadow>
                <boxGeometry args={[pw, ph, pd]} />
              </mesh>
            );
          }
          return (
            <RoundedBox
              key={i}
              args={[pw, ph, pd]}
              radius={radius}
              smoothness={p.finish === "stoff" ? 4 : 2}
              position={pos}
              material={mat}
              castShadow={shadow}
              receiveShadow
            />
          );
        }
        if (p.shape === "sphere") {
          return (
            <mesh key={i} position={pos} scale={[pw, ph, pd]} material={mat} castShadow receiveShadow>
              <sphereGeometry args={[0.5, 48, 32]} />
            </mesh>
          );
        }
        if (p.shape === "cone") {
          return (
            <mesh key={i} position={pos} scale={[pw, ph, pd]} material={mat} castShadow receiveShadow>
              <coneGeometry args={[0.5, 1, 48]} />
            </mesh>
          );
        }
        return (
          <mesh key={i} position={pos} scale={[pw, ph, pd]} material={mat} castShadow={shadow} receiveShadow>
            <cylinderGeometry args={[0.5, 0.5, 1, 64]} />
          </mesh>
        );
      })}
    </group>
  );
});
