// Procedural textiles: duvet, pillow, throw and towel. Pure geometry (no WebGL needed),
// all centered on the part box: x across, y up, z along the depth (front = +z).
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Smooth deterministic value noise in [-1, 1]. */
export function noise2(x: number, y: number, seed = 1) {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const v = a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
  return v * 2 - 1;
}

/** Layered noise: soft folds plus fine creases. */
function folds(x: number, z: number, seed: number) {
  return (
    noise2(x * 3.2, z * 2.1, seed) * 0.6 +
    noise2(x * 7.5, z * 6.3, seed + 7) * 0.3 +
    noise2(x * 18, z * 15, seed + 13) * 0.1
  );
}

/**
 * Profile across one axis of a draped cloth: flat top, rounded edge, then hanging down.
 * t is the unfolded distance from the center (signed), returns lateral position and drop below the top.
 */
function drapeProfile(t: number, half: number, radius: number) {
  const sign = Math.sign(t) || 1;
  const a = Math.max(0, half - radius);
  const s = Math.abs(t);
  if (s <= a) return { pos: t, drop: 0, hanging: 0 };
  const arc = (radius * Math.PI) / 2;
  const k = s - a;
  if (k <= arc) {
    const ang = k / radius;
    return {
      pos: sign * (a + radius * Math.sin(ang)),
      drop: radius * (1 - Math.cos(ang)),
      hanging: ang / (Math.PI / 2),
    };
  }
  return { pos: sign * (a + radius), drop: radius + (k - arc), hanging: 1 };
}

/** Stores a grey-level per vertex as vertex colour (multiplied with the material colour). */
function withShade(geo: THREE.BufferGeometry, shade: Float32Array) {
  const c = new Float32Array(shade.length * 3);
  for (let i = 0; i < shade.length; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = Math.max(0.55, Math.min(1, shade[i]));
  geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return geo;
}

function finish(geo: THREE.BufferGeometry) {
  // uv stays: the woven fabric bump map needs it
  const merged = mergeVertices(geo, 1e-5);
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  return merged;
}

export interface DrapeOptions {
  /** How high the cloth bulges above its flat top (m). */
  puff?: number;
  /** Fold amplitude (m). */
  wrinkle?: number;
  /** Quilting: size of the stitched down-filled cells (m), 0 = none. */
  quilt?: number;
  /** Which edges hang down: [left, right, head(-z), foot(+z)]. */
  hang?: [boolean, boolean, boolean, boolean];
  seed?: number;
}

/**
 * Draped cloth over a w×d top, hanging down by h at the chosen edges.
 * The part box (w, h, d) is filled: the top sits at +h/2, the hem at -h/2.
 */
export function drapedClothGeometry(w: number, h: number, d: number, opt: DrapeOptions = {}) {
  const puff = opt.puff ?? Math.min(0.05, h * 0.3);
  const wrinkle = opt.wrinkle ?? 0.03;
  const quilt = opt.quilt ?? 0;
  const [hl, hr, hh, hf] = opt.hang ?? [true, true, false, true];
  const seed = opt.seed ?? 3;
  const radius = Math.min(0.07, h * 0.45, w * 0.2, d * 0.2);
  const drop = Math.max(0, h - radius - puff);
  const arc = (radius * Math.PI) / 2;
  // unfolded extents (only edges that hang get the extra length)
  const ext = (on: boolean) => (on ? arc + drop : 0);
  const halfW = w / 2;
  const halfD = d / 2;
  const x0 = -(halfW - (hl ? radius : 0) + ext(hl));
  const x1 = halfW - (hr ? radius : 0) + ext(hr);
  const z0 = -(halfD - (hh ? radius : 0) + ext(hh));
  const z1 = halfD - (hf ? radius : 0) + ext(hf);
  const nx = 72;
  const nz = 96;
  const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const shade = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0..1
    const v = 0.5 - pos.getY(i); // 0..1, PlaneGeometry y goes up
    const tx = x0 + (x1 - x0) * u;
    const tz = z0 + (z1 - z0) * v;
    const px =
      tx < 0
        ? hl
          ? drapeProfile(tx, halfW, radius)
          : { pos: tx, drop: 0, hanging: 0 }
        : hr
          ? drapeProfile(tx, halfW, radius)
          : { pos: tx, drop: 0, hanging: 0 };
    const pz =
      tz < 0
        ? hh
          ? drapeProfile(tz, halfD, radius)
          : { pos: tz, drop: 0, hanging: 0 }
        : hf
          ? drapeProfile(tz, halfD, radius)
          : { pos: tz, drop: 0, hanging: 0 };
    const hanging = Math.max(px.hanging, pz.hanging);
    // bulge: highest in the middle, falling off towards the edges
    const bx = 1 - Math.pow(Math.min(1, Math.abs(px.pos) / halfW), 4);
    const bz = 1 - Math.pow(Math.min(1, Math.abs(pz.pos) / halfD), 4);
    const bulge = puff * bx * bz;
    // long soft diagonal folds (how a duvet settles) plus irregular creases
    const f =
      folds(tx, tz, seed) +
      0.55 * Math.sin(tx * 7.5 + tz * 3.1 + seed) * (0.6 + 0.4 * noise2(tx * 1.3, tz * 1.1, seed + 3));
    // hanging cloth swings in and out (wavy hem), the top has soft creases
    const amp = wrinkle * (0.6 + 1.4 * hanging);
    // stitched cells: each one puffs up, seams sit lower
    let cells = 0;
    let seam = 0;
    if (quilt > 0) {
      const cx = 0.5 - 0.5 * Math.cos((2 * Math.PI * tx) / quilt);
      const cz = 0.5 - 0.5 * Math.cos((2 * Math.PI * tz) / quilt);
      seam = 1 - Math.sqrt(cx * cz);
      cells = Math.sqrt(cx * cz) * Math.min(0.032, puff * 0.7) - Math.min(0.032, puff * 0.7);
    }
    const y =
      h / 2 -
      puff +
      bulge +
      cells * (1 - hanging) -
      Math.min(px.drop + pz.drop, h - 0.001) +
      f * wrinkle * 0.8 * (1 - hanging);
    let x = px.pos;
    let z = pz.pos;
    if (px.hanging > 0) x += Math.sign(px.pos) * f * amp * px.hanging;
    if (pz.hanging > 0) z += Math.sign(pz.pos) * f * amp * pz.hanging;
    x = Math.max(-halfW, Math.min(halfW, x));
    z = Math.max(-halfD, Math.min(halfD, z));
    pos.setXYZ(i, x, Math.max(-h / 2, y), z);
    // baked ambient occlusion: seams, fold valleys and the hanging sides are darker
    shade[i] = 1 - 0.2 * Math.pow(seam, 3) * (1 - hanging) - 0.16 * Math.max(0, -f) - 0.08 * hanging;
  }
  return finish(withShade(geo, shade));
}

