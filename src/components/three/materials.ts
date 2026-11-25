"use client";

import * as THREE from "three";
import { FLOOR_MATERIALS } from "@/model/materials";
import type { FloorMaterial, FurniturePart } from "@/model/types";

const matCache = new Map<string, THREE.Material>();

export function partMaterial(color: string, finish: FurniturePart["finish"]): THREE.Material {
  const key = `${color}|${finish ?? ""}`;
  let m = matCache.get(key);
  if (m) return m;
  switch (finish) {
    case "glanz":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05 });
      break;
    case "metall":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75 });
      break;
    case "stoff":
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
      break;
    case "glas":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
  }
  matCache.set(key, m);
  return m;
}

const texCache = new Map<string, THREE.Texture>();
/** Size of the area one floor texture tile covers, in meters. */
export const FLOOR_TILE_M = 2.4;

export function floorTexture(material: FloorMaterial): THREE.Texture {
  const cached = texCache.get(material);
  if (cached) return cached;
  const def = FLOOR_MATERIALS[material];
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const k = size / FLOOR_TILE_M; // px per meter
  g.fillStyle = def.base;
  g.fillRect(0, 0, size, size);
  // deterministic pseudo random
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (def.pattern === "planks" || def.pattern === "deck") {
    const plankW = def.size * k;
    const plankL = (def.pattern === "deck" ? 2.4 : 1.2) * k;
    for (let row = 0; row * plankW < size; row++) {
      let x = -rnd() * plankL;
      while (x < size) {
        const shadeV = 0.88 + rnd() * 0.22;
        g.fillStyle = def.base;
        g.globalAlpha = 1;
        g.fillRect(x, row * plankW, plankL, plankW);
        g.fillStyle = shadeV > 1 ? "#ffffff" : "#000000";
        g.globalAlpha = Math.abs(1 - shadeV) * 0.9;
        g.fillRect(x, row * plankW, plankL, plankW);
        // grain
        g.globalAlpha = 0.07;
        g.strokeStyle = def.line;
        for (let i = 0; i < 6; i++) {
          const yy = row * plankW + rnd() * plankW;
          g.beginPath();
          g.moveTo(x, yy);
          g.bezierCurveTo(x + plankL * 0.3, yy + 3, x + plankL * 0.6, yy - 3, x + plankL, yy);
          g.stroke();
        }
        g.globalAlpha = 0.6;
        g.fillStyle = def.line;
        g.fillRect(x, row * plankW, 2, plankW);
        x += plankL;
      }
      g.globalAlpha = 0.6;
      g.fillStyle = def.line;
      g.fillRect(0, row * plankW, size, 2);
    }
  } else if (def.pattern === "tiles") {
    const t = def.size * k;
    for (let y = 0; y < size; y += t) {
      for (let x = 0; x < size; x += t) {
        g.globalAlpha = 0.06 + rnd() * 0.06;
        g.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
        g.fillRect(x, y, t, t);
      }
    }
    g.globalAlpha = 0.9;
    g.fillStyle = def.line;
    for (let p = 0; p <= size; p += t) {
      g.fillRect(p - 1, 0, 2, size);
      g.fillRect(0, p - 1, size, 2);
    }
  } else {
    for (let i = 0; i < 4000; i++) {
      g.globalAlpha = 0.05;
      g.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
      g.fillRect(rnd() * size, rnd() * size, 3, 3);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / FLOOR_TILE_M, 1 / FLOOR_TILE_M);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  texCache.set(material, tex);
  return tex;
}
