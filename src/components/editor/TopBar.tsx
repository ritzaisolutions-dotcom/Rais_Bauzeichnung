"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Maximize,
  Palette,
  Plus,
  Redo2,
  Share2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Columns2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { applyUnderlayLabels } from "@/ai/applyPlan";
import {
  areaCsv,
  download,
  exportGlb,
  planPngBlob,
  planSvgString,
  printPlan,
  projectJson,
  safeName,
  screenshot3d,
} from "@/lib/exports";
import { registry } from "@/lib/registry";
import { spritesIdle } from "../three/sprites";
import { emptyFloor, uid } from "@/model/ops";
import { useActiveFloor, useEditor, type ViewMode } from "@/store/editor";
import { isCloud } from "@/lib/storage";
import { Button, IconButton } from "../ui";
import { PdfExportDialog } from "./PdfExportDialog";
import { ShareDialog } from "./ShareDialog";

function Menu({
  label,
  icon,
  children,
  align = "right",
}: {
  label: string;
  icon: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen(!open)}>
        {icon}
        <span className="hidden lg:inline">{label}</span>
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div
          className={clsx(
            "absolute top-9 z-40 w-64 rounded-lg border border-line bg-panel p-1 shadow-xl",
            align === "left" ? "left-0" : "right-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const MenuItem = ({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-paper disabled:opacity-40"
  >
    {children}
  </button>
);

export function TopBar({
  saved,
  onImport,
  chatOpen,
  onToggleChat,
}: {
  saved: boolean;
  onImport: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}) {
  const project = useEditor((s) => s.project);
  const floorId = useEditor((s) => s.floorId);
  const view = useEditor((s) => s.view);
  const presentation = useEditor((s) => s.presentation);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const floor = useActiveFloor();
  const st = useEditor.getState();
  const [cloud, setCloud] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  useEffect(() => {
    isCloud().then(setCloud, () => setCloud(false));
  }, []);
  if (!project || !floor) return null;

  const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "2d", label: "2D", icon: <Square size={15} /> },
    { id: "split", label: "2D + 3D", icon: <Columns2 size={15} /> },
    { id: "3d", label: "3D", icon: <Box size={15} /> },
  ];
  const base = safeName(`${project.name}_${floor.name}`);

  const withPlan = async (fn: () => Promise<void> | void) => {
    // exports need the 2D canvas mounted and no selection overlays
    const prevView = st.view;
    st.select(null);
    if (prevView === "3d") st.setView("split");
    await new Promise((r) => setTimeout(r, 80));
    // furniture top views are rendered lazily; export only once they are all done
    await spritesIdle();
    await new Promise((r) => setTimeout(r, 80));
    await fn();
    if (prevView === "3d") st.setView(prevView);
  };

  const with3d = async (fn: () => Promise<void> | void) => {
    const prevView = st.view;
    if (prevView === "2d") st.setView("split");
    await new Promise((r) => setTimeout(r, 400));
    await fn();
    if (prevView === "2d") st.setView(prevView);
  };

  return (
    <header className="flex h-12 items-center gap-2 border-b border-line bg-panel px-2">
      <Link
        href="/"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-paper"
        title="Zur Projektübersicht"
      >
        <ArrowLeft size={18} />
      </Link>
      <input
        value={project.name}
        onChange={(e) =>
          st.mutateProject(
            (p) => {
              p.name = e.target.value;
            },
            { history: false },
          )
        }
        className="h-8 w-44 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold hover:border-line focus:border-accent focus:outline-none"
        aria-label="Projektname"
      />
      <div className="flex items-center gap-1 overflow-x-auto">
        {project.floors.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => st.setFloor(f.id)}
            className={clsx(
              "h-7 whitespace-nowrap rounded-md px-2.5 text-xs font-medium",
              f.id === floorId ? "bg-ink text-white" : "bg-paper hover:bg-line",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div data-testid="floor-menu">
        <Menu label="" icon={<Plus size={14} />} align="left">
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  const f = emptyFloor(`Etage ${project.floors.length + 1}`);
                  st.mutateProject((p) => {
                    p.floors.push(f);
                  });
                  st.setFloor(f.id);
                  close();
                }}
              >
                <Plus size={14} /> Neue leere Etage
              </MenuItem>
              <MenuItem
                onClick={() => {
                  const copy = JSON.parse(JSON.stringify(floor));
                  copy.id = uid();
                  copy.name = `${floor.name} (Kopie)`;
                  st.mutateProject((p) => {
                    p.floors.push(copy);
                  });
                  st.setFloor(copy.id);
                  close();
                }}
              >
                <Copy size={14} /> Aktuelle Etage duplizieren
              </MenuItem>
              <MenuItem
                disabled={project.floors.length < 2}
                onClick={() => {
                  if (!window.confirm(`Etage „${floor.name}“ löschen?`)) return;
                  st.mutateProject((p) => {
                    p.floors = p.floors.filter((f) => f.id !== floor.id);
                  });
                  st.setFloor(useEditor.getState().project!.floors[0].id);
                  close();
                }}
              >
                <Trash2 size={14} /> Aktuelle Etage löschen
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <div className="ml-2 flex items-center">
        <IconButton label="Rückgängig (Strg+Z)" onClick={st.undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="Wiederholen (Strg+Umschalt+Z)" onClick={st.redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </IconButton>
        <IconButton label="Plan einpassen" onClick={() => registry.fit?.()}>
          <Maximize size={16} />
        </IconButton>
      </div>

      <div className="mx-auto flex items-center rounded-lg bg-paper p-0.5">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => st.setView(v.id)}
            data-testid={`view-${v.id}`}
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

      <Button
        onClick={() => st.setPresentation(!presentation)}
        className={clsx(presentation && "border-accent bg-accent-soft text-accent")}
        title="Präsentationsansicht mit Bodenbelägen und Schatten"
        data-testid="presentation-toggle"
      >
        <Palette size={15} /> <span className="hidden lg:inline">Präsentation</span>
      </Button>
      <Button onClick={onImport} data-testid="import-button">
        <FileUp size={15} /> <span className="hidden lg:inline">Bauzeichnung</span>
      </Button>
      {floor.underlay?.labels?.length ? (
        <Button
          title="Raumnamen und Soll-Flächen aus dem PDF auf die gezeichneten Räume übertragen"
          onClick={() => {
            let n = 0;
            st.mutate(
              (f) => {
                n = applyUnderlayLabels(f);
              },
              { normalize: false },
            );
            st.showToast(`${n} Räume aus der Bauzeichnung benannt.`);
          }}
        >
          Raumnamen übernehmen
        </Button>
      ) : null}
      <Menu label="Export" icon={<Download size={15} />}>
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                void withPlan(async () => {
                  const b = await planPngBlob(floor);
                  if (b) download(b, `${base}.png`);
                });
              }}
            >
              Grundriss als PNG (hochauflösend)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void withPlan(async () => {
                  const b = await planPngBlob(floor, 600);
                  if (b) download(b, `${base}_druck.png`);
                });
              }}
            >
              Grundriss als PNG für Großdruck (600 px/m)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void withPlan(() => {
                  const r = planSvgString(floor);
                  if (r) download(new Blob([r.svg], { type: "image/svg+xml" }), `${base}.svg`);
                });
              }}
            >
              Grundriss als SVG (Vektor)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void withPlan(async () => {
                  const b = await planPngBlob(floor, 400);
                  if (b && !printPlan(URL.createObjectURL(b), `${project.name} · ${floor.name}`))
                    st.showToast("Bitte Pop-ups erlauben, um zu drucken.");
                });
              }}
            >
              Drucken
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                setPdfOpen(true);
              }}
            >
              PDF-Plan maßstäblich (mit Plankopf) …
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void import("@/lib/dxf").then(({ floorToDxf }) =>
                  download(new Blob([floorToDxf(floor)], { type: "application/dxf" }), `${base}.dxf`),
                );
              }}
            >
              DXF für CAD (mm)
            </MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem
              onClick={() => {
                close();
                void with3d(async () => {
                  const b = await screenshot3d(3840);
                  if (b) download(b, `${base}_3d_4k.png`);
                });
              }}
            >
              3D-Ansicht als Render (4K)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void with3d(async () => {
                  const b = await exportGlb();
                  if (b) download(b, `${base}.glb`);
                });
              }}
            >
              3D-Modell (GLB)
            </MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem
              onClick={() => {
                close();
                download(new Blob([areaCsv(floor)], { type: "text/csv;charset=utf-8" }), `${base}_flaechen.csv`);
              }}
            >
              Flächenliste (CSV)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                download(projectJson(project), `${safeName(project.name)}.rais.json`);
              }}
            >
              Projektdatei (.rais.json)
            </MenuItem>
          </>
        )}
      </Menu>
      {cloud && (
        <Button onClick={() => setShareOpen(true)} data-testid="share-button" title="Nur-Lese-Link für Kunden">
          <Share2 size={15} /> <span className="hidden lg:inline">Teilen</span>
        </Button>
      )}
      <PdfExportDialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        onExport={async (o) => {
          const { planPdf } = await import("@/lib/pdfExport");
          let err: unknown = null;
          await withPlan(async () => {
            try {
              download(await planPdf(project, floor, o), `${base}_plan.pdf`);
            } catch (e) {
              err = e;
            }
          });
          if (err) throw err;
        }}
      />
      {cloud && <ShareDialog projectId={project.id} open={shareOpen} onClose={() => setShareOpen(false)} />}
      <Button variant={chatOpen ? "primary" : "default"} onClick={onToggleChat} data-testid="chat-toggle">
        <Sparkles size={15} /> <span className="hidden lg:inline">KI-Assistent</span>
      </Button>
      <span className={clsx("w-20 text-right text-[11px]", saved ? "text-muted" : "text-accent")}>
        {saved ? "Gespeichert" : "Speichert …"}
      </span>
    </header>
  );
}
