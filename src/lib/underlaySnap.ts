"use client";

// Detects wall axes in the underlay once per drawing (off the main thread) and
// keeps them for snapping. Results are in underlay pixels.
import { useEffect, useMemo, useState } from "react";
import type { Underlay } from "@/model/types";
import { loadImg } from "./planImport";
import { detectUnderlayLines, toWorldLines, type Bitmap, type UnderlayLines } from "./underlayLines";

const MAX_PX = 2400;
const cache = new Map<string, Promise<UnderlayLines | null>>();
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (l: UnderlayLines) => void>();

const keyOf = (u: Underlay) => `${u.widthPx}x${u.heightPx}:${u.pxPerMeter}:${u.dataUrl.length}:${u.dataUrl.slice(-64)}`;

function runDetection(bmp: Bitmap, ppm: number): Promise<UnderlayLines> {
  try {
    if (!worker) {
      worker = new Worker(new URL("./underlayLines.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<{ id: number; lines: UnderlayLines }>) => {
        pending.get(e.data.id)?.(e.data.lines);
        pending.delete(e.data.id);
      };
    }
    const id = ++seq;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      worker!.postMessage({ id, bmp, ppm }, [bmp.data.buffer]);
    });
  } catch {
    return Promise.resolve(detectUnderlayLines(bmp, ppm));
  }
}

async function analyse(u: Underlay): Promise<UnderlayLines | null> {
  if (!u.dataUrl.startsWith("data:")) return null;
  const img = await loadImg(u.dataUrl);
  const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  // scale back to underlay pixels so the result does not depend on k
  const kx = c.width / u.widthPx;
  const lines = await runDetection({ data, width: c.width, height: c.height, channels: 4 }, u.pxPerMeter * kx);
  const s = 1 / kx;
  return {
    axes: lines.axes.map((a) => ({ ...a, at: a.at * s, from: a.from * s, to: a.to * s, thickness: a.thickness * s })),
    corners: lines.corners.map((p) => ({ x: p.x * s, y: p.y * s, thickness: p.thickness * s })),
  };
}

export function underlayLines(u: Underlay) {
  const key = keyOf(u);
  let p = cache.get(key);
  if (!p) {
    p = analyse(u).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Wall axes of the underlay in world meters, or null while detecting / when off. */
export function useUnderlayLines(u: Underlay | undefined, enabled: boolean) {
  const [state, setState] = useState<{ key: string; lines: UnderlayLines | null } | null>(null);
  const key = u ? keyOf(u) : "";
  useEffect(() => {
    if (!u || !enabled) return;
    let cancelled = false;
    underlayLines(u).then((lines) => !cancelled && setState({ key: keyOf(u), lines }));
    return () => {
      cancelled = true;
    };
    // the key covers the image; position changes are applied below without re-detecting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  const ux = u?.x;
  const uy = u?.y;
  const ppm = u?.pxPerMeter;
  return useMemo(() => {
    if (!enabled || !state || state.key !== key || !state.lines || ux === undefined) return null;
    return toWorldLines(state.lines, { x: ux, y: uy!, pxPerMeter: ppm! });
  }, [enabled, state, key, ux, uy, ppm]);
}
