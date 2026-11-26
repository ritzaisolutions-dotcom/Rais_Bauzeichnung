"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Box, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { COLOR_SWATCHES, findDef } from "@/furniture/catalog";
import { listGlobalFurniture, saveGlobalFurniture } from "@/lib/db";
import { uid } from "@/model/ops";
import type { FurnitureDef, FurnitureModelRef, FurniturePart, PartShape } from "@/model/types";
import { useEditor } from "@/store/editor";
import { FurnitureShape } from "../plan/FurnitureSymbol";
import { FurnitureModel } from "../three/FurnitureModel";
import { Button, ColorSwatches, Dialog, Field, NumberInput, Select, TextInput } from "../ui";

const SHAPES: { value: PartShape; label: string }[] = [
  { value: "box", label: "Quader" },
  { value: "cylinder", label: "Zylinder" },
  { value: "sphere", label: "Kugel" },
  { value: "cone", label: "Kegel" },
];

const FINISHES: { value: NonNullable<FurniturePart["finish"]>; label: string }[] = [
  { value: "matt", label: "Matt" },
  { value: "glanz", label: "Glänzend" },
  { value: "stoff", label: "Stoff" },
  { value: "metall", label: "Metall" },
  { value: "glas", label: "Glas" },
];

/** Part in absolute centimeters for editing. */
interface PartCm {
  shape: PartShape;
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  color: string;
  finish: NonNullable<FurniturePart["finish"]>;
}

const TEMPLATES: Record<
  string,
  { label: string; w: number; d: number; h: number; parts: (w: number, d: number, h: number) => PartCm[] }
> = {
  block: {
    label: "Block / Korpus",
    w: 120,
    d: 50,
    h: 80,
    parts: (w, d, h) => [{ shape: "box", x: w / 2, y: d / 2, w, d, z: 0, h, color: "#f2efe9", finish: "matt" }],
  },
  tisch: {
    label: "Tisch mit 4 Beinen",
    w: 160,
    d: 80,
    h: 75,
    parts: (w, d, h) => [
      { shape: "box", x: w / 2, y: d / 2, w, d, z: h - 4, h: 4, color: "#b08657", finish: "matt" },
      ...[
        [4, 4],
        [w - 4, 4],
        [w - 4, d - 4],
        [4, d - 4],
      ].map(([x, y]) => ({
        shape: "box" as const,
        x,
        y,
        w: 5,
        d: 5,
        z: 0,
        h: h - 4,
        color: "#262524",
        finish: "metall" as const,
      })),
    ],
  },
  rund: {
    label: "Rundes Objekt",
    w: 60,
    d: 60,
    h: 50,
    parts: (w, d, h) => [{ shape: "cylinder", x: w / 2, y: d / 2, w, d, z: 0, h, color: "#c9b79c", finish: "matt" }],
  },
  polster: {
    label: "Polstermöbel",
    w: 200,
    d: 90,
    h: 80,
    parts: (w, d, h) => [
      { shape: "box", x: w / 2, y: d / 2, w, d, z: 5, h: 40, color: "#93a38a", finish: "stoff" },
      { shape: "box", x: w / 2, y: 10, w, d: 20, z: 5, h: h - 5, color: "#93a38a", finish: "stoff" },
    ],
  },
};

function toCm(def: FurnitureDef): PartCm[] {
  return def.parts.map((p) => ({
    shape: p.shape,
    x: Math.round(p.x * def.w * 1000) / 10,
    y: Math.round(p.y * def.d * 1000) / 10,
    w: Math.round(p.w * def.w * 1000) / 10,
    d: Math.round(p.d * def.d * 1000) / 10,
    z: Math.round(p.z * def.h * 1000) / 10,
    h: Math.round(p.h * def.h * 1000) / 10,
    color: p.color,
    finish: p.finish ?? "matt",
  }));
}

/** Largest uploaded model; bigger files make projects slow to save and load. */
const MAX_GLB_BYTES = 2_800_000;

