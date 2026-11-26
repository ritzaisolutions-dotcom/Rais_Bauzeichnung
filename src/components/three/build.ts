"use client";

// Builds three.js objects for furniture. Used by the 3D scene and by the sprite renderer
// that draws photoreal top views for the 2D presentation plan.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { partColor } from "@/model/materials";
import type { FurnitureDef, FurnitureItem, FurniturePart } from "@/model/types";
import { cushionGeometry, drapedClothGeometry, pillowGeometry, towelGeometry } from "./cloth";
import { partMaterial } from "./materials";
import { basinGeometry, bathtubGeometry, faucetGeometry, sinkGeometry, toiletGeometry, trayGeometry } from "./sanitary";

const DEG = Math.PI / 180;
type Size = Pick<FurnitureItem, "w" | "d" | "h" | "color">;
export type DefLookup = (id: string) => FurnitureDef | undefined;

// ---------------------------------------------------------------- geometry caches

const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 64),
  sphere: new THREE.SphereGeometry(0.5, 48, 32),
  cone: new THREE.ConeGeometry(0.5, 1, 48),
};
const roundedCache = new Map<string, THREE.BufferGeometry>();
function roundedBox(w: number, h: number, d: number, radius: number, segments: number) {
  const key = [w, h, d, radius].map((v) => Math.round(v * 1000)).join("|") + `|${segments}`;
  let g = roundedCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, radius);
    roundedCache.set(key, g);
  }
  return g;
}

const organicCache = new Map<string, THREE.BufferGeometry>();
/** Generated geometry for organic shapes, built at the real size (not scaled) and cached. */
function organic(shape: FurniturePart["shape"], w: number, h: number, d: number, seed: number) {
  const key = `${shape}|${[w, h, d].map((v) => Math.round(v * 1000)).join("|")}|${seed}`;
  let g = organicCache.get(key);
  if (g) return g;
  switch (shape) {
    case "duvet":
      g = drapedClothGeometry(w, h, d, {
        hang: [true, true, false, true],
        seed,
        quilt: 0.42,
        puff: Math.min(0.07, h * 0.3),
      });
      break;
    case "throw":
      g = drapedClothGeometry(w, h, d, { hang: [true, true, false, false], puff: 0.012, wrinkle: 0.035, seed });
      break;
    case "pillow":
      g = pillowGeometry(w, h, d, seed);
      break;
    case "towel":
      g = towelGeometry(w, h, d, seed);
      break;
    case "tub":
      g = bathtubGeometry(w, h, d);
      break;
    case "basin":
      g = basinGeometry(w, h, d);
      break;
    case "tray":
      g = trayGeometry(w, h, d);
      break;
    case "toilet":
      g = toiletGeometry(w, h, d);
      break;
    case "faucet":
      g = faucetGeometry(w, h, d);
      break;
    case "cushion":
      g = cushionGeometry(w, h, d, seed);
      break;
    case "sink":
      g = sinkGeometry(w, h, d);
      break;
    default:
      return null;
  }
  organicCache.set(key, g);
  return g;
}

