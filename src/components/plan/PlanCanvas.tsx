"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findDef } from "@/furniture/catalog";
import {
  add,
  boundsOf,
  computeRoomGeometry,
  dist,
  dot,
  floorBounds,
  formatM,
  mul,
  nodeMap,
  norm,
  perp,
  projectToSegment,
  rectCorners,
  sub,
  wallEnds,
} from "@/model/geometry";
import {
  addOpening,
  addRectRoom,
  addWall,
  clampOpenings,
  deleteWall,
  OPENING_DEFAULTS,
  splitWall,
  uid,
  wallAtPoint,
} from "@/model/ops";
import type { Floor, OpeningKind, Vec2 } from "@/model/types";
import { wallFrames, wallRect } from "@/model/walls";
import { registry } from "@/lib/registry";
import { thicknessAlong, type UnderlayLines } from "@/lib/underlayLines";
import { collidingItems, copySelection, pasteClip, selectInRect, snapItemToWall } from "@/model/editing";
import { useUnderlayLines } from "@/lib/underlaySnap";
import { useActiveFloor, useEditor, useFurnitureDefs, type Tool } from "@/store/editor";
import { MaterialPatterns, PlanLayers } from "./PlanLayers";

type View = { scale: number; ox: number; oy: number };

type Drag =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "items"; start: Vec2; orig: Map<string, Vec2>; moved: boolean }
  | { type: "node"; id: string; moved: boolean }
  | { type: "wall"; id: string; start: Vec2; a: Vec2; b: Vec2; normal: Vec2; moved: boolean }
  | { type: "opening"; id: string; moved: boolean }
  | { type: "label"; id: string; start: Vec2; orig: Vec2; moved: boolean }
  | { type: "dimension"; id: string; start: Vec2; a: Vec2; b: Vec2; moved: boolean }
  | { type: "rotate"; id: string; center: Vec2; moved: boolean }
  | { type: "rect"; start: Vec2 }
  | { type: "marquee"; start: Vec2; additive: boolean };

const OPENING_TOOLS: Partial<Record<Tool, OpeningKind>> = {
  door: "tuer",
  window: "fenster",
  slidingdoor: "schiebetuer",
  passage: "durchgang",
};

