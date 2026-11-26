"use client";

import { OrbitControls, OrthographicCamera, PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA } from "@react-three/postprocessing";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";
import clsx from "clsx";
import { Box, Eye, Footprints, Layers, Map as MapIcon, Scissors, Sparkle, Sun as SunIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { findDef } from "@/furniture/catalog";
import { add, computeRoomGeometry, floorBounds, lineInPolygon, mul } from "@/model/geometry";
import type { Floor, FurnitureDef, RoomGeometry } from "@/model/types";
import { pointAlong, solidIntervals, wallFrames, type WallFrame } from "@/model/walls";
import { finishedWallSides, sunAt } from "@/model/finishes";
import { slopeSides } from "@/model/woflv";
import { registry } from "@/lib/registry";
import { useActiveFloor, useEditor, useFurnitureDefs } from "@/store/editor";
import { FurnitureModel } from "./FurnitureModel";
import { floorTexture } from "./materials";

/** Which floors to show: the active one only, with those below, or all. */
type FloorsMode = "one" | "below" | "all";
/** Concrete slab between storeys. */
const SLAB = 0.25;

type CamMode = "orbit" | "top" | "walk";

const WALL_MAT = new THREE.MeshStandardMaterial({ color: "#ebe7e0", roughness: 0.95 });
const WALL_TOP_MAT = new THREE.MeshStandardMaterial({ color: "#2b2a28", roughness: 0.9 });
const GLASS_MAT = new THREE.MeshPhysicalMaterial({
  color: "#bcd6de",
  transparent: true,
  opacity: 0.25,
  roughness: 0.05,
});
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: "#f6f4ef", roughness: 0.45 });
const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: "#c9ccd0", roughness: 0.2, metalness: 1 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: "#3a3a3a", roughness: 0.4, metalness: 0.6 });
const SLOPE_MAT = new THREE.MeshStandardMaterial({ color: "#efebe4", roughness: 0.95, side: THREE.DoubleSide });
/** How far hinged doors stand open in 3D. */
const DOOR_OPEN = (70 * Math.PI) / 180;
const SELECT_MAT = new THREE.LineBasicMaterial({ color: "#2563eb" });

function WallBox({
  f,
  s,
  e,
  y0,
  y1,
  cut,
  material = WALL_MAT,
  thickness,
  offset = 0,
}: {
  f: WallFrame;
  s: number;
  e: number;
  y0: number;
  y1: number;
  cut: number;
  material?: THREE.Material;
  thickness?: number;
  /** Shift off the wall axis along the normal (meters). */
  offset?: number;
}) {
  const top = Math.min(y1, cut);
  if (top <= y0 + 1e-4 || e - s < 1e-4) return null;
  const mid = (s + e) / 2;
  const x = f.a.x + f.dir.x * mid + f.normal.x * offset;
  const z = f.a.y + f.dir.y * mid + f.normal.y * offset;
  const rot = -Math.atan2(f.dir.y, f.dir.x);
  const t = thickness ?? f.wall.thickness;
  const cutTop = y1 > cut;
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, (y0 + top) / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[e - s, top - y0, t]} />
      </mesh>
      {cutTop && material === WALL_MAT && (
        <mesh position={[0, top + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={WALL_TOP_MAT}>
          <planeGeometry args={[e - s, t]} />
        </mesh>
      )}
    </group>
  );
}

/** A box standing on a plan point, turned along a plan direction (door leaves). */
function Slab({
  center,
  dir,
  length,
  thickness,
  y0,
  y1,
  material,
}: {
  center: { x: number; y: number };
  dir: { x: number; y: number };
  length: number;
  thickness: number;
  y0: number;
  y1: number;
  material: THREE.Material;
}) {
  return (
    <mesh
      position={[center.x, (y0 + y1) / 2, center.y]}
      rotation={[0, -Math.atan2(dir.y, dir.x), 0]}
      material={material}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[length, y1 - y0, thickness]} />
    </mesh>
  );
}

