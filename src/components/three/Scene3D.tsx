"use client";

import { OrbitControls, OrthographicCamera, PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import clsx from "clsx";
import { Box, Eye, Footprints, Map as MapIcon, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { findDef } from "@/furniture/catalog";
import { computeRoomGeometry, floorBounds } from "@/model/geometry";
import type { Floor, FurnitureDef, RoomGeometry } from "@/model/types";
import { solidIntervals, wallFrames, type WallFrame } from "@/model/walls";
import { registry } from "@/lib/registry";
import { useActiveFloor, useEditor, useFurnitureDefs } from "@/store/editor";
import { FurnitureModel } from "./FurnitureModel";
import { floorTexture } from "./materials";

type CamMode = "orbit" | "top" | "walk";

const WALL_MAT = new THREE.MeshStandardMaterial({ color: "#f3f0ea", roughness: 0.9 });
const WALL_TOP_MAT = new THREE.MeshStandardMaterial({ color: "#2b2a28", roughness: 0.9 });
const GLASS_MAT = new THREE.MeshPhysicalMaterial({
  color: "#bcd6de",
  transparent: true,
  opacity: 0.25,
  roughness: 0.05,
});
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 });
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
}: {
  f: WallFrame;
  s: number;
  e: number;
  y0: number;
  y1: number;
  cut: number;
  material?: THREE.Material;
  thickness?: number;
}) {
  const top = Math.min(y1, cut);
  if (top <= y0 + 1e-4 || e - s < 1e-4) return null;
  const mid = (s + e) / 2;
  const x = f.a.x + f.dir.x * mid;
  const z = f.a.y + f.dir.y * mid;
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

function Walls({ floor, cut }: { floor: Floor; cut: number }) {
  const frames = useMemo(() => wallFrames(floor), [floor]);
  return (
    <group>
      {frames.map((f) => {
        const H = f.wall.height;
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
              return (
                <group key={o.id}>
                  {o.sill > 0 && <WallBox f={f} s={s} e={e} y0={0} y1={o.sill} cut={cut} />}
                  {top < H && <WallBox f={f} s={s} e={e} y0={top} y1={H} cut={cut} />}
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
            <FurnitureModel def={def} item={it} />
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

function SceneContent({ mode, cut }: { mode: CamMode; cut: number }) {
  const floor = useActiveFloor();
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
          maxPolarAngle={Math.PI / 2 - 0.05}
          makeDefault
        />
      )}
      <hemisphereLight args={["#fffaf0", "#b9b2a6", 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[center.x + span * 0.4, span * 1.4, center.z + span * 0.6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.5}
        shadow-camera-far={span * 4}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      >
        <object3D attach="target" position={[center.x, 0, center.z]} />
      </directionalLight>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center.x, -0.01, center.z]}
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
        <Walls floor={floor} cut={mode === "top" ? cut : 99} />
        <Items floor={floor} defs={defs} onItemDown={onItemDown} selected={selected} />
      </group>
      <DragController dragId={dragId} onEnd={() => setDragId(null)} />
    </>
  );
}

export function Scene3D() {
  const [mode, setMode] = useState<CamMode>("orbit");
  const [cut, setCut] = useState(1.4);
  const [cutOn, setCutOn] = useState(true);
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
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          registry.glCanvas = gl.domElement;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <SceneContent mode={mode} cut={cutOn ? cut : 99} />
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
