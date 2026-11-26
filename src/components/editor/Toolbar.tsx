"use client";

import {
  CircleHelp,
  DoorOpen,
  Eye,
  EyeOff,
  Grid3x3,
  Hand,
  Layers,
  MousePointer2,
  PanelTop,
  Ruler,
  RulerDimensionLine,
  Square,
  SquareDashed,
  Type,
  Columns2,
  Scaling,
  Sofa,
} from "lucide-react";
import { useState } from "react";
import { DEFAULT_WALL } from "@/model/ops";
import { useActiveFloor, useEditor, type Layers as LayerState, type Tool } from "@/store/editor";
import { IconButton, NumberInput } from "../ui";

const TOOLS: { id: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Auswählen und verschieben", key: "V", icon: <MousePointer2 size={18} /> },
  { id: "pan", label: "Ansicht verschieben", key: "H", icon: <Hand size={18} /> },
  { id: "wall", label: "Wand zeichnen", key: "W", icon: <PanelTop size={18} /> },
  { id: "room", label: "Raum (Rechteck)", key: "Q", icon: <Square size={18} /> },
  { id: "door", label: "Tür", key: "T", icon: <DoorOpen size={18} /> },
  { id: "window", label: "Fenster", key: "F", icon: <Columns2 size={18} /> },
  { id: "slidingdoor", label: "Schiebetür", key: "", icon: <SquareDashed size={18} /> },
  { id: "passage", label: "Durchgang", key: "", icon: <Scaling size={18} /> },
  { id: "dimension", label: "Maßkette", key: "M", icon: <RulerDimensionLine size={18} /> },
  { id: "text", label: "Text", key: "X", icon: <Type size={18} /> },
];

const WALL_TYPES = [
  { id: "aussen" as const, label: "Außenwand" },
  { id: "tragend" as const, label: "Tragend" },
  { id: "innen" as const, label: "Innenwand" },
];

const LAYERS: { id: keyof LayerState; label: string }[] = [
  { id: "underlay", label: "Bauzeichnung" },
  { id: "furniture", label: "Möbel" },
  { id: "dimensions", label: "Maße" },
  { id: "roomLabels", label: "Raumnamen" },
  { id: "grid", label: "Raster" },
  { id: "snapUnderlay", label: "An Zeichnung fangen" },
];

export function Toolbar({
  libraryOpen,
  onToggleLibrary,
  onHelp,
}: {
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onHelp?: () => void;
}) {
  const tool = useEditor((s) => s.tool);
  const layers = useEditor((s) => s.layers);
  const wallType = useEditor((s) => s.wallType);
  const wallThickness = useEditor((s) => s.wallThickness);
  const floor = useActiveFloor();
  const [layersOpen, setLayersOpen] = useState(false);
  const st = useEditor.getState();

  return (
    <div className="relative flex h-full w-12 flex-col items-center gap-1 border-r border-line bg-panel py-2">
      {TOOLS.map((t) => (
        <IconButton
          key={t.id}
          label={`${t.label}${t.key ? ` (${t.key})` : ""}`}
          active={tool === t.id}
          onClick={() => st.setTool(t.id)}
          data-testid={`tool-${t.id}`}
        >
          {t.icon}
        </IconButton>
      ))}
      {floor?.underlay && (
        <IconButton
          label="Maßstab kalibrieren: zwei Punkte mit bekanntem Abstand anklicken"
          active={tool === "calibrate"}
          onClick={() => st.setTool("calibrate")}
        >
          <Ruler size={18} />
        </IconButton>
      )}
      <div className="my-1 h-px w-8 bg-line" />
      <IconButton label="Möbelbibliothek" active={libraryOpen} onClick={onToggleLibrary}>
        <Sofa size={18} />
      </IconButton>
      <IconButton label="Ebenen" active={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
        <Layers size={18} />
      </IconButton>
      {onHelp && (
        <IconButton label="Hilfe und Tastenkürzel (?)" onClick={onHelp}>
          <CircleHelp size={18} />
        </IconButton>
      )}

      {(tool === "wall" || tool === "room") && (
        <div className="absolute left-14 top-2 z-20 w-56 space-y-2 rounded-lg border border-line bg-panel p-3 shadow-lg">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Wandart</div>
          <div className="flex flex-wrap gap-1">
            {WALL_TYPES.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => st.setWallType(w.id, DEFAULT_WALL[w.id])}
                className={`rounded-md px-2 py-1 text-xs ${wallType === w.id ? "bg-ink text-white" : "bg-paper hover:bg-line"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <label className="block text-xs text-muted">
            Dicke
            <NumberInput
              value={wallThickness}
              digits={3}
              step={0.005}
              suffix="m"
              min={0.03}
              max={1}
              onCommit={(v) => st.setWallType(wallType, v)}
            />
          </label>
        </div>
      )}

      {layersOpen && (
        <div className="absolute bottom-2 left-14 z-20 w-48 space-y-1 rounded-lg border border-line bg-panel p-2 shadow-lg">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => st.toggleLayer(l.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-paper"
            >
              {l.label}
              {layers[l.id] ? <Eye size={14} /> : <EyeOff size={14} className="text-muted" />}
            </button>
          ))}
          {floor?.underlay && (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
              onClick={() => {
                if (window.confirm("Bauzeichnung (Unterlage) von dieser Etage entfernen?"))
                  st.mutate(
                    (f) => {
                      f.underlay = undefined;
                    },
                    { normalize: false },
                  );
              }}
            >
              Unterlage entfernen <Grid3x3 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