function Door({ f, o, cut }: { f: WallFrame; o: WallFrame["openings"][number]; cut: number }) {
  const t = f.wall.thickness;
  const s = o.offset - o.width / 2;
  const e = o.offset + o.width / 2;
  const top = Math.min(f.wall.height, o.sill + o.height);
  const jamb = 0.03;
  const side = o.flipSide ? -1 : 1;
  const leafTop = Math.min(top - 0.01, cut);
  const frame = (
    <>
      <WallBox f={f} s={s} e={s + jamb} y0={0} y1={top} cut={cut} material={FRAME_MAT} thickness={t + 0.02} />
      <WallBox f={f} s={e - jamb} e={e} y0={0} y1={top} cut={cut} material={FRAME_MAT} thickness={t + 0.02} />
      <WallBox f={f} s={s} e={e} y0={top - jamb} y1={top} cut={cut} material={FRAME_MAT} thickness={t + 0.02} />
    </>
  );
  if (leafTop <= 0.05) return frame;
  if (o.kind === "schiebetuer") {
    // leaf in front of the wall, half open
    const shift = o.width * 0.45 * (o.flipHinge ? -1 : 1);
    return (
      <>
        {frame}
        <WallBox
          f={f}
          s={s + shift}
          e={e + shift}
          y0={0.005}
          y1={leafTop}
          cut={cut}
          material={DOOR_MAT}
          thickness={0.04}
          offset={side * (t / 2 + 0.03)}
        />
      </>
    );
  }
  const hingeS = o.flipHinge ? e - jamb : s + jamb;
  const hinge = pointAlong(f, hingeS, (side * t) / 2 - side * 0.02);
  const closed = mul(f.dir, o.flipHinge ? -1 : 1);
  const leafDir = add(mul(closed, Math.cos(DOOR_OPEN)), mul(f.normal, side * Math.sin(DOOR_OPEN)));
  const len = o.width - 2 * jamb - 0.01;
  const center = add(hinge, mul(leafDir, len / 2));
  const knob = add(hinge, mul(leafDir, len - 0.07));
  const knobN = { x: -leafDir.y, y: leafDir.x };
  return (
    <>
      {frame}
      <Slab center={center} dir={leafDir} length={len} thickness={0.04} y0={0.01} y1={leafTop} material={DOOR_MAT} />
      {leafTop > 1.05 &&
        [1, -1].map((k) => (
          <Slab
            key={k}
            center={add(knob, mul(knobN, k * 0.035))}
            dir={leafDir}
            length={0.12}
            thickness={0.02}
            y0={1.03}
            y1={1.05}
            material={HANDLE_MAT}
          />
        ))}
    </>
  );
}

/** Glass balustrade with a top rail and posts. */
function Railing({ f, cut }: { f: WallFrame; cut: number }) {
  const H = f.wall.height;
  return (
    <>
      {solidIntervals(f).map(([s, e], i) => {
        const posts = Math.max(2, Math.ceil((e - s) / 1.2) + 1);
        return (
          <group key={i}>
            <WallBox f={f} s={s} e={e} y0={0.06} y1={H - 0.05} cut={cut} material={GLASS_MAT} thickness={0.016} />
            <WallBox f={f} s={s} e={e} y0={H - 0.05} y1={H} cut={cut} material={RAIL_MAT} thickness={0.05} />
            {Array.from({ length: posts }, (_, k) => {
              const p = s + ((e - s) * k) / (posts - 1);
              const a = Math.max(s, p - 0.02);
              const b = Math.min(e, p + 0.02);
              return <WallBox key={k} f={f} s={a} e={b} y0={0} y1={H} cut={cut} material={RAIL_MAT} thickness={0.04} />;
            })}
          </group>
        );
      })}
    </>
  );
}