const pts = (poly: Vec2[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

interface SnapResult {
  p: Vec2;
  guideX?: number;
  guideY?: number;
  onNode?: boolean;
  /** Snapped to a wall of the construction drawing. */
  onDrawing?: boolean;
}

/** Wall axes detected in the active floor's drawing (world meters), set by PlanCanvas. */
let drawnWalls: UnderlayLines | null = null;

function snapPoint(
  floor: Floor,
  raw: Vec2,
  scale: number,
  opts: { from?: Vec2 | null; exclude?: string; free?: boolean } = {},
): SnapResult {
  if (opts.free) return { p: raw };
  const tol = 10 / scale;
  // 1. existing nodes
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const n of floor.nodes) {
    if (n.id === opts.exclude) continue;
    const d = dist(n, raw);
    if (d < bestD) {
      best = { x: n.x, y: n.y };
      bestD = d;
    }
  }
  if (best) return { p: best, onNode: true };
  // 2. on a wall axis
  const nodes = nodeMap(floor);
  for (const w of floor.walls) {
    if (w.a === opts.exclude || w.b === opts.exclude) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const pr = projectToSegment(raw, a, b);
    if (pr.distance < tol * 0.8) return { p: pr.point, onNode: true };
  }
  // 2b. corners of walls in the construction drawing
  if (drawnWalls) {
    let c: Vec2 | null = null;
    let cd = tol;
    for (const k of drawnWalls.corners) {
      const d = dist(k, raw);
      if (d < cd) {
        cd = d;
        c = { x: k.x, y: k.y };
      }
    }
    if (c) return { p: c, onDrawing: true };
  }
  let p = { ...raw };
  let lockX = false;
  let lockY = false;
  // 3. angle from the start point
  if (opts.from) {
    const v = sub(raw, opts.from);
    const ang = Math.atan2(v.y, v.x);
    const step = Math.PI / 4;
    const snapped = Math.round(ang / step) * step;
    const ortho = Math.round(snapped / (Math.PI / 2)) * (Math.PI / 2) === snapped;
    if (Math.abs(ang - snapped) < (ortho ? 0.14 : 0.06)) {
      const dir = { x: Math.cos(snapped), y: Math.sin(snapped) };
      const l = Math.round(dot(v, dir) / 0.05) * 0.05;
      p = add(opts.from, mul(dir, l));
      lockX = Math.abs(dir.x) < 1e-6;
      lockY = Math.abs(dir.y) < 1e-6;
      if (!lockX && !lockY) return { p };
    }
  }
  // 4. alignment with other nodes
  let guideX: number | undefined;
  let guideY: number | undefined;
  let dx = tol;
  let dy = tol;
  for (const n of floor.nodes) {
    if (n.id === opts.exclude) continue;
    if (!lockX && Math.abs(n.x - p.x) < dx) {
      dx = Math.abs(n.x - p.x);
      guideX = n.x;
    }
    if (!lockY && Math.abs(n.y - p.y) < dy) {
      dy = Math.abs(n.y - p.y);
      guideY = n.y;
    }
  }
  // 4b. centre lines of walls in the construction drawing
  let onDrawing = false;
  for (const a of drawnWalls?.axes ?? []) {
    const along = a.dir === "h" ? p.x : p.y;
    if (along < a.from - tol || along > a.to + tol) continue;
    if (a.dir === "v" && !lockX && Math.abs(a.at - p.x) < dx) {
      dx = Math.abs(a.at - p.x);
      guideX = a.at;
      onDrawing = true;
    }
    if (a.dir === "h" && !lockY && Math.abs(a.at - p.y) < dy) {
      dy = Math.abs(a.at - p.y);
      guideY = a.at;
      onDrawing = true;
    }
  }
  // 5. grid on remaining free axes
  const g = 0.05;
  return {
    p: {
      x: lockX ? p.x : (guideX ?? Math.round(p.x / g) * g),
      y: lockY ? p.y : (guideY ?? Math.round(p.y / g) * g),
    },
    guideX,
    guideY,
    onDrawing,
  };
}

export function PlanCanvas() {
  const floor = useActiveFloor();
  const defs = useFurnitureDefs();
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const presentation = useEditor((s) => s.presentation);
  const layers = useEditor((s) => s.layers);
  const placing = useEditor((s) => s.placing);
  const wallType = useEditor((s) => s.wallType);
  const wallThickness = useEditor((s) => s.wallThickness);
  const { mutate, checkpoint, select, setTool, setPlacing } = useEditor.getState();
  const readOnly = useEditor((s) => s.readOnly);
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const colliding = useMemo(
    () => (floor && !presentation && !readOnly ? collidingItems(floor) : new Set<string>()),
    [floor, presentation, readOnly],
  );
  const drawn = useUnderlayLines(
    floor?.underlay,
    !!floor?.underlay?.visible && layers.underlay && layers.snapUnderlay && !readOnly,
  );
  useEffect(() => {
    drawnWalls = drawn;
    return () => {
      drawnWalls = null;
    };
  }, [drawn]);

  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 50, ox: 80, oy: 80 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [chainStart, setChainStart] = useState<Vec2 | null>(null);
  const [rectStart, setRectStart] = useState<Vec2 | null>(null);
  const [typed, setTyped] = useState("");
  const [calib, setCalib] = useState<Vec2 | null>(null);
  const [dimStart, setDimStart] = useState<Vec2 | null>(null);
  const [space, setSpace] = useState(false);

  const rooms = useMemo(() => (floor ? computeRoomGeometry(floor) : []), [floor]);
  const selectedIds = useMemo(() => new Set(selection.map((s) => s.id)), [selection]);

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.ox) / v.scale, y: (clientY - r.top - v.oy) / v.scale };
  }, []);

  const fit = useCallback(() => {
    const f = useEditor.getState().project?.floors.find((x) => x.id === useEditor.getState().floorId);
    const el = wrapRef.current;
    if (!f || !el) return;
    let b = floorBounds(f);
    if (f.underlay && f.underlay.visible && f.nodes.length === 0) {
      const u = f.underlay;
      b = boundsOf([
        { x: u.x, y: u.y },
        { x: u.x + u.widthPx / u.pxPerMeter, y: u.y + u.heightPx / u.pxPerMeter },
      ]);
    }
    const w = el.clientWidth;
    const h = el.clientHeight;
    const scale = Math.max(5, Math.min(400, Math.min((w - 120) / Math.max(b.w, 1), (h - 120) / Math.max(b.h, 1))));
    setView({ scale, ox: w / 2 - (b.minX + b.w / 2) * scale, oy: h / 2 - (b.minY + b.h / 2) * scale });
  }, []);

  useEffect(() => {
    registry.svg = svgRef.current;
    registry.fit = fit;
    return () => {
      registry.svg = null;
      registry.fit = null;
    };
  }, [fit]);

  // fit once a floor is shown
  const floorId = floor?.id;
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
  }, [floorId, fit]);

  // wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const v = viewRef.current;
      if (e.ctrlKey || !e.shiftKey) {
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const scale = Math.max(4, Math.min(900, v.scale * f));
        const k = scale / v.scale;
        setView({ scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k });
      } else {
        setView({ ...v, ox: v.ox - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const resetTransient = useCallback(() => {
    setChainStart(null);
    setRectStart(null);
    setTyped("");
    setCalib(null);
    setDimStart(null);
  }, []);

  // drop half-finished drawing state when the tool changes
  const [prevTool, setPrevTool] = useState(tool);
  if (prevTool !== tool) {
    setPrevTool(tool);
    setChainStart(null);
    setRectStart(null);
    setTyped("");
    setCalib(null);
    setDimStart(null);
  }

  const commitWallTo = useCallback(
    (end: Vec2) => {
      if (!chainStart) return;
      if (dist(chainStart, end) < 0.05) return;
      const start = chainStart;
      const drawn = drawnWalls ? thicknessAlong(start, end, drawnWalls.axes) : undefined;
      mutate((f) => {
        addWall(f, start, end, { type: wallType, thickness: drawn ?? wallThickness });
      });
      // closing a loop ends the chain
      const f = useEditor.getState().project!.floors.find((x) => x.id === useEditor.getState().floorId)!;
      const endNode = f.nodes.find((n) => dist(n, end) < 0.02);
      const endDegree = endNode ? f.walls.filter((w) => w.a === endNode.id || w.b === endNode.id).length : 0;
      setTyped("");
      if (endDegree > 1) setChainStart(null);
      else setChainStart(end);
    },
    [chainStart, mutate, wallType, wallThickness],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") {
        setSpace(e.type === "keydown");
        if (e.type === "keydown") e.preventDefault();
        return;
      }
      if (e.type !== "keydown" || st.readOnly) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        const ids = st.selection.filter((s) => s.kind === "item").map((s) => s.id);
        if (!ids.length) return;
        const newIds: string[] = [];
        st.mutate(
          (f) => {
            for (const id of ids) {
              const it = f.items.find((x) => x.id === id);
              if (!it) continue;
              const copy = { ...it, id: uid(), x: it.x + 0.3, y: it.y + 0.3 };
              f.items.push(copy);
              newIds.push(copy.id);
            }
          },
          { normalize: false },
        );
        st.select(newIds.map((id) => ({ kind: "item" as const, id })));
        return;
      }
      if (st.tool === "wall" && chainStart) {
        if (/^[0-9]$/.test(e.key) || e.key === "," || e.key === ".") {
          setTyped((t) => t + (e.key === "." ? "," : e.key));
          e.preventDefault();
          return;
        }
        if (e.key === "Backspace" && typed) {
          setTyped((t) => t.slice(0, -1));
          e.preventDefault();
          return;
        }
        if (e.key === "Enter" && typed && cursor) {
          const l = parseFloat(typed.replace(",", "."));
          if (l > 0) {
            const s = snapPoint(floor!, cursor, viewRef.current.scale, { from: chainStart });
            const dir = norm(sub(s.p, chainStart));
            if (dir.x || dir.y) commitWallTo(add(chainStart, mul(dir, l)));
          }
          e.preventDefault();
          return;
        }
      }
      if (e.key === "Escape") {
        if (chainStart || rectStart || calib || dimStart) resetTransient();
        else if (st.placing) st.setPlacing(null);
        else if (st.tool !== "select") st.setTool("select");
        else st.select(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!st.selection.length) return;
        e.preventDefault();
        const sel = st.selection;
        st.mutate((f) => {
          for (const s of sel) {
            if (s.kind === "wall") deleteWall(f, s.id);
            if (s.kind === "opening") f.openings = f.openings.filter((o) => o.id !== s.id);
            if (s.kind === "item") f.items = f.items.filter((o) => o.id !== s.id);
            if (s.kind === "label") f.labels = f.labels.filter((o) => o.id !== s.id);
            if (s.kind === "dimension") f.dimensions = f.dimensions.filter((o) => o.id !== s.id);
          }
        });
        st.select(null);
        return;
      }
      const itemSel = st.selection.filter((s) => s.kind === "item");
      if (itemSel.length && (e.key === "r" || e.key === "R")) {
        st.mutate(
          (f) => {
            for (const s of itemSel) {
              const it = f.items.find((x) => x.id === s.id);
              if (it) it.rotation = (it.rotation + (e.shiftKey ? -15 : 90) + 360) % 360;
            }
          },
          { normalize: false },
        );
        return;
      }
      if (st.selection.length && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.5 : 0.05;
        const d = {
          x: e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          y: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        };
        st.mutate((f) => {
          for (const s of st.selection) {
            if (s.kind === "item") {
              const it = f.items.find((x) => x.id === s.id);
              if (it) {
                it.x += d.x;
                it.y += d.y;
              }
            } else if (s.kind === "label") {
              const l = f.labels.find((x) => x.id === s.id);
              if (l) {
                l.x += d.x;
                l.y += d.y;
              }
            } else if (s.kind === "wall") {
              const w = f.walls.find((x) => x.id === s.id);
              if (w) {
                for (const id of [w.a, w.b]) {
                  const n = f.nodes.find((x) => x.id === id)!;
                  n.x += d.x;
                  n.y += d.y;
                }
              }
            }
          }
          clampOpenings(f);
        });
        return;
      }
      if (mod && ["c", "x", "v", "d"].includes(e.key.toLowerCase())) {
        const k = e.key.toLowerCase();
        const f = floor!;
        if (k !== "v") {
          const clip = copySelection(f, st.selection);
          if (!clip) return;
          e.preventDefault();
          st.setClipboard(clip);
          if (k === "x") {
            st.mutate((fl) => {
              for (const s of st.selection) {
                if (s.kind === "wall") deleteWall(fl, s.id);
                if (s.kind === "opening") fl.openings = fl.openings.filter((o) => o.id !== s.id);
                if (s.kind === "item") fl.items = fl.items.filter((o) => o.id !== s.id);
                if (s.kind === "label") fl.labels = fl.labels.filter((o) => o.id !== s.id);
                if (s.kind === "dimension") fl.dimensions = fl.dimensions.filter((o) => o.id !== s.id);
              }
            });
            st.select(null);
            return;
          }
          if (k === "c") {
            st.showToast("Kopiert. Mit Strg+V einfügen, auch auf einer anderen Etage.");
            return;
          }
        }
        const clip = useEditor.getState().clipboard;
        if (!clip) return;
        e.preventDefault();
        // on the same floor, each paste moves 50 cm further; on another floor it keeps the position
        const n = useEditor.getState().pasteCount + 1;
        const off = clip.sourceFloorId === f.id || k === "d" ? 0.5 * n : 0;
        let sel: ReturnType<typeof pasteClip> = [];
        st.mutate((fl) => {
          sel = pasteClip(fl, clip, { x: off, y: off });
        });
        useEditor.setState({ pasteCount: n });
        st.select(sel);
        return;
      }
      if (mod) return;
      const map: Record<string, Tool> = {
        v: "select",
        h: "pan",
        w: "wall",
        q: "room",
        t: "door",
        f: "window",
        m: "dimension",
        x: "text",
      };
      const t = map[e.key.toLowerCase()];
      if (t) st.setTool(t);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [chainStart, rectStart, calib, dimStart, typed, cursor, floor, commitWallTo, resetTransient]);

  if (!floor) return null;
  const px = view.scale;

  const hitTarget = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest("[data-kind]");
    return el ? { kind: el.getAttribute("data-kind")!, id: el.getAttribute("data-id")! } : null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    const v = viewRef.current;
    if (e.button === 1 || tool === "pan" || space) {
      drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: v.ox, oy: v.oy };
      return;
    }
    const free = e.altKey;

    if (placing) {
      const def = findDef(placing, defs);
      if (!def) return;
      const id = uid();
      mutate(
        (f) => {
          f.items.push({
            id,
            defId: def.id,
            x: p.x,
            y: p.y,
            rotation: 0,
            w: def.w,
            d: def.d,
            h: def.h,
            elevation: def.elevation,
          });
        },
        { normalize: false },
      );
      select({ kind: "item", id });
      if (!e.shiftKey) setPlacing(null);
      return;
    }

    if (tool === "wall") {
      const s = snapPoint(floor, p, px, { from: chainStart, free });
      if (!chainStart) setChainStart(s.p);
      else commitWallTo(s.p);
      return;
    }
    if (tool === "room") {
      const s = snapPoint(floor, p, px, { free });
      setRectStart(s.p);
      drag.current = { type: "rect", start: s.p };
      return;
    }
    const kind = OPENING_TOOLS[tool];
    if (kind) {
      const hit = wallAtPoint(floor, p, Math.max(0.4, 15 / px));
      if (!hit) return;
      const ends = wallEnds(floor, hit.wall)!;
      const n = perp(norm(sub(ends.b, ends.a)));
      const side = dot(sub(p, ends.a), n) < 0;
      const offset = Math.round(hit.offset / 0.01) * 0.01;
      let newId = "";
      mutate((f) => {
        const o = addOpening(f, hit.wall.id, offset, kind, { flipSide: side });
        newId = o?.id ?? "";
      });
      if (newId) select({ kind: "opening", id: newId });
      return;
    }
    if (tool === "dimension") {
      const s = snapPoint(floor, p, px, { from: dimStart, free });
      if (!dimStart) setDimStart(s.p);
      else {
        const a = dimStart;
        const id = uid();
        mutate(
          (f) => {
            f.dimensions.push({ id, a, b: s.p, offset: 0.4 });
          },
          { normalize: false },
        );
        setDimStart(null);
        select({ kind: "dimension", id });
      }
      return;
    }
    if (tool === "text") {
      const id = uid();
      mutate(
        (f) => {
          f.labels.push({ id, x: p.x, y: p.y, text: "Text", size: 0.3 });
        },
        { normalize: false },
      );
      select({ kind: "label", id });
      setTool("select");
      return;
    }
    if (tool === "calibrate") {
      if (!calib) setCalib(p);
      else {
        const a = calib;
        setCalib(null);
        const answer = window.prompt("Wie lang ist diese Strecke in Wirklichkeit (in Metern)?", "1,00");
        const meters = answer ? parseFloat(answer.replace(",", ".")) : NaN;
        const u = floor.underlay;
        if (u && meters > 0) {
          const worldLen = dist(a, p);
          const pxLen = worldLen * u.pxPerMeter;
          const ppm = pxLen / meters;
          // keep the first clicked point fixed in place
          const imgX = (a.x - u.x) * u.pxPerMeter;
          const imgY = (a.y - u.y) * u.pxPerMeter;
          mutate(
            (f) => {
              if (!f.underlay) return;
              const k = f.underlay.pxPerMeter;
              f.underlay.pxPerMeter = ppm;
              f.underlay.x = a.x - imgX / ppm;
              f.underlay.y = a.y - imgY / ppm;
              if (f.underlay.labels) {
                f.underlay.labels = f.underlay.labels.map((l) => ({
                  ...l,
                  x: f.underlay!.x + ((l.x - u.x) * k) / ppm,
                  y: f.underlay!.y + ((l.y - u.y) * k) / ppm,
                }));
              }
            },
            { normalize: false },
          );
          setTool("select");
          setTimeout(fit, 20);
        }
      }
      return;
    }

    // select tool
    const hit = hitTarget(e);
    if (!hit || hit.kind === "bg" || (hit.kind === "room" && e.shiftKey)) {
      if (e.shiftKey && !readOnly) {
        // shift + drag: frame selection
        drag.current = { type: "marquee", start: p, additive: true };
        setMarquee({ a: p, b: p });
        return;
      }
      select(null);
      drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: v.ox, oy: v.oy };
      return;
    }
    if (hit.kind === "rotate") {
      const it = floor.items.find((x) => x.id === hit.id);
      if (it) drag.current = { type: "rotate", id: it.id, center: { x: it.x, y: it.y }, moved: false };
      return;
    }
    if (hit.kind === "node") {
      drag.current = { type: "node", id: hit.id, moved: false };
      return;
    }
    if (hit.kind === "item") {
      const already = selectedIds.has(hit.id);
      if (!already) select({ kind: "item", id: hit.id }, e.shiftKey);
      const ids = already
        ? selection.filter((s) => s.kind === "item").map((s) => s.id)
        : e.shiftKey
          ? [...selection.filter((s) => s.kind === "item").map((s) => s.id), hit.id]
          : [hit.id];
      const orig = new Map<string, Vec2>();
      for (const id of ids) {
        const it = floor.items.find((x) => x.id === id);
        if (it) orig.set(id, { x: it.x, y: it.y });
      }
      drag.current = { type: "items", start: p, orig, moved: false };
      return;
    }
    if (hit.kind === "wall") {
      select({ kind: "wall", id: hit.id }, e.shiftKey);
      const w = floor.walls.find((x) => x.id === hit.id)!;
      const ends = wallEnds(floor, w)!;
      drag.current = {
        type: "wall",
        id: w.id,
        start: p,
        a: ends.a,
        b: ends.b,
        normal: perp(norm(sub(ends.b, ends.a))),
        moved: false,
      };
      return;
    }
    if (hit.kind === "opening") {
      select({ kind: "opening", id: hit.id });
      drag.current = { type: "opening", id: hit.id, moved: false };
      return;
    }
    if (hit.kind === "label") {
      select({ kind: "label", id: hit.id });
      const l = floor.labels.find((x) => x.id === hit.id)!;
      drag.current = { type: "label", id: l.id, start: p, orig: { x: l.x, y: l.y }, moved: false };
      return;
    }
    if (hit.kind === "dimension") {
      select({ kind: "dimension", id: hit.id });
      const d = floor.dimensions.find((x) => x.id === hit.id)!;
      drag.current = { type: "dimension", id: d.id, start: p, a: d.a, b: d.b, moved: false };
      return;
    }
    if (hit.kind === "room") {
      select({ kind: "room", id: hit.id }, e.shiftKey);
      drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: v.ox, oy: v.oy };
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    setCursor(p);
    const d = drag.current;
    const free = e.altKey;
    if (!d) {
      if (tool === "wall" || tool === "room" || tool === "dimension") {
        setSnap(
          snapPoint(floor, p, px, {
            from: tool === "wall" ? chainStart : tool === "dimension" ? dimStart : null,
            free,
          }),
        );
      } else setSnap(null);
      return;
    }
    const first = (moved: boolean) => {
      if (!moved) checkpoint();
    };
    switch (d.type) {
      case "pan":
        setView((v) => ({ ...v, ox: d.ox + e.clientX - d.sx, oy: d.oy + e.clientY - d.sy }));
        break;
      case "rect":
        setSnap(snapPoint(floor, p, px, { free }));
        break;
      case "items": {
        const delta = sub(p, d.start);
        if (!d.moved && Math.hypot(delta.x, delta.y) * px < 3) return;
        first(d.moved);
        d.moved = true;
        const g = free ? 0.001 : 0.01;
        mutate(
          (f) => {
            for (const [id, o] of d.orig) {
              const it = f.items.find((x) => x.id === id);
              if (!it) continue;
              it.x = Math.round((o.x + delta.x) / g) * g;
              it.y = Math.round((o.y + delta.y) / g) * g;
              // a single piece docks to walls with its back (Alt: free placement)
              if (d.orig.size === 1 && !free && !it.elevation) {
                const s = snapItemToWall(f, it, { x: it.x, y: it.y }, 12 / px + 0.05);
                if (s) Object.assign(it, s);
              }
            }
          },
          { history: false, normalize: false },
        );
        break;
      }
      case "marquee": {
        setMarquee({ a: d.start, b: p });
        break;
      }
      case "rotate": {
        first(d.moved);
        d.moved = true;
        const ang = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI + 90;
        const snapped = free ? ang : Math.round(ang / 15) * 15;
        mutate(
          (f) => {
            const it = f.items.find((x) => x.id === d.id);
            if (it) it.rotation = (snapped + 360) % 360;
          },
          { history: false, normalize: false },
        );
        break;
      }
      case "node": {
        first(d.moved);
        d.moved = true;
        const s = snapPoint(floor, p, px, { exclude: d.id, free });
        setSnap(s);
        mutate(
          (f) => {
            const n = f.nodes.find((x) => x.id === d.id);
            if (n) {
              n.x = s.p.x;
              n.y = s.p.y;
            }
            clampOpenings(f);
          },
          { history: false },
        );
        break;
      }
      case "wall": {
        const off = dot(sub(p, d.start), d.normal);
        if (!d.moved && Math.abs(off) * px < 3) return;
        first(d.moved);
        d.moved = true;
        const o = free ? off : Math.round(off / 0.01) * 0.01;
        mutate(
          (f) => {
            const w = f.walls.find((x) => x.id === d.id);
            if (!w) return;
            const na = f.nodes.find((x) => x.id === w.a)!;
            const nb = f.nodes.find((x) => x.id === w.b)!;
            na.x = d.a.x + d.normal.x * o;
            na.y = d.a.y + d.normal.y * o;
            nb.x = d.b.x + d.normal.x * o;
            nb.y = d.b.y + d.normal.y * o;
            clampOpenings(f);
          },
          { history: false },
        );
        break;
      }
      case "opening": {
        first(d.moved);
        d.moved = true;
        mutate(
          (f) => {
            const o = f.openings.find((x) => x.id === d.id);
            const w = o && f.walls.find((x) => x.id === o.wallId);
            if (!o || !w) return;
            const ends = wallEnds(f, w)!;
            const pr = projectToSegment(p, ends.a, ends.b);
            o.offset = Math.round((pr.t * dist(ends.a, ends.b)) / 0.01) * 0.01;
            clampOpenings(f);
          },
          { history: false, normalize: false },
        );
        break;
      }
      case "label": {
        first(d.moved);
        d.moved = true;
        const delta = sub(p, d.start);
        mutate(
          (f) => {
            const l = f.labels.find((x) => x.id === d.id);
            if (l) {
              l.x = d.orig.x + delta.x;
              l.y = d.orig.y + delta.y;
            }
          },
          { history: false, normalize: false },
        );
        break;
      }
      case "dimension": {
        first(d.moved);
        d.moved = true;
        const delta = sub(p, d.start);
        mutate(
          (f) => {
            const dm = f.dimensions.find((x) => x.id === d.id);
            if (dm) {
              dm.a = add(d.a, delta);
              dm.b = add(d.b, delta);
            }
          },
          { history: false, normalize: false },
        );
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.type === "marquee") {
      const end = toWorld(e.clientX, e.clientY);
      setMarquee(null);
      if (Math.abs(end.x - d.start.x) * px > 4 || Math.abs(end.y - d.start.y) * px > 4) {
        select(selectInRect(floor, d.start, end), d.additive);
      }
      return;
    }
    if (d?.type === "rect" && rectStart) {
      const end = snapPoint(floor, toWorld(e.clientX, e.clientY), px, { free: e.altKey }).p;
      const x = Math.min(rectStart.x, end.x);
      const y = Math.min(rectStart.y, end.y);
      const w = Math.abs(end.x - rectStart.x);
      const h = Math.abs(end.y - rectStart.y);
      if (w > 0.3 && h > 0.3) {
        mutate((f) => {
          addRectRoom(f, x, y, w, h, { type: wallType, thickness: wallThickness });
        });
      }
      setRectStart(null);
    }
    if (d?.type === "node" && d.moved) {
      // merge with a node at the same spot
      mutate(
        (f) => {
          const n = f.nodes.find((x) => x.id === d.id);
          if (!n) return;
          const other = f.nodes.find((x) => x.id !== n.id && dist(x, n) < 0.02);
          if (other) {
            for (const w of f.walls) {
              if (w.a === n.id) w.a = other.id;
              if (w.b === n.id) w.b = other.id;
            }
            f.walls = f.walls.filter((w) => w.a !== w.b);
          }
        },
        { history: false },
      );
    }
    setSnap(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "wall") {
      setChainStart(null);
      return;
    }
    if (tool !== "select") return;
    const el = (e.target as Element).closest("[data-kind]");
    if (el?.getAttribute("data-kind") === "wall") {
      const id = el.getAttribute("data-id")!;
      const p = toWorld(e.clientX, e.clientY);
      mutate((f) => {
        splitWall(f, id, p);
      });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const defId = e.dataTransfer.getData("text/x-furniture");
    if (!defId) return;
    e.preventDefault();
    const def = findDef(defId, defs);
    if (!def) return;
    const p = toWorld(e.clientX, e.clientY);
    const id = uid();
    mutate(
      (f) => {
        f.items.push({
          id,
          defId: def.id,
          x: p.x,
          y: p.y,
          rotation: 0,
          w: def.w,
          d: def.d,
          h: def.h,
          elevation: def.elevation,
        });
      },
      { normalize: false },
    );
    select({ kind: "item", id });
  };

  // ---------------------------------------------------------------- overlays
  const overlay: React.ReactNode[] = [];
  const handleR = 5 / px;

  for (const s of selection) {
    if (s.kind === "wall") {
      const w = floor.walls.find((x) => x.id === s.id);
      const ends = w && wallEnds(floor, w);
      if (!w || !ends) continue;
      for (const [nid, pt] of [
        [w.a, ends.a],
        [w.b, ends.b],
      ] as const) {
        overlay.push(
          <circle
            key={`h-${nid}`}
            cx={pt.x}
            cy={pt.y}
            r={handleR * 1.3}
            fill="#fff"
            stroke="#2563eb"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-kind="node"
            data-id={nid}
            style={{ cursor: "grab" }}
          />,
        );
      }
    }
    if (s.kind === "item") {
      const it = floor.items.find((x) => x.id === s.id);
      if (!it) continue;
      const c = rectCorners(it.x, it.y, it.w, it.d, it.rotation);
      const r = (it.rotation * Math.PI) / 180;
      const up = { x: Math.sin(r), y: -Math.cos(r) };
      const top = add({ x: it.x, y: it.y }, mul(up, it.d / 2));
      const knob = add(top, mul(up, 22 / px));
      overlay.push(
        <g key={`sel-${it.id}`}>
          <polygon
            points={pts(c)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />
          <line
            x1={top.x}
            y1={top.y}
            x2={knob.x}
            y2={knob.y}
            stroke="#2563eb"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={knob.x}
            cy={knob.y}
            r={handleR * 1.2}
            fill="#fff"
            stroke="#2563eb"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-kind="rotate"
            data-id={it.id}
            style={{ cursor: "grab" }}
          />
          <text x={it.x} y={it.y + it.d / 2 + 14 / px} fontSize={10 / px} textAnchor="middle" fill="#2563eb">
            {formatM(it.w)} × {formatM(it.d)}
          </text>
        </g>,
      );
    }
    if (s.kind === "room") {
      const r = rooms.find((x) => x.meta.id === s.id);
      if (r)
        overlay.push(
          <polygon
            key={`rs-${r.meta.id}`}
            points={pts(r.inner)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: "none" }}
          />,
        );
    }
  }

  const snapMarker = snap ? (
    <g style={{ pointerEvents: "none" }}>
      {snap.guideX !== undefined && (
        <line
          x1={snap.guideX}
          y1={snap.p.y - 1e3}
          x2={snap.guideX}
          y2={snap.p.y + 1e3}
          stroke="#c2410c"
          strokeWidth={0.7}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {snap.guideY !== undefined && (
        <line
          x1={snap.p.x - 1e3}
          y1={snap.guideY}
          x2={snap.p.x + 1e3}
          y2={snap.guideY}
          stroke="#c2410c"
          strokeWidth={0.7}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <circle
        cx={snap.p.x}
        cy={snap.p.y}
        r={handleR}
        fill={snap.onNode ? "#c2410c" : snap.onDrawing ? "#0d9488" : "#fff"}
        stroke={snap.onDrawing ? "#0d9488" : "#c2410c"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  ) : null;

  // wall preview
  let wallPreview: React.ReactNode = null;
  if (tool === "wall" && chainStart && snap) {
    let end = snap.p;
    if (typed) {
      const l = parseFloat(typed.replace(",", "."));
      const dir = norm(sub(snap.p, chainStart));
      if (l > 0 && (dir.x || dir.y)) end = add(chainStart, mul(dir, l));
    }
    const L = dist(chainStart, end);
    const n = perp(norm(sub(end, chainStart)));
    const h = wallThickness / 2;
    const poly = [add(chainStart, mul(n, h)), add(end, mul(n, h)), add(end, mul(n, -h)), add(chainStart, mul(n, -h))];
    const mid = mul(add(chainStart, end), 0.5);
    wallPreview = (
      <g style={{ pointerEvents: "none" }}>
        <polygon
          points={pts(poly)}
          fill="#c2410c"
          fillOpacity={0.35}
          stroke="#c2410c"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <g transform={`translate(${mid.x} ${mid.y})`}>
          <rect x={-34 / px} y={-26 / px} width={68 / px} height={18 / px} rx={4 / px} fill="#1f1e1c" />
          <text x={0} y={-13 / px} fontSize={11 / px} textAnchor="middle" fill="#fff">
            {typed ? `${typed} m` : `${formatM(L)} m`}
          </text>
        </g>
      </g>
    );
  }

  let rectPreview: React.ReactNode = null;
  if (tool === "room" && rectStart && snap) {
    const x = Math.min(rectStart.x, snap.p.x);
    const y = Math.min(rectStart.y, snap.p.y);
    const w = Math.abs(snap.p.x - rectStart.x);
    const h = Math.abs(snap.p.y - rectStart.y);
    rectPreview = (
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="#c2410c"
          fillOpacity={0.08}
          stroke="#c2410c"
          strokeWidth={wallThickness}
          strokeOpacity={0.45}
        />
        <text x={x + w / 2} y={y + h / 2} fontSize={12 / px} textAnchor="middle" fill="#c2410c">
          {formatM(w)} × {formatM(h)} m
        </text>
      </g>
    );
  }

  let openingPreview: React.ReactNode = null;
  const okind = OPENING_TOOLS[tool];
  if (okind && cursor) {
    const hit = wallAtPoint(floor, cursor, Math.max(0.4, 15 / px));
    if (hit) {
      const frame = wallFrames(floor).find((f) => f.wall.id === hit.wall.id);
      if (frame) {
        const wdt = OPENING_DEFAULTS[okind].width;
        const off = Math.max(wdt / 2, Math.min(hit.length - wdt / 2, hit.offset));
        openingPreview = (
          <polygon
            points={pts(wallRect(frame, off - wdt / 2, off + wdt / 2, frame.wall.thickness + 0.06))}
            fill="#c2410c"
            fillOpacity={0.5}
            style={{ pointerEvents: "none" }}
          />
        );
      }
    }
  }

  let ghost: React.ReactNode = null;
  if (placing && cursor) {
    const def = findDef(placing, defs);
    if (def)
      ghost = (
        <rect
          x={cursor.x - def.w / 2}
          y={cursor.y - def.d / 2}
          width={def.w}
          height={def.d}
          fill="#c2410c"
          fillOpacity={0.25}
          stroke="#c2410c"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: "none" }}
        />
      );
  }

  let calibLine: React.ReactNode = null;
  if ((tool === "calibrate" && calib && cursor) || (tool === "dimension" && dimStart && snap)) {
    const a = tool === "calibrate" ? calib! : dimStart!;
    const b = tool === "calibrate" ? cursor! : snap!.p;
    calibLine = (
      <g style={{ pointerEvents: "none" }}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c2410c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8 / px} fontSize={11 / px} textAnchor="middle" fill="#c2410c">
          {formatM(dist(a, b))} m
        </text>
      </g>
    );
  }

  const gridMinor = px > 60 ? 0.1 : px > 18 ? 0.5 : 1;
  const cursorStyle = tool === "pan" || space ? "grab" : tool === "select" && !placing ? "default" : "crosshair";

  const hint =
    tool === "wall"
      ? chainStart
        ? "Klicken für den nächsten Punkt, Länge eintippen + Enter, Doppelklick/Esc beendet. Alt = ohne Fangen."
        : "Startpunkt klicken. Wände docken an Ecken und Wände an."
      : tool === "room"
        ? "Rechteck aufziehen: erzeugt einen Raum mit vier Wänden."
        : okind
          ? "Auf eine Wand klicken. Die Tür öffnet zur Seite, auf der Sie klicken."
          : tool === "calibrate"
            ? calib
              ? "Zweiten Punkt einer bekannten Strecke klicken."
              : "Ersten Punkt einer bekannten Strecke im Plan klicken."
            : tool === "dimension"
              ? "Zwei Punkte für eine Maßkette klicken."
              : placing
                ? "Klicken zum Platzieren (Umschalt = mehrere). Esc bricht ab."
                : null;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-[#efece6]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className="plan-svg no-select absolute inset-0 h-full w-full touch-none"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="plan-canvas"
      >
        <defs>
          <pattern id="grid" patternUnits="userSpaceOnUse" width={1} height={1}>
            <rect width={1} height={1} fill={presentation ? "#ffffff" : "#f4f2ed"} />
            {!presentation && layers.grid && (
              <>
                {gridMinor < 1 &&
                  Array.from({ length: Math.round(1 / gridMinor) }, (_, i) => (
                    <path
                      key={i}
                      d={`M${i * gridMinor} 0 V1 M0 ${i * gridMinor} H1`}
                      stroke="#e4e0d8"
                      strokeWidth={0.7 / px}
                    />
                  ))}
                <path d="M0 0 V1 M0 0 H1" stroke="#d6d1c6" strokeWidth={1 / px} />
              </>
            )}
          </pattern>
        </defs>
        <MaterialPatterns />
        <g transform={`translate(${view.ox} ${view.oy}) scale(${px})`}>
          <rect x={-500} y={-500} width={1000} height={1000} fill="url(#grid)" data-kind="bg" />
          <PlanLayers
            floor={floor}
            rooms={rooms}
            defs={defs}
            scale={px}
            presentation={presentation}
            selectedIds={selectedIds}
            layers={layers}
          />
          {overlay}
          {wallPreview}
          {rectPreview}
          {openingPreview}
          {ghost}
          {calibLine}
          {colliding.size > 0 &&
            floor.items
              .filter((it) => colliding.has(it.id))
              .map((it) => (
                <polygon
                  key={`hit-${it.id}`}
                  points={pts(rectCorners(it.x, it.y, it.w, it.d, it.rotation))}
                  fill="#dc2626"
                  fillOpacity={0.08}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                  data-testid="collision"
                />
              ))}
          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="#c2410c"
              fillOpacity={0.06}
              stroke="#c2410c"
              strokeWidth={1}
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "none" }}
            />
          )}
          {drawn && (tool === "wall" || tool === "room") && (
            <g style={{ pointerEvents: "none" }} data-testid="drawn-walls">
              {drawn.axes.map((a, i) =>
                a.dir === "h" ? (
                  <line
                    key={i}
                    x1={a.from}
                    x2={a.to}
                    y1={a.at}
                    y2={a.at}
                    stroke="#0d9488"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <line
                    key={i}
                    y1={a.from}
                    y2={a.to}
                    x1={a.at}
                    x2={a.at}
                    stroke="#0d9488"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </g>
          )}
          {snapMarker}
          {floor.underlay?.labels &&
            layers.underlay &&
            floor.underlay.visible &&
            !presentation &&
            floor.underlay.labels.map((l, i) => (
              <circle key={`ul-${i}`} cx={l.x} cy={l.y} r={3 / px} fill="#c2410c" style={{ pointerEvents: "none" }} />
            ))}
        </g>
      </svg>
      {hint && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-4 py-1.5 text-xs text-white shadow">
          {hint}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-panel/90 px-2 py-1 text-[11px] text-muted shadow-sm">
        {cursor ? `${formatM(cursor.x)} / ${formatM(cursor.y)} m · ` : ""}
        {Math.round(px)} px/m
      </div>
    </div>
  );
}
