import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { etaSeconds, prepareScene, type PathSceneInput } from "./pathTrace";

function input(daylight: number, lamps = 0): PathSceneInput {
  const content = new THREE.Group();
  content.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  const sel = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  content.add(sel);
  const helper = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  helper.userData.noExport = true;
  content.add(helper);
  return {
    content,
    camera: new THREE.PerspectiveCamera(),
    sun: { dir: { x: 0, y: 1, z: 0 }, color: "#ffffff", daylight },
    lamps: Array.from({ length: lamps }, () => ({
      position: [0, 2, 0] as [number, number, number],
      color: "#ffe6c4",
      intensity: 3,
      distance: 6,
    })),
    center: { x: 0, z: 0 },
    span: 10,
  };
}

const count = (s: THREE.Scene, pred: (o: THREE.Object3D) => boolean) => {
  let n = 0;
  s.traverse((o) => {
    if (pred(o)) n++;
  });
  return n;
};

describe("prepareScene", () => {
  it("drops helpers and selection lines but keeps the content and adds a ground", () => {
    const src = input(1);
    const s = prepareScene(src);
    expect(count(s, (o) => (o as THREE.Mesh).isMesh)).toBe(2); // box + ground
    expect(count(s, (o) => (o as THREE.LineSegments).isLineSegments)).toBe(0);
    // the editor's own group stays untouched
    expect(src.content.children).toHaveLength(3);
  });
  it("uses the sun by day and the lamps in the evening", () => {
    expect(count(prepareScene(input(1)), (o) => (o as THREE.DirectionalLight).isDirectionalLight)).toBe(1);
    const night = prepareScene(input(0, 2));
    expect(count(night, (o) => (o as THREE.DirectionalLight).isDirectionalLight)).toBe(0);
    expect(count(night, (o) => (o as THREE.PointLight).isPointLight)).toBe(2);
  });
});

describe("etaSeconds", () => {
  it("extrapolates linearly", () => {
    expect(etaSeconds(10, 100, 5000)).toBeCloseTo(45);
    expect(etaSeconds(0, 100, 1000)).toBe(Infinity);
    expect(etaSeconds(120, 100, 1000)).toBe(0);
  });
});

describe("glass", () => {
  it("is rendered thin-walled without touching the editor's material", () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 0.9, thickness: 0.01 });
    const src = input(1);
    src.content.add(new THREE.Mesh(new THREE.PlaneGeometry(), glass));
    const s = prepareScene(src);
    let found: THREE.MeshPhysicalMaterial | null = null;
    s.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
      if (m?.isMeshPhysicalMaterial && m.transmission > 0) found = m;
    });
    expect(found).not.toBeNull();
    expect(found!.thickness).toBe(0);
    expect(glass.thickness).toBe(0.01);
  });
});
