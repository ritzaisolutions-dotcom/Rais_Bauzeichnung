"use client";

// Photoreal top views of furniture, rendered once per variant in an offscreen WebGL context
// and cached as data URLs. The 2D presentation plan, its exports and the library thumbnails use them.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { create } from "zustand";
import { getSprite, pruneSprites, putSprite } from "@/lib/spriteCache";
import type { FurnitureDef, FurnitureItem } from "@/model/types";
import { buildFurniture, type DefLookup } from "./build";

type Size = Pick<FurnitureItem, "w" | "d" | "h" | "color">;

/** Extra border around the footprint so protruding handles, cushions or leaves are not cut off. */
export const SPRITE_MARGIN = 0.08;

const useSpriteStore = create<{ urls: Record<string, string> }>(() => ({ urls: {} }));

let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;
let disabled = false;

function getRenderer() {
  if (renderer || disabled) return renderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) {
    console.warn("Draufsichten nicht verfügbar (kein WebGL)", e);
    disabled = true;
    renderer = null;
  }
  return renderer;
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Raise when lighting, camera or materials of the sprite renderer change: old cache entries are then ignored. */
export const RENDER_VERSION = 1;

const contentHashes = new WeakMap<FurnitureDef, string>();
/** Hash over the furniture definition including its children, so cached sprites expire when a model changes. */
export function contentHash(def: FurnitureDef, lookup: DefLookup, depth = 0): string {
  const known = contentHashes.get(def);
  if (known) return known;
  const kids =
    depth < 3
      ? (def.children ?? []).map((c) => {
          const d = lookup(c.defId);
          return d ? contentHash(d, lookup, depth + 1) : "";
        })
      : [];
  const h = hash(JSON.stringify(def) + kids.join(","));
  contentHashes.set(def, h);
  return h;
}

/** Counters for tests and diagnostics: how many sprites were rendered vs. loaded from the cache. */
const stats = { rendered: 0, fromCache: 0 };
if (typeof window !== "undefined") (window as unknown as { __raisSprites: typeof stats }).__raisSprites = stats;
let reading = 0;
let pruned = false;

export function spriteKey(def: FurnitureDef, size: Size, res: number) {
  const r = (v: number) => Math.round(v * 100);
  const version = def.custom || def.id.startsWith("preview") ? hash(JSON.stringify(def)) : "";
  return `${def.id}${version}|${r(size.w)}|${r(size.d)}|${r(size.h)}|${size.color ?? ""}|${res}`;
}

// sequential queue so many requests don't freeze the UI
const queue: { key: string; run: () => Promise<void> }[] = [];
const pending = new Set<string>();
let running = false;
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      await job.run();
    } catch (e) {
      console.warn("Draufsicht fehlgeschlagen", e);
    }
    pending.delete(job.key);
    await new Promise((r) => setTimeout(r, 0));
  }
  running = false;
}

/** Renders a top view; pxPerMeter controls the resolution (capped at 1600 px per side). */
async function renderTopView(def: FurnitureDef, size: Size, lookup: DefLookup, pxPerMeter: number) {
  const gl = getRenderer();
  if (!gl) return null;
  // cut at 1.4 m like a floor plan: shower heads, wall cabinets and lamps above do not cover the view
  const obj = await buildFurniture(def, size, lookup, 0, { planCut: 1.4 });
  const W = size.w * (1 + 2 * SPRITE_MARGIN);
  const D = size.d * (1 + 2 * SPRITE_MARGIN);
  const scale = Math.min(pxPerMeter, 1600 / Math.max(W, D));
  const pw = Math.max(16, Math.round(W * scale));
  const ph = Math.max(16, Math.round(D * scale));
  gl.setPixelRatio(1);
  gl.setSize(pw, ph, false);

  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.add(obj);
  scene.environmentIntensity = 0.3;
  scene.add(new THREE.HemisphereLight(0xfffaf2, 0x6f675d, 0.3));
  // slanted light from the back left: cushions, pillows and legs cast small shadows for depth
  // moderate intensity so white linen keeps its folds instead of burning out
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.45);
  const reach = Math.max(size.w, size.d, size.h) + 1;
  // low enough to show folds and rims, high enough for short shadows
  sun.position.set(-1.1 * reach, 1.0 * reach, -1.0 * reach);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const sc = sun.shadow.camera;
  sc.left = -reach;
  sc.right = reach;
  sc.top = reach;
  sc.bottom = -reach;
  sc.near = 0.1;
  sc.far = reach * 6;
  scene.add(sun);

  const top = (def.elevation ?? 0) + size.h + 2;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0.01, top + 5);
  cam.position.set(0, top, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  gl.render(scene, cam);
  const url = gl.domElement.toDataURL("image/png");
  return url;
}

export function requestSprite(def: FurnitureDef, size: Size, lookup: DefLookup, res: number) {
  const key = spriteKey(def, size, res);
  if (useSpriteStore.getState().urls[key] || pending.has(key) || disabled) return key;
  pending.add(key);
  const stored = `${RENDER_VERSION}:${contentHash(def, lookup)}:${key}`;
  const set = (url: string) => useSpriteStore.setState((s) => ({ urls: { ...s.urls, [key]: url } }));
  reading++;
  void getSprite(stored)
    .then((cached) => {
      if (cached) {
        stats.fromCache++;
        pending.delete(key);
        set(cached);
        return;
      }
      queue.push({
        key,
        run: async () => {
          const url = await renderTopView(def, size, lookup, res);
          if (!url) return;
          stats.rendered++;
          set(url);
          void putSprite(stored, url);
        },
      });
      void pump();
    })
    .finally(() => {
      reading--;
      if (!pruned) {
        pruned = true;
        setTimeout(() => void pruneSprites(), 15000);
      }
    });
  return key;
}

/** Returns the sprite URL once rendered (undefined until then or when disabled). */
export function useSprite(def: FurnitureDef | undefined, size: Size, lookup: DefLookup, res: number, enabled = true) {
  const { w, d, h, color } = size;
  const key = def ? spriteKey(def, { w, d, h, color }, res) : "";
  const url = useSpriteStore((s) => (key ? s.urls[key] : undefined));
  useEffect(() => {
    if (def && enabled) requestSprite(def, { w, d, h, color }, lookup, res);
  }, [def, w, d, h, color, lookup, res, enabled]);
  return enabled ? url : undefined;
}

/** True once the element has been on screen (lazy thumbnails). */
export function useOnScreen<T extends Element>(ref: React.RefObject<T | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

/** Waits until every sprite currently queued is rendered (used before exporting the plan). */
export async function spritesIdle(timeoutMs = 20000) {
  const start = Date.now();
  while ((running || queue.length || reading > 0) && Date.now() - start < timeoutMs)
    await new Promise((r) => setTimeout(r, 100));
}
