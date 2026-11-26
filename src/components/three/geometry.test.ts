import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { drapedClothGeometry, pillowGeometry, towelGeometry } from "./cloth";
import { basinGeometry, bathtubGeometry, faucetGeometry, toiletGeometry, trayGeometry } from "./sanitary";

function check(geo: THREE.BufferGeometry, w: number, h: number, d: number, tol = 0.02) {
  const pos = geo.attributes.position.array as Float32Array;
  for (const v of pos) expect(Number.isFinite(v)).toBe(true);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const size = b.getSize(new THREE.Vector3());
  expect(size.x).toBeLessThanOrEqual(w + tol);
  expect(size.y).toBeLessThanOrEqual(h + tol);
  expect(size.z).toBeLessThanOrEqual(d + tol);
  expect(size.x).toBeGreaterThan(w * 0.8);
  expect(size.z).toBeGreaterThan(d * 0.8);
  return b;
}

/** Highest point along a vertical line at (x, z): the surface you would see from above. */
function surfaceHeightAt(geo: THREE.BufferGeometry, x: number, z: number) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(mesh)[0]?.point.y;
}

describe("sanitary geometry", () => {
  it("bathtub is hollow with a rim", () => {
    const g = bathtubGeometry(1.7, 0.58, 0.75);
    check(g, 1.7, 0.58, 0.75);
    const rim = surfaceHeightAt(g, 0, 0.75 / 2 - 0.03)!;
    const floor = surfaceHeightAt(g, 0.2, 0)!;
    expect(rim - floor).toBeGreaterThan(0.3);
  });
  it("basin, tray, toilet and faucet fit their boxes", () => {
    const basin = basinGeometry(0.42, 0.14, 0.32);
    check(basin, 0.42, 0.14, 0.32);
    expect(surfaceHeightAt(basin, 0.19, 0)! - surfaceHeightAt(basin, 0, 0)!).toBeGreaterThan(0.06);
    check(trayGeometry(0.9, 0.04, 0.9), 0.9, 0.04, 0.9);
    check(toiletGeometry(0.36, 0.42, 0.54), 0.36, 0.42, 0.54);
    const f = faucetGeometry(0.05, 0.25, 0.16);
    for (const v of f.attributes.position.array as Float32Array) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("cloth geometry", () => {
  it("duvet drapes over the sides and stays inside its box", () => {
    const g = drapedClothGeometry(1.86, 0.25, 1.5);
    check(g, 1.86, 0.25, 1.5, 0.05);
    const top = surfaceHeightAt(g, 0, 0)!;
    expect(top).toBeGreaterThan(0.05);
  });
  it("pillow is thick in the middle and thin at the edge", () => {
    const g = pillowGeometry(0.8, 0.2, 0.5);
    check(g, 0.8, 0.2, 0.5);
    expect(surfaceHeightAt(g, 0, 0)!).toBeGreaterThan(surfaceHeightAt(g, 0.38, 0.23)! + 0.04);
    check(towelGeometry(0.5, 0.6, 0.06), 0.5, 0.6, 0.06);
  });
});
