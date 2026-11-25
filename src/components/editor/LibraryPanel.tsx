"use client";

import clsx from "clsx";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CATALOG, CATEGORY_LABELS } from "@/furniture/catalog";
import { deleteGlobalFurniture, listGlobalFurniture } from "@/lib/db";
import type { FurnitureCategory, FurnitureDef } from "@/model/types";
import { useEditor } from "@/store/editor";
import { FurnitureShape } from "../plan/FurnitureSymbol";
import { CustomFurnitureDialog } from "./CustomFurnitureDialog";

function Thumb({ def }: { def: FurnitureDef }) {
  const pad = 0.08 * Math.max(def.w, def.d);
  return (
    <svg
      viewBox={`${-def.w / 2 - pad} ${-def.d / 2 - pad} ${def.w + 2 * pad} ${def.d + 2 * pad}`}
      className="h-12 w-full"
    >
      <FurnitureShape def={def} item={{ w: def.w, d: def.d, h: def.h }} presentation />
    </svg>
  );
}

export function LibraryPanel() {
  const project = useEditor((s) => s.project);
  const globalDefs = useEditor((s) => s.globalFurniture);
  const placing = useEditor((s) => s.placing);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FurnitureCategory | "alle">("alle");
  const [editing, setEditing] = useState<FurnitureDef | null | "new">(null);

  const custom = useMemo(() => {
    const own = project?.customFurniture ?? [];
    const ids = new Set(own.map((d) => d.id));
    return [...own, ...globalDefs.filter((d) => !ids.has(d.id))];
  }, [project?.customFurniture, globalDefs]);

  const all = useMemo(() => [...custom.map((d) => ({ ...d, category: "eigene" as const })), ...CATALOG], [custom]);
  const filtered = all.filter(
    (d) => (cat === "alle" || d.category === cat) && (!q || d.name.toLowerCase().includes(q.toLowerCase())),
  );
  const cats = (Object.keys(CATEGORY_LABELS) as FurnitureCategory[]).filter((c) => all.some((d) => d.category === c));

  const remove = async (def: FurnitureDef) => {
    if (!window.confirm(`„${def.name}“ aus der Bibliothek löschen?`)) return;
    useEditor.getState().mutateProject((p) => {
      p.customFurniture = p.customFurniture.filter((d) => d.id !== def.id);
    });
    await deleteGlobalFurniture(def.id);
    useEditor.getState().setGlobalFurniture(await listGlobalFurniture());
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Möbel</h2>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
          >
            <Plus size={14} /> Eigenes Möbel
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen …"
            className="h-8 w-full rounded-md border border-line bg-panel pl-7 pr-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["alle", ...cats] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px]",
                cat === c ? "bg-ink text-white" : "bg-paper text-muted hover:text-ink",
              )}
            >
              {c === "alle" ? "Alle" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3">
        {filtered.map((d) => (
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/x-furniture", d.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => useEditor.getState().setPlacing(placing === d.id ? null : d.id)}
            onKeyDown={(e) => e.key === "Enter" && useEditor.getState().setPlacing(d.id)}
            className={clsx(
              "group relative cursor-grab rounded-lg border bg-panel p-1.5 text-left transition hover:border-accent",
              placing === d.id ? "border-accent ring-2 ring-accent-soft" : "border-line",
            )}
            title="Klicken und in den Plan klicken, oder in den Plan ziehen"
          >
            <Thumb def={d} />
            <div className="mt-1 truncate text-[11px] font-medium">{d.name}</div>
            <div className="text-[10px] text-muted">
              {Math.round(d.w * 100)} × {Math.round(d.d * 100)} cm
            </div>
            {d.category === "eigene" && (
              <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                <button
                  type="button"
                  title="Bearbeiten"
                  className="rounded bg-panel p-1 shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(custom.find((c) => c.id === d.id) ?? null);
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  title="Löschen"
                  className="rounded bg-panel p-1 text-red-700 shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(d);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="col-span-2 text-sm text-muted">Nichts gefunden.</p>}
      </div>
      <CustomFurnitureDialog
        open={editing !== null}
        initial={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
