"use client";

import type { Object3D } from "three";

/** Handles the toolbar needs for exports (current SVG plan, 3D canvas, scene). */
export const registry: {
  svg: SVGSVGElement | null;
  fit: (() => void) | null;
  glCanvas: HTMLCanvasElement | null;
  scene: Object3D | null;
} = { svg: null, fit: null, glCanvas: null, scene: null };