/** Ceiling panel rising from the knee wall into the room. */
function SlopePanel({
  p0,
  p1,
  n,
  knee,
  rise,
  top,
}: {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  n: { x: number; y: number };
  knee: number;
  rise: number;
  top: number;
}) {
  const geometry = useMemo(() => {
    const depth = (top - knee) / rise;
    const q0 = add(p0, mul(n, depth));
    const q1 = add(p1, mul(n, depth));
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [p0.x, knee, p0.y, p1.x, knee, p1.y, q1.x, top, q1.y, p0.x, knee, p0.y, q1.x, top, q1.y, q0.x, top, q0.y],
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  }, [p0, p1, n, knee, rise, top]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={SLOPE_MAT} castShadow receiveShadow />;
}

function Walls({ floor, cut, rooms }: { floor: Floor; cut: number; rooms: RoomGeometry[] }) {
  const frames = useMemo(() => wallFrames(floor), [floor]);
  const slopes = useMemo(
    () =>
      rooms.flatMap((r) =>
        slopeSides(floor, r).map((sd) => {
          const span = lineInPolygon(sd.face, sd.frame.dir, r.inner);
          return span ? { key: `${r.meta.id}-${sd.frame.wall.id}`, sd, span } : null;
        }),
      ),
    [floor, rooms],
  );
  return (
    <group>
      {slopes.map((x) => {
        if (!x) return null;
        const top = Math.min(floor.height, cut);
        if (top <= x.sd.knee + 0.01) return null;
        return (
          <SlopePanel
            key={x.key}
            p0={x.span[0]}
            p1={x.span[1]}
            n={x.sd.n}
            knee={x.sd.knee}
            rise={x.sd.rise}
            top={top}
          />
        );
      })}
      {frames.map((f) => {
        if (f.wall.type === "gelaender") return <Railing key={f.wall.id} f={f} cut={cut} />;
        // under a roof slope the wall is only as high as the knee wall
        const H = f.wall.slope ? Math.min(f.wall.height, f.wall.slope.knee) : f.wall.height;
        return (
          <group key={f.wall.id}>
            {solidIntervals(f).map(([s, e], i) => (
              <WallBox key={i} f={f} s={s} e={e} y0={0} y1={H} cut={cut} />
            ))}
            {f.openings.map((o) => {
              const s = o.offset - o.width / 2;
              const e = o.offset + o.width / 2;
              const top = Math.min(H, o.sill + o.height);
              const isWindow = o.kind === "fenster" || o.kind === "bodenfenster";
              const isDoor = o.kind === "tuer" || o.kind === "schiebetuer";
              return (
                <group key={o.id}>
                  {o.sill > 0 && <WallBox f={f} s={s} e={e} y0={0} y1={o.sill} cut={cut} />}
                  {top < H && <WallBox f={f} s={s} e={e} y0={top} y1={H} cut={cut} />}
                  {isDoor && <Door f={f} o={o} cut={cut} />}
                  {isWindow && (
                    <>
                      <WallBox f={f} s={s} e={e} y0={o.sill} y1={top} cut={cut} material={GLASS_MAT} thickness={0.02} />
                      <WallBox
                        f={f}
                        s={s}
                        e={s + 0.06}
                        y0={o.sill}
                        y1={top}
                        cut={cut}
                        material={FRAME_MAT}
                        thickness={0.08}
                      />
                      <WallBox
                        f={f}
                        s={e - 0.06}
                        e={e}
                        y0={o.sill}
                        y1={top}
                        cut={cut}
                        material={FRAME_MAT}
                        thickness={0.08}
                      />
                      <WallBox
                        f={f}
                        s={s}
                        e={e}
                        y0={o.sill}
                        y1={o.sill + 0.06}
                        cut={cut}
                        material={FRAME_MAT}
                        thickness={0.08}
                      />
                    </>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>();
function paint(color: string) {
  let m = paintCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
    paintCache.set(color, m);
  }
  return m;
}

const tileCache = new Map<string, THREE.MeshStandardMaterial>();
/** Glossy tiles (30 × 60 cm) with grout lines, as a repeating texture in world units. */
function tiles(color: string) {
  let m = tileCache.get(color);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d9d6d0";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = color;
    g.fillRect(2, 2, 252, 124);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0 });
    tileCache.set(color, m);
  }
  return m;
}

/** A thin vertical sheet on one face of a wall, from s to e along it and y0 to y1 high. */
function FaceSheet({
  f,
  side,
  s,
  e,
  y0,
  y1,
  cut,
  material,
  tiled,
}: {
  f: WallFrame;
  side: 1 | -1;
  s: number;
  e: number;
  y0: number;
  y1: number;
  cut: number;
  material: THREE.MeshStandardMaterial;
  tiled?: boolean;
}) {
  const top = Math.min(y1, cut);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(Math.max(e - s, 0.001), Math.max(top - y0, 0.001));
    if (tiled) {
      // texture repeats every 60 × 30 cm
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (e - s)) / 0.6, (uv.getY(i) * (top - y0)) / 0.3);
    }
    return g;
  }, [s, e, y0, top, tiled]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (top <= y0 + 1e-3 || e - s < 1e-3) return null;
  const mid = (s + e) / 2;
  const off = (f.wall.thickness / 2 + 0.003) * side;
  const x = f.a.x + f.dir.x * mid + f.normal.x * off;
  const z = f.a.y + f.dir.y * mid + f.normal.y * off;
  // plane faces +z locally; turn it to face along the side normal
  const nx = f.normal.x * side;
  const nz = f.normal.y * side;
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x, (y0 + top) / 2, z]}
      rotation={[0, Math.atan2(nx, nz), 0]}
      receiveShadow
    />
  );
}

/** Wall colour and tiles of rooms, on the room side of each wall (openings left free). */
function WallFinishes({ floor, rooms, cut }: { floor: Floor; rooms: RoomGeometry[]; cut: number }) {
  const sides = useMemo(() => finishedWallSides(floor, rooms), [floor, rooms]);
  return (
    <group>
      {sides.map(({ frame: f, side, room }) => {
        const H = f.wall.slope ? Math.min(f.wall.height, f.wall.slope.knee) : f.wall.height;
        const tileH = Math.min(room.meta.tileHeight ?? 0, H);
        const color = room.meta.wallColor;
        // pieces: solid intervals full height, openings below the sill and above the lintel
        const pieces: { s: number; e: number; y0: number; y1: number }[] = solidIntervals(f).map(([s, e]) => ({
          s,
          e,
          y0: 0,
          y1: H,
        }));
        for (const o of f.openings) {
          const s = o.offset - o.width / 2;
          const e = o.offset + o.width / 2;
          if (o.sill > 0) pieces.push({ s, e, y0: 0, y1: o.sill });
          const top = Math.min(H, o.sill + o.height);
          if (top < H) pieces.push({ s, e, y0: top, y1: H });
        }
        return pieces.flatMap((p, i) => {
          const out: React.ReactNode[] = [];
          if (tileH > 0 && p.y0 < tileH) {
            out.push(
              <FaceSheet
                key={`${f.wall.id}${side}t${i}`}
                f={f}
                side={side}
                s={p.s}
                e={p.e}
                y0={p.y0}
                y1={Math.min(p.y1, tileH)}
                cut={cut}
                material={tiles(room.meta.tileColor ?? "#f2f1ee")}
                tiled
              />,
            );
          }
          const y0 = tileH > 0 ? Math.max(p.y0, tileH) : p.y0;
          if (color && p.y1 > y0) {
            out.push(
              <FaceSheet
                key={`${f.wall.id}${side}p${i}`}
                f={f}
                side={side}
                s={p.s}
                e={p.e}
                y0={y0}
                y1={p.y1}
                cut={cut}
                material={paint(color)}
              />,
            );
          }
          return out;
        });
      })}
    </group>
  );
}

/** Point lights for lamps; brighter when it gets dark. */
function ItemLights({ floor, defs, level }: { floor: Floor; defs: FurnitureDef[]; level: number }) {
  if (level <= 0.01) return null;
  const lamps = floor.items
    .map((it) => ({ it, def: findDef(it.defId, defs) }))
    .filter((x) => x.def?.light)
    .slice(0, 12);
  return (
    <group>
      {lamps.map(({ it, def }) => (
        <pointLight
          key={it.id}
          position={[it.x, (it.elevation ?? 0) + def!.light!.z * it.h - 0.03, it.y]}
          color={def!.light!.color ?? "#ffe6c4"}
          intensity={def!.light!.intensity * level}
          distance={def!.light!.distance ?? 6}
          decay={1.6}
        />
      ))}
    </group>
  );
}

/** A storey other than the active one: walls, floors and furniture, not editable. */
function OtherFloor({ floor, y, defs }: { floor: Floor; y: number; defs: FurnitureDef[] }) {
  const rooms = useMemo(() => computeRoomGeometry(floor), [floor]);
  const lookup = useMemo(() => (id: string) => findDef(id, defs), [defs]);
  return (
    <group position={[0, y, 0]}>
      {rooms.map((r) => (
        <RoomFloor key={r.meta.id} room={r} />
      ))}
      <Walls floor={floor} cut={99} rooms={rooms} />
      <WallFinishes floor={floor} rooms={rooms} cut={99} />
      {floor.items.map((it) => {
        const def = findDef(it.defId, defs);
        if (!def) return null;
        return (
          <group
            key={it.id}
            position={[it.x, it.elevation ?? 0, it.y]}
            rotation={[0, (-it.rotation * Math.PI) / 180, 0]}
          >
            <FurnitureModel def={def} item={it} lookup={lookup} />
          </group>
        );
      })}
    </group>
  );
}

function RoomFloor({ room }: { room: RoomGeometry }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.outline.map((p) => new THREE.Vector2(p.x, -p.y)));
    return new THREE.ShapeGeometry(shape);
  }, [room.outline]);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: floorTexture(room.meta.floorMaterial), roughness: 0.75 }),
    [room.meta.floorMaterial],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  // ShapeGeometry UVs are (x, -y); flip v so the texture runs with the plan
  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.001, 0]}
      receiveShadow
    />
  );
}

