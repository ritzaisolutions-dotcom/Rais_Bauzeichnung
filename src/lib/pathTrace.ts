// Photoreal still images: the current 3D view is path traced offscreen with
// three-gpu-pathtracer (WebGL2). The library is loaded on demand only.
import * as THREE from "three";

export interface PathSceneInput {
  /** The editor's content group (walls, floors, furniture); cloned, not modified. */
  content: THREE.Object3D;
  camera: THREE.Camera;
  /** Direction towards the sun, its colour and 0..1 daylight. */
  sun: { dir: { x: number; y: number; z: number }; color: string; daylight: number };
  lamps: { position: [number, number, number]; color: string; intensity: number; distance: number }[];
  /** Scene centre and size, to place the sun far enough away. */
  center: { x: number; z: number };
  span: number;
}

export const BACKGROUND = "#e9e5dd";

/** Builds a standalone scene for the path tracer: no helpers, sun, lamps, ground. */
export function prepareScene(input: PathSceneInput) {
  const scene = new THREE.Scene();
  const content = input.content.clone(true);
  const drop: THREE.Object3D[] = [];
  content.traverse((o) => {
    if (o.userData.noExport || (o as THREE.LineSegments).isLineSegments || (o as THREE.Line).isLine) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  // glass in furniture is modelled as open sheets: render it thin-walled, otherwise
  // paths "enter" a medium they never leave and the whole image goes dark
  const thin = new Map<THREE.Material, THREE.Material>();
  content.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const fix = (mat: THREE.Material) => {
      const p = mat as THREE.MeshPhysicalMaterial;
      if (!p.isMeshPhysicalMaterial || !(p.transmission > 0) || p.thickness === 0) return mat;
      let c = thin.get(mat);
      if (!c) {
        const copy = p.clone();
        copy.thickness = 0;
        thin.set(mat, (c = copy));
      }
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
    m.geometry = dequantize(m.geometry);
  });
  scene.add(content);

  // ground like the editor background
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(input.span * 8, input.span * 8),
    new THREE.MeshStandardMaterial({ color: BACKGROUND, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(input.center.x, -0.012, input.center.z);
  scene.add(ground);

  if (input.sun.daylight > 0.01) {
    const sun = new THREE.DirectionalLight(input.sun.color, 2.2 * input.sun.daylight);
    const d = input.span * 3;
    sun.position.set(input.center.x + input.sun.dir.x * d, input.sun.dir.y * d, input.center.z + input.sun.dir.z * d);
    sun.target.position.set(input.center.x, 0, input.center.z);
    scene.add(sun, sun.target);
  }
  for (const l of input.lamps) {
    const p = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
    p.position.set(...l.position);
    scene.add(p);
  }
  scene.updateMatrixWorld(true);
  return scene;
}

const floatGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/**
 * Optimised GLB models store positions, normals and UVs as normalised integers
 * (mesh quantisation). The path tracer copies attribute arrays as they are, so
 * those models would become huge and cover the whole image. Give it floats.
 */
export function dequantize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const quantized = Object.values(g.attributes).some(
    (a) => (a as THREE.BufferAttribute).normalized || !((a as THREE.BufferAttribute).array instanceof Float32Array),
  );
  if (!quantized) return g;
  const known = floatGeometries.get(g);
  if (known) return known;
  const out = g.clone();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const a = attr as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    if (!a.normalized && a.array instanceof Float32Array && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)
      continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  floatGeometries.set(g, out);
  return out;
}

/** Remaining seconds from the samples done so far. */
export function etaSeconds(samples: number, target: number, elapsedMs: number) {
  if (samples <= 0) return Infinity;
  return Math.max(0, ((target - samples) * elapsedMs) / samples / 1000);
}

export class PathTraceUnsupported extends Error {}

export interface PhotoOptions {
  width: number;
  height: number;
  samples: number;
  signal?: AbortSignal;
  onProgress?: (p: { phase: "prepare" | "render"; samples: number; etaS: number; preview?: HTMLCanvasElement }) => void;
}

/** Renders the scene and resolves with a PNG. Throws PathTraceUnsupported without WebGL2 float support. */
export async function renderPhoto(input: PathSceneInput, o: PhotoOptions): Promise<Blob> {
  const { WebGLPathTracer, GradientEquirectTexture } = await import("three-gpu-pathtracer");
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  } catch {
    throw new PathTraceUnsupported("WebGL2 ist nicht verfügbar.");
  }
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!(gl instanceof WebGL2RenderingContext) || !gl.getExtension("EXT_color_buffer_float")) {
    renderer.dispose();
    throw new PathTraceUnsupported("Der Browser unterstützt keine Gleitkomma-Texturen (WebGL2).");
  }
  renderer.setPixelRatio(1);
  renderer.setSize(o.width, o.height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = prepareScene(input);
  const sky = new GradientEquirectTexture(256);
  sky.topColor.set("#dfe9f5");
  sky.bottomColor.set(BACKGROUND);
  sky.exponent = 1.6;
  sky.update();
  scene.environment = sky;
  scene.environmentIntensity = 0.25 + 0.75 * input.sun.daylight;
  scene.background = new THREE.Color(BACKGROUND);

  const camera = input.camera.clone() as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    (camera as THREE.PerspectiveCamera).aspect = o.width / o.height;
  }
  camera.updateProjectionMatrix();

  const tracer = new WebGLPathTracer(renderer);
  const big = o.width * o.height > 2_500_000;
  tracer.tiles.set(big ? 3 : 2, big ? 3 : 2);
  tracer.bounces = 6;
  tracer.transmissiveBounces = 8;
  tracer.multipleImportanceSampling = true;
  tracer.filterGlossyFactor = 0.5;
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 1;
  tracer.rasterizeScene = false;
  tracer.dynamicLowRes = false;
  // all material maps share one texture array: 512² layers keep it small (50 maps ≈ 50 MB)
  tracer.textureSize.set(512, 512);

  const cleanup = () => {
    tracer.dispose();
    sky.dispose();
    renderer.dispose();
  };
  try {
    o.onProgress?.({ phase: "prepare", samples: 0, etaS: Infinity });
    // let the dialog paint "preparing" before the (synchronous) BVH build
    await new Promise((r) => setTimeout(r, 50));
    tracer.setScene(scene, camera);
    const start = performance.now();
    let lastPreview = 0;
    while (tracer.samples < o.samples) {
      if (o.signal?.aborted) break;
      tracer.renderSample();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const now = performance.now();
      if (now - lastPreview > 400) {
        lastPreview = now;
        o.onProgress?.({
          phase: "render",
          samples: tracer.samples,
          etaS: etaSeconds(tracer.samples, o.samples, now - start),
          preview: canvas,
        });
      }
    }
    if (tracer.samples < 1) throw new DOMException("Abgebrochen", "AbortError");
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Das Bild konnte nicht gespeichert werden.");
    return blob;
  } finally {
    cleanup();
  }
}
