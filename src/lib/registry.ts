"use client";

import type { Object3D } from "three";
import type { PathSceneInput } from "./pathTrace";

/** Handles the toolbar needs for exports (current SVG plan, 3D canvas, scene). */
export const registry: {
  svg: SVGSVGElement | null;
  fit: (() => void) | null;
  glCanvas: HTMLCanvasElement | null;
  scene: Object3D | null;
  /** Renders the current 3D view at the given pixel width. */
  renderHiRes: ((width: number) => Promise<Blob | null>) | null;
  /** Everything the path tracer needs for the current 3D view (camera, content, sun, lamps). */
  pathScene: (() => PathSceneInput | null) | null;
} = { svg: null, fit: null, glCanvas: null, scene: null, renderHiRes: null, pathScene: null };
