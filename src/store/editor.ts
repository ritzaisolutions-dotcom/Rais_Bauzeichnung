"use client";

import { produce, setAutoFreeze } from "immer";
import { useMemo } from "react";
import { create } from "zustand";
import { findDef } from "@/furniture/catalog";
import { normalizeFloor } from "@/model/ops";
import type { Floor, FurnitureDef, Project } from "@/model/types";

setAutoFreeze(false);

export type Tool =
  | "select"
  | "pan"
  | "wall"
  | "room"
  | "door"
  | "window"
  | "slidingdoor"
  | "passage"
  | "dimension"
  | "text"
  | "calibrate";

export type SelectionKind = "wall" | "node" | "opening" | "room" | "item" | "label" | "dimension";
export interface Selection {
  kind: SelectionKind;
  id: string;
}

export type ViewMode = "2d" | "3d" | "split";

export interface Layers {
  underlay: boolean;
  furniture: boolean;
  dimensions: boolean;
  roomLabels: boolean;
  grid: boolean;
}

interface EditorState {
  project: Project | null;
  floorId: string;
  past: Project[];
  future: Project[];
  selection: Selection[];
  tool: Tool;
  view: ViewMode;
  presentation: boolean;
  layers: Layers;
  globalFurniture: FurnitureDef[];
  /** Pending furniture to place by click (from the library). */
  placing: string | null;
  wallType: "aussen" | "innen" | "tragend";
  wallThickness: number;
  revision: number;
  toast: string | null;

  load: (p: Project) => void;
  setFloor: (id: string) => void;
  /** Applies a change to the active floor. history=false for continuous drags. */
  mutate: (fn: (floor: Floor, project: Project) => void, opts?: { history?: boolean; normalize?: boolean }) => void;
  mutateProject: (fn: (project: Project) => void, opts?: { history?: boolean }) => void;
  /** Saves an undo snapshot before a continuous gesture (drag). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection | Selection[] | null, additive?: boolean) => void;
  setTool: (t: Tool) => void;
  setView: (v: ViewMode) => void;
  setPresentation: (v: boolean) => void;
  toggleLayer: (k: keyof Layers) => void;
  setGlobalFurniture: (defs: FurnitureDef[]) => void;
  setPlacing: (id: string | null) => void;
  setWallType: (t: EditorState["wallType"], thickness: number) => void;
  showToast: (msg: string | null) => void;
}

const HISTORY_LIMIT = 150;

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  floorId: "",
  past: [],
  future: [],
  selection: [],
  tool: "select",
  view: "2d",
  presentation: false,
  layers: { underlay: true, furniture: true, dimensions: true, roomLabels: true, grid: true },
  globalFurniture: [],
  placing: null,
  wallType: "aussen",
  wallThickness: 0.36,
  revision: 0,
  toast: null,

  load: (p) =>
    set({
      project: p,
      floorId: p.floors[0]?.id ?? "",
      past: [],
      future: [],
      selection: [],
      tool: "select",
      revision: 0,
    }),

  setFloor: (id) => set({ floorId: id, selection: [] }),

  mutate: (fn, opts = {}) => {
    const { project, floorId, past, revision } = get();
    if (!project) return;
    const next = produce(project, (draft) => {
      const floor = draft.floors.find((f) => f.id === floorId);
      if (!floor) return;
      fn(floor, draft);
      if (opts.normalize !== false) normalizeFloor(floor);
      draft.updatedAt = Date.now();
    });
    if (next === project) return;
    set({
      project: next,
      past: opts.history === false ? past : [...past.slice(-HISTORY_LIMIT), project],
      future: opts.history === false ? get().future : [],
      revision: revision + 1,
    });
  },

  mutateProject: (fn, opts = {}) => {
    const { project, past, revision } = get();
    if (!project) return;
    const next = produce(project, (draft) => {
      fn(draft);
      draft.updatedAt = Date.now();
    });
    set({
      project: next,
      past: opts.history === false ? past : [...past.slice(-HISTORY_LIMIT), project],
      future: opts.history === false ? get().future : [],
      revision: revision + 1,
    });
  },

  checkpoint: () => {
    const { project, past } = get();
    if (!project) return;
    set({ past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
  },

  undo: () => {
    const { past, project, future, floorId, revision } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({
      project: prev,
      past: past.slice(0, -1),
      future: [project, ...future],
      selection: [],
      floorId: prev.floors.some((f) => f.id === floorId) ? floorId : (prev.floors[0]?.id ?? ""),
      revision: revision + 1,
    });
  },

  redo: () => {
    const { past, project, future, floorId, revision } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({
      project: next,
      past: [...past, project],
      future: future.slice(1),
      selection: [],
      floorId: next.floors.some((f) => f.id === floorId) ? floorId : (next.floors[0]?.id ?? ""),
      revision: revision + 1,
    });
  },

  select: (s, additive = false) => {
    if (s === null) return set({ selection: [] });
    const list = Array.isArray(s) ? s : [s];
    if (!additive) return set({ selection: list });
    const cur = get().selection;
    const merged = [...cur];
    for (const it of list) {
      const idx = merged.findIndex((m) => m.id === it.id);
      if (idx >= 0) merged.splice(idx, 1);
      else merged.push(it);
    }
    set({ selection: merged });
  },

  setTool: (t) => set({ tool: t, placing: null }),
  setView: (v) => set({ view: v }),
  setPresentation: (v) => set({ presentation: v }),
  toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
  setGlobalFurniture: (defs) => set({ globalFurniture: defs }),
  setPlacing: (id) => set({ placing: id, tool: "select" }),
  setWallType: (t, thickness) => set({ wallType: t, wallThickness: thickness }),
  showToast: (msg) => set({ toast: msg }),
}));

export function useActiveFloor(): Floor | null {
  return useEditor((s) => s.project?.floors.find((f) => f.id === s.floorId) ?? null);
}

export function useFurnitureDefs(): FurnitureDef[] {
  const custom = useEditor((s) => s.project?.customFurniture);
  const global = useEditor((s) => s.globalFurniture);
  return mergeDefs(custom ?? [], global);
}

let cacheKey: [FurnitureDef[], FurnitureDef[]] | null = null;
let cacheVal: FurnitureDef[] = [];
function mergeDefs(a: FurnitureDef[], b: FurnitureDef[]) {
  if (cacheKey && cacheKey[0] === a && cacheKey[1] === b) return cacheVal;
  const seen = new Set(a.map((d) => d.id));
  cacheVal = [...a, ...b.filter((d) => !seen.has(d.id))];
  cacheKey = [a, b];
  return cacheVal;
}

/** Stable lookup of furniture definitions (catalog plus custom furniture). */
export function useDefLookup() {
  const defs = useFurnitureDefs();
  return useMemo(() => (id: string) => findDef(id, defs), [defs]);
}
