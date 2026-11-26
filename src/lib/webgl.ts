"use client";

let cached: boolean | null = null;

/** True when the browser can create a WebGL context (needed for 3D and furniture top views). */
export function hasWebGL() {
  if (cached !== null) return cached;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    cached = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
