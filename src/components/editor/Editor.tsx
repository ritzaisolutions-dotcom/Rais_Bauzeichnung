"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { listGlobalFurniture } from "@/lib/db";
import { loadProject, saveProject } from "@/lib/storage";
import { planPngBlob } from "@/lib/exports";
import { useEditor } from "@/store/editor";
import { PlanCanvas } from "../plan/PlanCanvas";
import { ChatPanel } from "./ChatPanel";
import { HelpDialog, IntroCard } from "./HelpDialog";
import { ImportDialog } from "./ImportDialog";
import { LibraryPanel } from "./LibraryPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";

import { Safe3D } from "../three/Safe3D";
const Scene3D = dynamic(() => import("../three/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted">3D-Ansicht wird geladen …</div>
  ),
});

function blobToDataUrl(b: Blob) {
  return new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(b);
  });
}

export function Editor({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  const view = useEditor((s) => s.view);
  const toast = useEditor((s) => s.toast);
  const [status, setStatus] = useState<"loading" | "missing" | "error" | "ready">("loading");
  const [savedAt, setSavedAt] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "?") setHelpOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const lastThumb = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadProject(id).catch(() => undefined);
      if (cancelled) return;
      if (p === undefined) return setStatus("error");
      if (!p) return setStatus("missing");
      useEditor.getState().load(p);
      useEditor.getState().setGlobalFurniture(await listGlobalFurniture());
      setStatus("ready");
      if (new URLSearchParams(window.location.search).get("import") === "1") {
        setImportOpen(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // debounced autosave
  useEffect(() => {
    if (!project || status !== "ready") return;
    const t = setTimeout(async () => {
      let toSave = project;
      if (Date.now() - lastThumb.current > 20000) {
        lastThumb.current = Date.now();
        const floor = project.floors.find((f) => f.id === useEditor.getState().floorId);
        const blob = floor && floor.walls.length ? await planPngBlob(floor, 24).catch(() => null) : null;
        if (blob) toSave = { ...project, thumbnail: await blobToDataUrl(blob) };
      }
      try {
        await saveProject(toSave);
        setSavedAt(project.updatedAt);
      } catch (e) {
        const st = (e as { status?: number }).status;
        useEditor
          .getState()
          .showToast(
            st === 409
              ? "Das Projekt wurde inzwischen an anderer Stelle geändert. Bitte laden Sie die Seite neu, bevor Sie weiterarbeiten."
              : `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : "unbekannter Fehler"}. Ihre Änderungen bleiben in diesem Fenster erhalten.`,
          );
      }
    }, 700);
    return () => clearTimeout(t);
  }, [project, status]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useEditor.getState().showToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (status === "loading")
    return <div className="flex h-screen items-center justify-center text-muted">Projekt wird geladen …</div>;
  if (status === "error")
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p>Das Projekt konnte nicht geladen werden. Bitte prüfen Sie die Verbindung und laden Sie die Seite neu.</p>
        <Link href="/" className="text-accent underline">
          Zur Projektübersicht
        </Link>
      </div>
    );
  if (status === "missing")
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p>Dieses Projekt wurde nicht gefunden.</p>
        <Link href="/" className="text-accent underline">
          Zur Projektübersicht
        </Link>
      </div>
    );

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        saved={!project || savedAt >= project.updatedAt}
        onImport={() => setImportOpen(true)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(!chatOpen)}
      />
      <div className="flex min-h-0 flex-1">
        <Toolbar
          libraryOpen={libraryOpen}
          onToggleLibrary={() => setLibraryOpen(!libraryOpen)}
          onHelp={() => setHelpOpen(true)}
        />
        {libraryOpen && (
          <aside className="w-60 shrink-0 border-r border-line bg-panel">
            <LibraryPanel />
          </aside>
        )}
        <main className={clsx("relative min-w-0 flex-1", view === "split" && "grid grid-cols-2")}>
          {view !== "3d" && (
            <div className="h-full min-w-0">
              <PlanCanvas />
            </div>
          )}
          {view !== "2d" && (
            <div className={clsx("h-full min-w-0", view === "split" && "border-l border-line")}>
              <Safe3D>
                <Scene3D />
              </Safe3D>
            </div>
          )}
          <IntroCard onHelp={() => setHelpOpen(true)} />
          {toast && (
            <div className="absolute left-1/2 top-3 z-30 flex max-w-xl -translate-x-1/2 items-start gap-2 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
              <span>{toast}</span>
              <button type="button" aria-label="Schließen" onClick={() => useEditor.getState().showToast(null)}>
                <X size={16} />
              </button>
            </div>
          )}
        </main>
        <aside className={clsx("shrink-0 overflow-y-auto border-l border-line bg-panel", chatOpen ? "w-96" : "w-72")}>
          {chatOpen ? <ChatPanel onClose={() => setChatOpen(false)} /> : <PropertiesPanel />}
        </aside>
      </div>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