function partMesh(p: FurniturePart, def: FurnitureDef, size: Size, index = 0): THREE.Mesh {
  const pw = Math.max(0.002, p.w * size.w);
  const pd = Math.max(0.002, p.d * size.d);
  const ph = Math.max(0.002, p.h * size.h);
  const mat = partMaterial(partColor(p, def, size), p.finish);
  let mesh: THREE.Mesh;
  if (p.shape === "box") {
    const min = Math.min(pw, ph, pd);
    const factor = p.round ?? (p.finish === "stoff" ? 0.35 : 0.1);
    const radius = Math.min(min * 0.49, min * factor, 0.12);
    mesh =
      radius >= 0.003
        ? new THREE.Mesh(roundedBox(pw, ph, pd, radius, factor > 0.5 ? 5 : 3), mat)
        : new THREE.Mesh(unit.box, mat);
    if (radius < 0.003) mesh.scale.set(pw, ph, pd);
  } else if (p.shape === "cylinder" || p.shape === "sphere" || p.shape === "cone") {
    mesh = new THREE.Mesh(unit[p.shape], mat);
    mesh.scale.set(pw, ph, pd);
  } else {
    const geo = organic(p.shape, pw, ph, pd, index + 1) ?? unit.box;
    const shaded = !!geo.getAttribute("color");
    mesh = new THREE.Mesh(geo, shaded ? partMaterial(partColor(p, def, size), p.finish, true) : mat);
  }
  mesh.position.set((p.x - 0.5) * size.w, (p.z + p.h / 2) * size.h, (p.y - 0.5) * size.d);
  // positive tilt leans the top towards the back (-z)
  if (p.tilt) mesh.rotation.x = -p.tilt * DEG;
  if (p.yaw) mesh.rotation.y = -p.yaw * DEG;
  mesh.castShadow = p.finish !== "glas" && p.finish !== "licht";
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- glTF models

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const modelCache = new Map<string, Promise<THREE.Object3D>>();

export function loadModel(url: string): Promise<THREE.Object3D> {
  let p = modelCache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (std.map) std.map.anisotropy = 8;
        }
      });
      // normalise: centered on the footprint, standing on the floor
      const box = new THREE.Box3().setFromObject(root);
      const c = box.getCenter(new THREE.Vector3());
      root.position.set(-c.x, -box.min.y, -c.z);
      const wrap = new THREE.Group();
      wrap.add(root);
      return wrap;
    });
    modelCache.set(url, p);
    p.catch(() => modelCache.delete(url));
  }
  return p;
}

/** True when everything this def needs is already loaded (sync build possible). */
export function isLoaded(def: FurnitureDef) {
  return !def.model || modelCache.has(def.model.url);
}

// ---------------------------------------------------------------- public builder

/**
 * Builds the furniture with its origin at the footprint center on the floor; the front faces +z.
 * Falls back to the primitive parts if a model fails to load.
 */
export interface BuildOptions {
  /** Skip primitive parts starting above this height (plan cut, like an architectural floor plan). */
  planCut?: number;
}

export async function buildFurniture(
  def: FurnitureDef,
  size: Size,
  lookup: DefLookup,
  depth = 0,
  opts: BuildOptions = {},
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = def.id;
  const sx = size.w / def.w;
  const sy = size.h / def.h;
  const sz = size.d / def.d;

  let modelDone = false;
  if (def.model) {
    try {
      const src = await loadModel(def.model.url);
      const obj = src.clone(true);
      const turn = new THREE.Group();
      turn.rotation.y = def.model.rotY * DEG;
      turn.add(obj);
      // scale against the model's own size (turned), so edited dimensions stretch it correctly
      const m = def.model;
      const swap = Math.abs(m.rotY % 180) === 90;
      const scaled = new THREE.Group();
      scaled.scale.set(size.w / (swap ? m.d : m.w), size.h / m.h, size.d / (swap ? m.w : m.d));
      scaled.add(turn);
      group.add(scaled);
      modelDone = true;
    } catch (e) {
      console.warn(`Modell ${def.model.url} konnte nicht geladen werden`, e);
    }
  }
  if (!modelDone)
    def.parts.forEach((p, i) => {
      if (opts.planCut !== undefined && p.z * size.h + (def.elevation ?? 0) > opts.planCut) return;
      group.add(partMesh(p, def, size, i));
    });

  if (def.children && depth < 3) {
    const kids = await Promise.all(
      def.children.map(async (c) => {
        const cdef = lookup(c.defId);
        if (!cdef) return null;
        const sub = await buildFurniture(
          cdef,
          { w: cdef.w, d: cdef.d, h: cdef.h, color: size.color },
          lookup,
          depth + 1,
        );
        sub.position.set(c.x * sx, (c.z ?? 0) * sy, c.y * sz);
        sub.rotation.y = -c.rotation * DEG;
        return sub;
      }),
    );
    for (const k of kids) if (k) group.add(k);
  }
  return group;
}