/** Reads a GLB/glTF file and measures it (meters, y up). */
async function readModelFile(file: File): Promise<{ url: string; w: number; d: number; h: number }> {
  if (file.size > MAX_GLB_BYTES)
    throw new Error(
      `Die Datei ist ${(file.size / 1e6).toFixed(1)} MB groß. Erlaubt sind bis 2,8 MB; bitte vorher verkleinern (z. B. mit gltf.report).`,
    );
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).replace(/^data:[^;]*;/, "data:model/gltf-binary;"));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const [{ loadModel }, THREE] = await Promise.all([import("../three/build"), import("three")]);
  const obj = await loadModel(url).catch(() => {
    throw new Error("Die Datei konnte nicht als 3D-Modell gelesen werden. Unterstützt wird GLB (glTF binär).");
  });
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  if (!(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error("Das Modell ist leer.");
  return { url, w: size.x, d: size.z, h: size.y };
}

function toDef(
  id: string,
  name: string,
  w: number,
  d: number,
  h: number,
  parts: PartCm[],
  model?: FurnitureModelRef | null,
): FurnitureDef {
  const W = w / 100;
  const D = d / 100;
  const H = h / 100;
  return {
    ...(model ? { model } : {}),
    id,
    name: name || "Eigenes Möbel",
    category: "eigene",
    w: W,
    d: D,
    h: H,
    custom: true,
    parts: parts.map((p) => ({
      shape: p.shape,
      x: p.x / w,
      y: p.y / d,
      w: p.w / w,
      d: p.d / d,
      z: p.z / h,
      h: p.h / h,
      color: p.color,
      finish: p.finish,
    })),
  };
}

export function CustomFurnitureDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: FurnitureDef | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={initial ? "Möbel bearbeiten" : "Eigenes Möbel anlegen"} wide>
      {open && <CustomFurnitureForm key={initial?.id ?? "new"} initial={initial} onClose={onClose} />}
    </Dialog>
  );
}

