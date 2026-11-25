"use client";

import { useThree } from "@react-three/fiber";
import { memo, useEffect, useState } from "react";
import type * as THREE from "three";
import type { FurnitureDef, FurnitureItem } from "@/model/types";
import { buildFurniture, type DefLookup } from "./build";

/** 3D furniture: real model or detailed parts, origin at the footprint center on the floor, front towards +z. */
export const FurnitureModel = memo(function FurnitureModel({
  def,
  item,
  lookup,
}: {
  def: FurnitureDef;
  item: Pick<FurnitureItem, "w" | "d" | "h" | "color">;
  lookup: DefLookup;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const { w, d, h, color } = item;
  useEffect(() => {
    let alive = true;
    buildFurniture(def, { w, d, h, color }, lookup).then((o) => {
      if (!alive) return;
      setObj(o);
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [def, w, d, h, color, lookup, invalidate]);
  return obj ? <primitive object={obj} /> : null;
});
