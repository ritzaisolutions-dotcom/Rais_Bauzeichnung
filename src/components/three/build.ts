"use client";

// Builds three.js objects for furniture. Used by the 3D scene and by the sprite renderer
// that draws photoreal top views for the 2D presentation plan.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { partColor } from "@/model/materials";
import type { FurnitureDef, FurnitureItem, FurniturePart } from "@/model/types";
import { partMaterial } from "./materials";

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

function partMesh(p: FurniturePart, def: FurnitureDef, size: Size): THREE.Mesh {
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
  } else {
    mesh = new THREE.Mesh(unit[p.shape], mat);
    mesh.scale.set(pw, ph, pd);
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
export async function buildFurniture(
  def: FurnitureDef,
  size: Size,
  lookup: DefLookup,
  depth = 0,
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
      const scaled = new THREE.Group();
      scaled.scale.set(sx, sy, sz);
      scaled.add(turn);
      group.add(scaled);
      modelDone = true;
    } catch (e) {
      console.warn(`Modell ${def.model.url} konnte nicht geladen werden`, e);
    }
  }
  if (!modelDone) for (const p of def.parts) group.add(partMesh(p, def, size));

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
