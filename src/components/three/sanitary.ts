// Procedural sanitary ceramics: real hollow basins built by lofting superellipse rings.
// Pure geometry, centered on the part box: x across, y up, z along the depth (front = +z).
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface Ring {
  /** Half extents in x and z. */
  a: number;
  b: number;
  y: number;
  /** Superellipse exponent: 2 = ellipse, higher = rounded rectangle. */
  n: number;
  /** Center offset (e.g. sloped back of a bathtub). */
  cx?: number;
  cz?: number;
  /** Narrows the front (+z) like an egg, 0..1. */
  taper?: number;
}

const SEG = 96;

function ringPoint(r: Ring, t: number): [number, number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const e = 2 / r.n;
  let x = r.a * Math.sign(c) * Math.pow(Math.abs(c), e);
  const z = r.b * Math.sign(s) * Math.pow(Math.abs(s), e);
  if (r.taper && z > 0) x *= 1 - r.taper * (z / r.b) * (z / r.b);
  return [x + (r.cx ?? 0), r.y, z + (r.cz ?? 0)];
}

/** Lofts a surface through the rings (in order). capEnd closes the last ring with a fan. */
export function loft(rings: Ring[], capEnd = true, capStart = false) {
  const positions: number[] = [];
  const idx: number[] = [];
  for (const r of rings) {
    for (let i = 0; i < SEG; i++) positions.push(...ringPoint(r, (i / SEG) * Math.PI * 2));
  }
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < SEG; i++) {
      const a = k * SEG + i;
      const b = k * SEG + ((i + 1) % SEG);
      const c = (k + 1) * SEG + i;
      const d = (k + 1) * SEG + ((i + 1) % SEG);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (k: number, flip: boolean) => {
    const r = rings[k];
    const center = positions.length / 3;
    positions.push(r.cx ?? 0, r.y, r.cz ?? 0);
    for (let i = 0; i < SEG; i++) {
      const a = k * SEG + i;
      const b = k * SEG + ((i + 1) % SEG);
      if (flip) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  };
  if (capEnd) cap(rings.length - 1, false);
  if (capStart) cap(0, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(idx);
  return geo;
}

function done(geo: THREE.BufferGeometry) {
  const g = mergeVertices(geo, 1e-6);
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

/** Rounded rim profile between an outer and inner ring (a few rings for a smooth bead). */
function rim(outer: Ring, inner: Ring, height: number): Ring[] {
  const steps = 5;
  const out: Ring[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI;
    out.push({
      ...outer,
      a: outer.a + (inner.a - outer.a) * t,
      b: outer.b + (inner.b - outer.b) * t,
      cx: (outer.cx ?? 0) + ((inner.cx ?? 0) - (outer.cx ?? 0)) * t,
      y: outer.y + Math.sin(ang) * height,
      n: outer.n + (inner.n - outer.n) * t,
    });
  }
  return out;
}

/**
 * Built-in bathtub: apron, wide rounded rim and a deep basin with a sloped backrest
 * at the -x end. The box (w, h, d) is filled.
 */
export function bathtubGeometry(w: number, h: number, d: number) {
  const bottom = -h / 2;
  const top = h / 2 - 0.012;
  const rimW = Math.min(0.09, d * 0.13);
  const outerTop: Ring = { a: w / 2, b: d / 2, y: top, n: 10 };
  const innerTop: Ring = { a: w / 2 - rimW * 1.3, b: d / 2 - rimW, y: top, n: 6, cx: rimW * 0.15 };
  const depth = Math.min(h - 0.08, 0.45);
  const rings: Ring[] = [
    { a: w / 2 - 0.005, b: d / 2 - 0.005, y: bottom, n: 10 },
    { a: w / 2, b: d / 2, y: bottom + 0.01, n: 10 },
    outerTop,
    ...rim(outerTop, innerTop, 0.012).slice(1),
    { ...innerTop, y: top - 0.03 },
    // the backrest slopes, so the inner floor shifts towards the foot end
    {
      ...innerTop,
      a: innerTop.a * 0.94,
      b: innerTop.b * 0.95,
      y: top - depth * 0.45,
      n: 5,
      cx: rimW * 0.15 + w * 0.04,
    },
    {
      ...innerTop,
      a: innerTop.a * 0.84,
      b: innerTop.b * 0.86,
      y: top - depth * 0.85,
      n: 4.5,
      cx: rimW * 0.15 + w * 0.08,
    },
    { ...innerTop, a: innerTop.a * 0.76, b: innerTop.b * 0.76, y: top - depth, n: 4, cx: rimW * 0.15 + w * 0.09 },
  ];
  const shell = loft(rings, true, true);
  return done(shell);
}

/** Washbasin bowl (countertop vessel or inset), oval. Box filled; rim on top. */
export function basinGeometry(w: number, h: number, d: number) {
  const bottom = -h / 2;
  const top = h / 2 - 0.006;
  const wall = Math.min(0.014, w * 0.04);
  const outerTop: Ring = { a: w / 2, b: d / 2, y: top, n: 2.6 };
  const innerTop: Ring = { a: w / 2 - wall, b: d / 2 - wall, y: top, n: 2.6 };
  const rings: Ring[] = [
    { a: w * 0.32, b: d * 0.32, y: bottom, n: 2.4 },
    { a: w * 0.44, b: d * 0.44, y: bottom + h * 0.35, n: 2.5 },
    outerTop,
    ...rim(outerTop, innerTop, 0.006).slice(1),
    { ...innerTop, a: innerTop.a * 0.93, b: innerTop.b * 0.92, y: top - h * 0.45 },
    { ...innerTop, a: innerTop.a * 0.62, b: innerTop.b * 0.6, y: top - h * 0.85 },
    { ...innerTop, a: innerTop.a * 0.25, b: innerTop.b * 0.25, y: top - h * 0.9 },
  ];
  return done(loft(rings, true, true));
}

/** Shallow shower tray with a gentle slope to the center. */
export function trayGeometry(w: number, h: number, d: number) {
  const bottom = -h / 2;
  const top = h / 2;
  const outerTop: Ring = { a: w / 2, b: d / 2, y: top, n: 14 };
  const innerTop: Ring = { a: w / 2 - 0.035, b: d / 2 - 0.035, y: top, n: 12 };
  const rings: Ring[] = [
    { a: w / 2, b: d / 2, y: bottom, n: 14 },
    outerTop,
    ...rim(outerTop, innerTop, 0.004).slice(1),
    { ...innerTop, y: top - h * 0.5 },
    { ...innerTop, a: innerTop.a * 0.5, b: innerTop.b * 0.5, y: top - h * 0.65 },
  ];
  return done(loft(rings, true, true));
}

/** Wall-hung toilet: egg-shaped bowl with closed seat and lid. Box filled. */
export function toiletGeometry(w: number, h: number, d: number) {
  const bottom = -h / 2;
  const top = h / 2;
  const lidT = Math.min(0.03, h * 0.15);
  const bowlTop = top - lidT * 1.6;
  const taper = 0.32;
  const outerTop: Ring = { a: w / 2 - 0.005, b: d / 2 - 0.005, y: bowlTop, n: 2.3, taper };
  const innerTop: Ring = { a: w / 2 - 0.035, b: d / 2 - 0.04, y: bowlTop, n: 2.3, taper };
  const bowl = loft(
    [
      { a: w * 0.3, b: d * 0.36, y: bottom, n: 2.4, cz: -d * 0.05, taper },
      { a: w * 0.44, b: d * 0.45, y: bottom + (bowlTop - bottom) * 0.55, n: 2.3, taper },
      outerTop,
      ...rim(outerTop, innerTop, 0.008).slice(1),
      { ...innerTop, a: innerTop.a * 0.55, b: innerTop.b * 0.5, y: bowlTop - (bowlTop - bottom) * 0.6, cz: -d * 0.06 },
    ],
    true,
    true,
  );
  // seat and closed lid as two soft slabs
  const slab = (y0: number, y1: number, inset: number) =>
    loft(
      [
        { a: w / 2 - inset, b: d / 2 - inset, y: y0, n: 2.4, taper },
        { a: w / 2 - inset + 0.004, b: d / 2 - inset + 0.004, y: y0 + (y1 - y0) * 0.5, n: 2.4, taper },
        { a: w / 2 - inset - 0.006, b: d / 2 - inset - 0.006, y: y1, n: 2.4, taper },
      ],
      true,
      true,
    );
  const seat = slab(bowlTop, bowlTop + lidT * 0.5, 0.004);
  const lid = slab(bowlTop + lidT * 0.55, top, 0.008);
  return done(mergeGeometries([bowl, seat, lid])!);
}

/** Single-lever mixer: round base, slim body and a spout bending towards the front (+z). */
export function faucetGeometry(w: number, h: number, d: number) {
  const r = Math.max(0.004, Math.min(w, d) * 0.18);
  const base = new THREE.CylinderGeometry(r * 1.5, r * 1.6, h * 0.06, 32);
  base.translate(0, -h / 2 + h * 0.03, -d / 2 + r * 1.6);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -h / 2, -d / 2 + r * 1.6),
    new THREE.Vector3(0, h * 0.25, -d / 2 + r * 1.6),
    new THREE.Vector3(0, h / 2 - r, -d / 2 + r * 2.5),
    new THREE.Vector3(0, h / 2 - r * 1.2, d * 0.15),
    new THREE.Vector3(0, h / 2 - r * 3, d / 2 - r),
  ]);
  const spout = new THREE.TubeGeometry(curve, 48, r, 20, false);
  const lever = new THREE.CylinderGeometry(r * 0.45, r * 0.45, d * 0.35, 16);
  lever.rotateX(Math.PI / 2 - 0.35);
  lever.translate(0, h * 0.05, -d / 2 - d * 0.02);
  for (const g of [base, spout, lever]) {
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
  }
  return done(mergeGeometries([base.toNonIndexed(), spout.toNonIndexed(), lever.toNonIndexed()])!);
}
