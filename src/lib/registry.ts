"use client";

import type { Object3D } from "three";

/** Handles the toolbar needs for exports (current SVG plan, 3D canvas, scene). */
export const registry: {
  svg: SVGSVGElement | null;
  fit: (() => void) | null;
  glCanvas: HTMLCanvasElement | null;
  scene: Object3D | null;
  /** Renders the current 3D view at the given pixel width. */
  renderHiRes: ((width: number) => Promise<Blob | null>) | null;
} = { svg: null, fit: null, glCanvas: null, scene: null, renderHiRes: null };