function Items({
  floor,
  defs,
  onItemDown,
  selected,
}: {
  floor: Floor;
  defs: FurnitureDef[];
  onItemDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
  selected: Set<string>;
}) {
  const lookup = useMemo(() => (id: string) => findDef(id, defs), [defs]);
  return (
    <group>
      {floor.items.map((it) => {
        const def = findDef(it.defId, defs);
        if (!def) return null;
        return (
          <group
            key={it.id}
            position={[it.x, it.elevation ?? 0, it.y]}
            rotation={[0, (-it.rotation * Math.PI) / 180, 0]}
            onPointerDown={(e) => onItemDown(it.id, e)}
          >
            <FurnitureModel def={def} item={it} lookup={lookup} />
            {selected.has(it.id) && (
              <lineSegments position={[0, it.h / 2, 0]} material={SELECT_MAT}>
                <edgesGeometry args={[new THREE.BoxGeometry(it.w + 0.04, it.h + 0.04, it.d + 0.04)]} />
              </lineSegments>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Moves the selected item on the ground plane while the pointer is held down. */
function DragController({ dragId, onEnd }: { dragId: string | null; onEnd: () => void }) {
  const { camera, gl } = useThree();
  const startRef = useRef<{ offset: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!dragId) return;
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const st = useEditor.getState();
    const floor = st.project?.floors.find((f) => f.id === st.floorId);
    const it = floor?.items.find((x) => x.id === dragId);
    if (!it) return;
    let moved = false;
    const pick = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1),
        camera,
      );
      return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
    };
    const move = (ev: PointerEvent) => {
      const p = pick(ev);
      if (!p) return;
      if (!startRef.current) {
        startRef.current = { offset: new THREE.Vector3(it.x - p.x, 0, it.y - p.z) };
        return;
      }
      if (!moved) {
        useEditor.getState().checkpoint();
        moved = true;
      }
      const o = startRef.current.offset;
      useEditor.getState().mutate(
        (f) => {
          const x = f.items.find((y) => y.id === dragId);
          if (x) {
            x.x = Math.round((p.x + o.x) / 0.01) * 0.01;
            x.y = Math.round((p.z + o.z) / 0.01) * 0.01;
          }
        },
        { history: false, normalize: false },
      );
    };
    const up = () => {
      startRef.current = null;
      onEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragId, camera, gl, onEnd]);
  return null;
}

function WalkControls({ center }: { center: THREE.Vector3 }) {
  const get = useThree((s) => s.get);
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    get().camera.position.set(center.x, 1.65, center.z);
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [get, center]);
  useFrame(({ camera }, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft ? 3 : 1.4) * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(fwd, speed);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(fwd, -speed);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -speed);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, speed);
    camera.position.y = 1.65;
  });
  return <PointerLockControls />;
}

