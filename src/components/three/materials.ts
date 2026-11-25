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
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.92,
        metalness: 0,
        bumpMap: fabricBump(),
        bumpScale: 0.35,
      });
      break;
    case "glas":
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3 });
      break;
    case "holz":
      m = new THREE.MeshStandardMaterial({ color, map: woodGrain(), roughness: 0.55, metalness: 0 });
      break;
    case "licht":
      m = new THREE.MeshStandardMaterial({ color, emissive: "#ffd7a0", emissiveIntensity: 1.2, roughness: 1 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
  }
  matCache.set(key, m);
  return m;
}

const texCache = new Map<string, THREE.Texture>();
/** Size of the area one floor texture tile covers, in meters. */
export const FLOOR_TILE_M = 2.4;
/** 2048 px for 2.4 m: about 8.5 px per centimeter, sharp in close-ups and 4K renders. */
const TEX_PX = 2048;

function jitter(hex: string, amount: number, rnd: () => number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    hsl.h + (rnd() - 0.5) * amount * 0.08,
    hsl.s * (1 + (rnd() - 0.5) * amount),
    hsl.l * (1 + (rnd() - 0.5) * amount),
  );
  return `#${c.getHexString()}`;
}

export function floorTexture(material: FloorMaterial): THREE.Texture {
  const cached = texCache.get(material);
  if (cached) return cached;
  const def = FLOOR_MATERIALS[material];
  const size = TEX_PX;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const k = size / FLOOR_TILE_M; // px per meter
  g.fillStyle = def.base;
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  if (def.pattern === "planks" || def.pattern === "deck") {
    const plankW = def.size * k;
    const plankL = (def.pattern === "deck" ? 2.4 : 1.2) * k;
    const rows = Math.ceil(size / plankW);
    for (let row = 0; row < rows; row++) {
      const y0 = row * plankW;
      let x = -rnd() * plankL;
      while (x < size) {
        const tone = jitter(def.base, 0.35, rnd);
        g.fillStyle = tone;
        g.fillRect(x, y0, plankL, plankW);
        // long, slightly wavy grain lines
        const lines = 26 + Math.floor(rnd() * 14);
        for (let i = 0; i < lines; i++) {
          const yy = y0 + rnd() * plankW;
          g.globalAlpha = 0.05 + rnd() * 0.12;
          g.strokeStyle = rnd() > 0.35 ? def.line : "#ffffff";
          g.lineWidth = 0.6 + rnd() * 1.6;
          g.beginPath();
          g.moveTo(x, yy);
          const amp = 1 + rnd() * 4;
          g.bezierCurveTo(x + plankL * 0.33, yy + amp, x + plankL * 0.66, yy - amp, x + plankL, yy + (rnd() - 0.5) * 2);
          g.stroke();
        }
        // occasional knot
        if (def.pattern === "planks" && rnd() > 0.72) {
          const kx = x + rnd() * plankL;
          const ky = y0 + plankW * (0.25 + rnd() * 0.5);
          for (let r = 9; r > 0; r -= 1.5) {
            g.globalAlpha = 0.08;
            g.strokeStyle = def.line;
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(kx, ky, r * 2.4, r, 0, 0, Math.PI * 2);
            g.stroke();
          }
        }
        // bevelled joints: dark seam with a light edge
        g.globalAlpha = 0.85;
        g.fillStyle = def.line;
        g.fillRect(x, y0, 2, plankW);
        g.globalAlpha = 0.25;
        g.fillStyle = "#ffffff";
        g.fillRect(x + 2, y0, 1, plankW);
        x += plankL;
      }
      g.globalAlpha = 0.85;
      g.fillStyle = def.line;
      g.fillRect(0, y0, size, 2);
      g.globalAlpha = 0.2;
      g.fillStyle = "#ffffff";
      g.fillRect(0, y0 + 2, size, 1);
    }
  } else if (def.pattern === "tiles") {
    const t = def.size * k;
    for (let y = 0; y < size; y += t) {
      for (let x = 0; x < size; x += t) {
        g.globalAlpha = 1;
        g.fillStyle = jitter(def.base, 0.06, rnd);
        g.fillRect(x, y, t, t);
        // fine stone speckle
        for (let i = 0; i < 900; i++) {
          g.globalAlpha = 0.05 + rnd() * 0.05;
          g.fillStyle = rnd() > 0.5 ? "#ffffff" : def.line;
          g.fillRect(x + rnd() * t, y + rnd() * t, 1 + rnd() * 2, 1 + rnd() * 2);
        }
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = def.line;
    const grout = 4;
    for (let p = 0; p <= size; p += t) {
      g.fillRect(p - grout / 2, 0, grout, size);
      g.fillRect(0, p - grout / 2, size, grout);
    }
  } else {
    for (let i = 0; i < 60000; i++) {
      g.globalAlpha = 0.04 + rnd() * 0.04;
      g.fillStyle = rnd() > 0.5 ? "#ffffff" : "#000000";
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / FLOOR_TILE_M, 1 / FLOOR_TILE_M);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  texCache.set(material, tex);
  return tex;
}

let fabric: THREE.Texture | null = null;
/** Woven fabric structure used as bump map on upholstery. */
export function fabricBump(): THREE.Texture {
  if (fabric) return fabric;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const v = ((x / 4 + y / 4) % 2 === 0 ? 150 : 105) + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 4, 4);
    }
  }
  fabric = new THREE.CanvasTexture(c);
  fabric.wrapS = THREE.RepeatWrapping;
  fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(12, 12);
  return fabric;
}

let wood: THREE.Texture | null = null;
/** Light, neutral wood grain that the material colour tints (multiplied). */
export function woodGrain(): THREE.Texture {
  if (wood) return wood;
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 420; i++) {
    const y = rnd() * size;
    const shade = 150 + Math.floor(rnd() * 90);
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.globalAlpha = 0.12 + rnd() * 0.25;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    const amp = 2 + rnd() * 10;
    for (let x = 0; x <= size; x += 64) g.lineTo(x, y + Math.sin(x / 140 + i) * amp);
    g.stroke();
  }
  g.globalAlpha = 1;
  wood = new THREE.CanvasTexture(c);
  wood.colorSpace = THREE.SRGBColorSpace;
  wood.wrapS = THREE.RepeatWrapping;
  wood.wrapT = THREE.RepeatWrapping;
  wood.anisotropy = 8;
  return wood;
}
