"use client";

import clsx from "clsx";
import { Box, Columns2, Square } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { computeRoomGeometry, formatM } from "@/model/geometry";
import { livingArea } from "@/model/woflv";
import { ROOM_TYPE_LABELS } from "@/model/materials";
import type { Project } from "@/model/types";
import { useActiveFloor, useEditor, type ViewMode } from "@/store/editor";
import { PlanCanvas } from "../plan/PlanCanvas";

import { Safe3D } from "../three/Safe3D";
const Scene3D = dynamic(() => import("../three/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted">3D-Ansicht wird geladen …</div>
  ),
});

/** Public, read-only view behind a share link. */
export function ShareView({ token }: { token: string }) {
  const [state, setState] = useState<{ status: "loading" | "ready" } | { status: "error"; message: string }>({
    status: "loading",
  });
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const floorId = useEditor((s) => s.floorId);
  const floor = useActiveFloor();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { project?: Project; error?: string } | null;
      if (cancelled) return;
      if (!res?.ok || !data?.project) {
        setState({ status: "error", message: data?.error ?? "Der Grundriss konnte nicht geladen werden." });
        return;
      }
      const st = useEditor.getState();
      st.load(data.project, { readOnly: true });
      st.setPresentation(true);
      st.setView("split");
      setState({ status: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const rooms = useMemo(() => (floor ? computeRoomGeometry(floor) : []), [floor]);
  const living = floor ? livingArea(floor, rooms) : 0;

  if (state.status === "loading")
    return <div className="flex h-screen items-center justify-center text-muted">Grundriss wird geladen …</div>;
  if (state.status === "error" || !project || !floor)
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <p>{state.status === "error" ? state.message : "Der Grundriss ist leer."}</p>
      </div>
    );

  const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "2d", label: "Grundriss", icon: <Square size={15} /> },
    { id: "split", label: "Beides", icon: <Columns2 size={15} /> },
    { id: "3d", label: "3D", icon: <Box size={15} /> },
  ];

  return (
    <div className="flex h-screen flex-col" data-testid="share-view">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <h1 className="mr-2 text-sm font-semibold">{project.name}</h1>
        {project.floors.length > 1 &&
          project.floors.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => useEditor.getState().setFloor(f.id)}
              className={clsx(
                "h-7 rounded-md px-2.5 text-xs font-medium",
                f.id === floorId ? "bg-ink text-white" : "bg-paper hover:bg-line",
              )}
            >
              {f.name}
            </button>
          ))}
        <div className="ml-auto flex items-center rounded-lg bg-paper p-0.5">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => useEditor.getState().setView(v.id)}
              className={clsx(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                view === v.id ? "bg-panel shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className={clsx("relative min-h-0 min-w-0 flex-1", view === "split" && "grid md:grid-cols-2")}>
          {view !== "3d" && (
            <div className="h-full min-h-[50vh] min-w-0">
              <PlanCanvas />
            </div>
          )}
          {view !== "2d" && (
            <div className={clsx("h-full min-h-[50vh] min-w-0", view === "split" && "md:border-l border-line")}>
              <Safe3D>
                <Scene3D />
              </Safe3D>
            </div>
          )}
        </main>
        <aside className="shrink-0 overflow-y-auto border-t border-line bg-panel p-4 md:w-72 md:border-l md:border-t-0">
          <h2 className="mb-2 text-sm font-semibold">Flächen · {floor.name}</h2>
          <table className="w-full text-sm" data-testid="share-areas">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.meta.id} className="border-b border-line/60">
                  <td className="py-1.5">
                    {r.meta.name}
                    <span className="block text-[11px] text-muted">
                      {ROOM_TYPE_LABELS[r.meta.roomType ?? "sonstiges"]}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{formatM(r.area)} m²</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-2 font-semibold">Wohnfläche</td>
                <td className="pt-2 text-right font-semibold tabular-nums">{formatM(living)} m²</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-[11px] text-muted">Nach WoFlV: Balkon und Terrasse zu 25 %, Dachschrägen anteilig.</p>
        </aside>
      </div>
    </div>
  );
}