/** Soft indoor reflections without downloading an HDRI. */
function RoomLighting({ intensity }: { intensity: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene, invalidate } = get();
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    invalidate();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      env.dispose();
    };
  }, [get]);
  useEffect(() => {
    const { scene, invalidate } = get();
    scene.environmentIntensity = intensity;
    invalidate();
  }, [get, intensity]);
  return null;
}

function SceneContent({
  mode,
  cut,
  hour,
  floorsMode,
}: {
  mode: CamMode;
  cut: number;
  hour: number;
  floorsMode: FloorsMode;
}) {
  const floor = useActiveFloor();
  const project = useEditor((s) => s.project);
  const defs = useFurnitureDefs();
  const selection = useEditor((s) => s.selection);
  const [dragId, setDragId] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const rooms = useMemo(() => (floor ? computeRoomGeometry(floor) : []), [floor]);
  const selected = useMemo(() => new Set(selection.map((s) => s.id)), [selection]);
  const bounds = useMemo(() => (floor ? floorBounds(floor) : null), [floor]);
  const floorKey = floor?.id;
  const center = useMemo(
    () => (bounds ? new THREE.Vector3(bounds.minX + bounds.w / 2, 0, bounds.minY + bounds.h / 2) : new THREE.Vector3()),
    // only recenter when another floor is shown, not on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floorKey],
  );
  const span = bounds ? Math.max(bounds.w, bounds.h, 4) : 10;
  // the top view keeps a fixed noon light, like a presentation plan
  const sun = sunAt(mode === "top" ? 13 : hour);
  const lampLevel = mode === "top" ? 0 : Math.max(0, 1 - sun.daylight * 2.5);
  // storeys around the active one, stacked by their heights (active floor stays at y = 0)
  const others = useMemo(() => {
    if (!project || !floor || floorsMode === "one") return [];
    const idx = project.floors.findIndex((f) => f.id === floor.id);
    const out: { f: Floor; y: number }[] = [];
    let y = 0;
    for (let i = idx - 1; i >= 0; i--) {
      y -= project.floors[i].height + SLAB;
      out.push({ f: project.floors[i], y });
    }
    if (floorsMode === "all") {
      y = 0;
      for (let i = idx + 1; i < project.floors.length; i++) {
        y += project.floors[i - 1].height + SLAB;
        out.push({ f: project.floors[i], y });
      }
    }
    return out;
  }, [project, floor, floorsMode]);

  useEffect(() => {
    registry.scene = groupRef.current;
    return () => {
      registry.scene = null;
    };
  }, []);

  if (!floor) return null;

  const onItemDown = (id: string, e: ThreeEvent<PointerEvent>) => {
    if (mode === "walk") return;
    e.stopPropagation();
    useEditor.getState().select({ kind: "item", id });
    setDragId(id);
  };

  return (
    <>
      {mode === "top" ? (
        <OrthographicCamera
          makeDefault
          position={[center.x, 30, center.z]}
          zoom={Math.max(8, 700 / span)}
          up={[0, 0, -1]}
          near={0.1}
          far={100}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={[center.x + span * 0.55, span * 0.95, center.z + span * 0.95]}
          fov={45}
          near={0.05}
          far={300}
        />
      )}
      {mode === "walk" ? (
        <WalkControls center={center} />
      ) : (
        <OrbitControls
          target={center}
          enabled={!dragId}
          enableRotate={mode !== "top"}
          zoomToCursor
          maxPolarAngle={Math.PI / 2 - 0.05}
          makeDefault
        />
      )}
      <RoomLighting intensity={0.08 + 0.27 * sun.daylight} />
      <hemisphereLight args={["#fffaf0", "#b9b2a6", 0.08 + 0.37 * sun.daylight]} />
      <ambientLight intensity={0.05} />
      <ItemLights floor={floor} defs={defs} level={lampLevel} />
      <directionalLight
        position={
          mode === "top"
            ? // nearly overhead: short, soft shadows like a presentation floor plan
              [center.x + span * 0.08, span * 2.5, center.z + span * 0.12]
            : [center.x + sun.dir.x * span * 2, sun.dir.y * span * 2, center.z + sun.dir.z * span * 2]
        }
        color={sun.color}
        intensity={1.6 * sun.daylight}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-radius={6}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 6}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      >
        <object3D attach="target" position={[center.x, 0, center.z]} />
      </directionalLight>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center.x, Math.min(0, ...others.map((o) => o.y)) - 0.01, center.z]}
        receiveShadow
        onPointerDown={() => mode !== "walk" && useEditor.getState().select(null)}
      >
        <planeGeometry args={[span * 6, span * 6]} />
        <meshStandardMaterial color="#e9e5dd" roughness={1} />
      </mesh>
      <group ref={groupRef}>
        {rooms.map((r) => (
          <RoomFloor key={r.meta.id} room={r} />
        ))}
        <Walls floor={floor} cut={mode === "top" ? cut : 99} rooms={rooms} />
        <WallFinishes floor={floor} rooms={rooms} cut={mode === "top" ? cut : 99} />
        <Items floor={floor} defs={defs} onItemDown={onItemDown} selected={selected} />
      </group>
      {others.map(({ f, y }) => (
        <OtherFloor key={f.id} floor={f} y={y} defs={defs} />
      ))}
      <DragController dragId={dragId} onEnd={() => setDragId(null)} />
    </>
  );
}