/** Puffy pillow: thick in the middle, seams pinched to sharp-ish corners, light creases. */
export function pillowGeometry(w: number, h: number, d: number, seed = 5) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 24, 10, 24);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const shade = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ex = Math.pow(Math.abs(2 * x), 2.6);
    const ez = Math.pow(Math.abs(2 * z), 2.6);
    const thick = Math.max(0.06, (1 - ex) * (1 - ez));
    const sy = y * Math.sqrt(thick);
    // the seam pulls the edges in a little, corners stick out
    const pinch = 1 - 0.07 * (1 - Math.abs(2 * y)) * (1 - Math.max(ex, ez));
    const crease = noise2(x * 6 + 3, z * 6, seed) * 0.03 * thick;
    pos.setXYZ(i, x * w * pinch, (sy + crease) * h, z * d * pinch);
    shade[i] = 1 - 0.22 * (1 - Math.sqrt(thick)) - 0.25 * Math.max(0, -crease) * 10;
  }
  return finish(withShade(geo, shade));
}

/** Folded towel hanging over a bar: two layers with a rounded fold on top. */
export function towelGeometry(w: number, h: number, d: number, seed = 9) {
  const geo = new THREE.BoxGeometry(1, 1, 1, 16, 24, 6);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const top = Math.max(0, y + 0.5 - 0.88) / 0.12; // rounded fold near the top
    const zz = z * (1 - 0.6 * top * top);
    const wave = noise2(x * 4, y * 3, seed) * 0.08 * (0.5 - y);
    pos.setXYZ(i, x * w * (1 - 0.03 * Math.abs(wave)), y * h, (zz + wave * 0.5) * d);
  }
  return finish(geo);
}