function CustomFurnitureForm({ initial, onClose }: { initial: FurnitureDef | null; onClose: () => void }) {
  const tpl = TEMPLATES.block;
  const [name, setName] = useState(initial?.name ?? "");
  const [w, setW] = useState(initial ? Math.round(initial.w * 100) : tpl.w);
  const [d, setD] = useState(initial ? Math.round(initial.d * 100) : tpl.d);
  const [h, setH] = useState(initial ? Math.round(initial.h * 100) : tpl.h);
  const [parts, setParts] = useState<PartCm[]>(() => (initial ? toCm(initial) : tpl.parts(tpl.w, tpl.d, tpl.h)));
  const [global, setGlobal] = useState(true);
  const [active, setActive] = useState(0);
  const [model, setModel] = useState<FurnitureModelRef | null>(initial?.model ?? null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const modelInput = useRef<HTMLInputElement>(null);

  const uploadModel = async (file: File) => {
    setModelBusy(true);
    setModelError(null);
    try {
      const m = await readModelFile(file);
      const cm = (v: number) => Math.max(1, Math.round(v * 100));
      setModel({ url: m.url, w: m.w, d: m.d, h: m.h, rotY: 0 });
      setW(cm(m.w));
      setD(cm(m.d));
      setH(cm(m.h));
      if (!name) setName(file.name.replace(/\.(glb|gltf)$/i, ""));
      // the parts only draw the 2D symbol now: one block with the footprint
      setParts([
        {
          shape: "box",
          x: cm(m.w) / 2,
          y: cm(m.d) / 2,
          w: cm(m.w),
          d: cm(m.d),
          z: 0,
          h: cm(m.h),
          color: "#d9d4cb",
          finish: "matt",
        },
      ]);
      setActive(0);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : "Das Modell konnte nicht geladen werden.");
    } finally {
      setModelBusy(false);
    }
  };

  const turnModel = (deg: number) => {
    if (!model) return;
    const rotY = (((model.rotY + deg) % 360) + 360) % 360;
    // a quarter turn swaps width and depth
    const swap = Math.abs(deg) % 180 === 90;
    setModel({ ...model, rotY });
    if (swap) {
      setW(d);
      setD(w);
      setParts((ps) => ps.map((x) => ({ ...x, x: x.y, y: x.x, w: x.d, d: x.w })));
    }
  };

  const previewId = initial?.id ?? "preview";
  const preview = useMemo(
    () => toDef(previewId, name, w, d, h, parts, model),
    [previewId, name, w, d, h, parts, model],
  );
  const p = parts[active];
  const updPart = (patch: Partial<PartCm>) =>
    setParts((ps) => ps.map((x, i) => (i === active ? { ...x, ...patch } : x)));

  const save = async () => {
    const def = toDef(initial?.id ?? `custom-${uid()}`, name, w, d, h, parts, model);
    useEditor.getState().mutateProject((pr) => {
      const idx = pr.customFurniture.findIndex((x) => x.id === def.id);
      if (idx >= 0) pr.customFurniture[idx] = def;
      else pr.customFurniture.push(def);
    });
    if (global) {
      await saveGlobalFurniture(def);
      useEditor.getState().setGlobalFurniture(await listGlobalFurniture());
    }
    onClose();
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        {!initial && (
          <Field label="Vorlage">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TEMPLATES).map(([k, t]) => (
                <Button
                  key={k}
                  size="sm"
                  onClick={() => {
                    setW(t.w);
                    setD(t.d);
                    setH(t.h);
                    setParts(t.parts(t.w, t.d, t.h));
                    setActive(0);
                  }}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </Field>
        )}
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">3D-Modell (optional)</span>
            <Button size="sm" disabled={modelBusy} onClick={() => modelInput.current?.click()} data-testid="glb-upload">
              <Upload size={14} /> {model ? "Anderes Modell" : "GLB hochladen"}
            </Button>
            <input
              ref={modelInput}
              type="file"
              accept=".glb,model/gltf-binary"
              className="hidden"
              data-testid="glb-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadModel(f);
                e.target.value = "";
              }}
            />
          </div>
          {modelError && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{modelError}</p>}
          {model ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Box size={14} className="text-accent" />
              <span data-testid="glb-size">
                Modell geladen, {w} × {d} × {h} cm
              </span>
              <Button size="sm" onClick={() => turnModel(90)} title="Vorderseite muss im Plan nach unten zeigen">
                Drehen 90°
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setModel(null);
                  setModelError(null);
                }}
              >
                Entfernen
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Z. B. von Herstellern oder aus Sketchfab, bis 2,8 MB. Maße werden aus dem Modell übernommen.
            </p>
          )}
        </div>
        <Field label="Name">
          <TextInput value={name} placeholder="z. B. Vitrine Kundin Zers" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Breite">
            <NumberInput
              value={w}
              digits={0}
              step={1}
              min={1}
              suffix="cm"
              onCommit={(v) => {
                const k = v / w;
                setW(v);
                setParts((ps) => ps.map((x) => ({ ...x, x: x.x * k, w: x.w * k })));
              }}
            />
          </Field>
          <Field label="Tiefe">
            <NumberInput
              value={d}
              digits={0}
              step={1}
              min={1}
              suffix="cm"
              onCommit={(v) => {
                const k = v / d;
                setD(v);
                setParts((ps) => ps.map((x) => ({ ...x, y: x.y * k, d: x.d * k })));
              }}
            />
          </Field>
          <Field label="Höhe">
            <NumberInput
              value={h}
              digits={0}
              step={1}
              min={1}
              suffix="cm"
              onCommit={(v) => {
                const k = v / h;
                setH(v);
                setParts((ps) => ps.map((x) => ({ ...x, z: x.z * k, h: x.h * k })));
              }}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bauteile</span>
            <Button
              size="sm"
              onClick={() => {
                setParts((ps) => [
                  ...ps,
                  {
                    shape: "box",
                    x: w / 2,
                    y: d / 2,
                    w: w / 3,
                    d: d / 3,
                    z: h,
                    h: 10,
                    color: "#8d8a86",
                    finish: "matt",
                  },
                ]);
                setActive(parts.length);
              }}
            >
              <Plus size={14} /> Bauteil
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {parts.map((x, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${i === active ? "border-ink bg-ink text-white" : "border-line"}`}
              >
                <span className="h-2.5 w-2.5 rounded-full border border-white/60" style={{ background: x.color }} />
                {i + 1}. {SHAPES.find((s) => s.value === x.shape)?.label}
              </button>
            ))}
          </div>
          {p && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Form">
                  <Select value={p.shape} onChange={(v) => updPart({ shape: v })} options={SHAPES} />
                </Field>
                <Field label="Oberfläche">
                  <Select value={p.finish} onChange={(v) => updPart({ finish: v })} options={FINISHES} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Mitte X">
                  <NumberInput value={p.x} digits={0} step={1} suffix="cm" onCommit={(v) => updPart({ x: v })} />
                </Field>
                <Field label="Mitte Y">
                  <NumberInput value={p.y} digits={0} step={1} suffix="cm" onCommit={(v) => updPart({ y: v })} />
                </Field>
                <Field label="Unterkante">
                  <NumberInput
                    value={p.z}
                    digits={0}
                    step={1}
                    min={0}
                    suffix="cm"
                    onCommit={(v) => updPart({ z: v })}
                  />
                </Field>
                <Field label="Breite">
                  <NumberInput
                    value={p.w}
                    digits={0}
                    step={1}
                    min={0.5}
                    suffix="cm"
                    onCommit={(v) => updPart({ w: v })}
                  />
                </Field>
                <Field label="Tiefe">
                  <NumberInput
                    value={p.d}
                    digits={0}
                    step={1}
                    min={0.5}
                    suffix="cm"
                    onCommit={(v) => updPart({ d: v })}
                  />
                </Field>
                <Field label="Höhe">
                  <NumberInput
                    value={p.h}
                    digits={0}
                    step={1}
                    min={0.5}
                    suffix="cm"
                    onCommit={(v) => updPart({ h: v })}
                  />
                </Field>
              </div>
              <Field label="Farbe">
                <ColorSwatches
                  colors={COLOR_SWATCHES}
                  value={p.color}
                  onChange={(c) => updPart({ color: c ?? "#8d8a86" })}
                />
              </Field>
              <Button
                size="sm"
                variant="danger"
                disabled={parts.length < 2}
                onClick={() => {
                  setParts((ps) => ps.filter((_, i) => i !== active));
                  setActive(0);
                }}
              >
                <Trash2 size={14} /> Bauteil entfernen
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-64 overflow-hidden rounded-lg border border-line bg-[#eeeae3]">
          <Canvas shadows camera={{ position: [w / 100 + 0.8, h / 100 + 0.9, d / 100 + 1.4], fov: 40 }}>
            <hemisphereLight args={["#fffaf0", "#b9b2a6", 1]} />
            <directionalLight position={[2, 4, 3]} intensity={1.4} castShadow />
            <FurnitureModel def={preview} item={{ w: preview.w, d: preview.d, h: preview.h }} lookup={findDef} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="#e5e0d7" />
            </mesh>
            <OrbitControls target={[0, preview.h / 2, 0]} />
          </Canvas>
        </div>
        <div className="rounded-lg border border-line bg-white p-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Grundriss-Symbol</div>
          <svg
            viewBox={`${-preview.w / 2 - 0.1} ${-preview.d / 2 - 0.1} ${preview.w + 0.2} ${preview.d + 0.2}`}
            className="h-28 w-full"
          >
            <FurnitureShape def={preview} item={{ w: preview.w, d: preview.d, h: preview.h }} presentation />
          </svg>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={global}
            onChange={(e) => setGlobal(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          In allen Projekten verfügbar machen
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!parts.length}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