/**
 * Ambient occlusion and edge smoothing, plus a high-resolution render for exports:
 * the frame is redrawn once at the requested width, copied, and the canvas restored.
 */
function QualityAndExport({ hq }: { hq: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposerImpl>(null);
  useEffect(() => {
    registry.renderHiRes = async (targetWidth: number) => {
      const max = Math.min(gl.capabilities.maxTextureSize, 8192);
      const ratio = Math.min(targetWidth, max) / size.width;
      const prev = gl.getPixelRatio();
      const composer = hq ? composerRef.current : null;
      gl.setPixelRatio(ratio);
      if (composer) {
        composer.setSize(size.width, size.height);
        composer.render();
      } else {
        gl.setSize(size.width, size.height, false);
        gl.render(scene, camera);
      }
      const out = document.createElement("canvas");
      out.width = gl.domElement.width;
      out.height = gl.domElement.height;
      out.getContext("2d")!.drawImage(gl.domElement, 0, 0);
      gl.setPixelRatio(prev);
      if (composer) composer.setSize(size.width, size.height);
      else gl.setSize(size.width, size.height, false);
      return new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
    };
    return () => {
      registry.renderHiRes = null;
    };
  }, [gl, scene, camera, size, hq]);
  if (!hq) return null;
  return (
    <EffectComposer ref={composerRef} multisampling={4}>
      <N8AO aoRadius={0.6} distanceFalloff={0.8} intensity={2.2} quality="high" halfRes={false} />
      <SMAA />
    </EffectComposer>
  );
}

export function Scene3D() {
  const [mode, setMode] = useState<CamMode>("orbit");
  const [hq, setHq] = useState(true);
  const [cut, setCut] = useState(1.4);
  const [cutOn, setCutOn] = useState(true);
  const [hour, setHour] = useState(14);
  const [floorsMode, setFloorsMode] = useState<FloorsMode>("one");
  const floorCount = useEditor((s) => s.project?.floors.length ?? 1);
  const modes: { id: CamMode; label: string; icon: React.ReactNode }[] = [
    { id: "orbit", label: "Umschauen", icon: <Box size={15} /> },
    { id: "top", label: "Draufsicht", icon: <MapIcon size={15} /> },
    { id: "walk", label: "Rundgang", icon: <Footprints size={15} /> },
  ];
  return (
    <div className="relative h-full w-full bg-[#e9e5dd]" data-testid="scene-3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop={mode === "walk" ? "always" : "demand"}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          registry.glCanvas = gl.domElement;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.92;
        }}
      >
        <SceneContent mode={mode} cut={cutOn ? cut : 99} hour={hour} floorsMode={floorsMode} />
        <QualityAndExport hq={hq} />
      </Canvas>
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg bg-panel/95 p-1 shadow">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
              mode === m.id ? "bg-ink text-white" : "hover:bg-paper",
            )}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHq(!hq)}
          className={clsx(
            "ml-1 inline-flex h-8 items-center gap-1 rounded-md border-l border-line px-2.5 text-xs font-medium",
            hq ? "text-accent" : "text-muted hover:bg-paper",
          )}
          title="Hohe Bildqualität (Umgebungsverdeckung, Kantenglättung). Auf langsamen Rechnern ausschalten."
        >
          <Sparkle size={14} /> {hq ? "Hohe Qualität" : "Schnell"}
        </button>
        {floorCount > 1 && (
          <label className="ml-1 flex items-center gap-1 border-l border-line pl-2 text-xs" title="Etagen in 3D">
            <Layers size={14} />
            <select
              value={floorsMode}
              onChange={(e) => setFloorsMode(e.target.value as FloorsMode)}
              className="h-8 rounded-md bg-transparent text-xs"
              data-testid="floors-mode"
            >
              <option value="one">Nur diese Etage</option>
              <option value="below">Mit Etagen darunter</option>
              <option value="all">Alle Etagen</option>
            </select>
          </label>
        )}
        {mode !== "top" && (
          <label className="ml-1 flex items-center gap-1.5 border-l border-line pl-2 text-xs" title="Tageszeit">
            <SunIcon size={14} />
            <input
              type="range"
              min={6}
              max={23}
              step={0.5}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              aria-label="Tageszeit"
              data-testid="daytime"
              className="w-24"
            />
            <span className="w-10 tabular-nums">
              {Math.floor(hour)}:{hour % 1 ? "30" : "00"}
            </span>
          </label>
        )}
        {mode === "top" && (
          <div className="ml-1 flex items-center gap-2 border-l border-line pl-2 text-xs">
            <button
              type="button"
              onClick={() => setCutOn(!cutOn)}
              className={clsx(
                "inline-flex h-8 items-center gap-1 rounded-md px-2",
                cutOn ? "bg-accent-soft text-accent" : "hover:bg-paper",
              )}
              title="Wände für die Draufsicht anschneiden"
            >
              <Scissors size={14} /> Schnitt
            </button>
            {cutOn && (
              <input
                type="range"
                min={0.3}
                max={2.6}
                step={0.05}
                value={cut}
                onChange={(e) => setCut(Number(e.target.value))}
                aria-label="Schnitthöhe"
              />
            )}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-panel/90 px-2 py-1 text-[11px] text-muted shadow-sm">
        {mode === "walk" ? (
          <span className="inline-flex items-center gap-1">
            <Eye size={12} /> In die Ansicht klicken, dann W A S D zum Gehen, Maus zum Umsehen, Esc beendet.
          </span>
        ) : (
          "Möbel anklicken und ziehen. Rechte Maustaste verschiebt die Ansicht, Mausrad zoomt."
        )}
      </div>
    </div>
  );
}
