"use client";

import { FileUp, Loader2, PenLine, Sparkles } from "lucide-react";
import { useState } from "react";
import { applyRecognisedPlan, applyUnderlayLabels } from "@/ai/applyPlan";
import { aiFetch } from "@/ai/client";
import type { RecognisedPlan } from "@/ai/planSchema";
import { loadPlanFile, underlayForAi, type LoadedPlan } from "@/lib/planImport";
import { registry } from "@/lib/registry";
import { emptyFloor, normalizeFloor } from "@/model/ops";
import type { Underlay } from "@/model/types";
import { useEditor } from "@/store/editor";
import { Button, Dialog, Field, NumberInput, Select } from "../ui";

const PT_PER_MM = 72 / 25.4;

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);
  const [plan, setPlan] = useState<LoadedPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratio, setRatio] = useState<string>("auto");
  const [target, setTarget] = useState<"current" | "new">("current");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPlan(null);
    setError(null);
    setAiNote(null);
    setRatio("auto");
    setPage(1);
  };

  const load = async (f: File, p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadPlanFile(f, p);
      setPlan(res);
      setRatio(res.scaleRatio ? "auto" : "kalibrieren");
    } catch (e) {
      console.error(e);
      setError("Die Datei konnte nicht gelesen werden. Unterstützt werden PDF, PNG und JPG.");
    } finally {
      setLoading(false);
    }
  };

  /** Render scale of the page in px per PDF point (needed for manual ratios). */
  const pxPerMeterFor = (pl: LoadedPlan): number | null => {
    if (ratio === "auto") return pl.pxPerMeter ?? null;
    if (ratio === "kalibrieren") return null;
    const r = Number(ratio);
    if (pl.pxPerMeter && pl.scaleRatio) {
      // derive the page scale from the detected ratio
      const pxPerPt = pl.pxPerMeter / ((1000 / pl.scaleRatio) * PT_PER_MM);
      return (1000 / r) * PT_PER_MM * pxPerPt;
    }
    // PDF without scale text: assume the page was rendered to TARGET width; fall back to calibration
    return null;
  };

  const placeUnderlay = (pl: LoadedPlan): Underlay => {
    const ppm = pxPerMeterFor(pl) ?? 100;
    return {
      dataUrl: pl.dataUrl,
      pxPerMeter: ppm,
      x: 0,
      y: 0,
      opacity: 0.55,
      widthPx: pl.widthPx,
      heightPx: pl.heightPx,
      visible: true,
      labels: pl.labels.map((l) => ({ name: l.name, area: l.area, x: l.px / ppm, y: l.py / ppm })),
    };
  };

  const commitUnderlay = (pl: LoadedPlan) => {
    const u = placeUnderlay(pl);
    const st = useEditor.getState();
    if (target === "new") {
      const f = emptyFloor(file?.name.replace(/\.[a-z]+$/i, "") || "Neue Etage");
      f.underlay = u;
      st.mutateProject((p) => {
        p.floors.push(f);
      });
      st.setFloor(f.id);
    } else {
      st.mutate(
        (f) => {
          f.underlay = u;
        },
        { normalize: false },
      );
    }
    return u;
  };

  const trace = () => {
    if (!plan) return;
    commitUnderlay(plan);
    const needsCalibration = !pxPerMeterFor(plan);
    useEditor.getState().setTool(needsCalibration ? "calibrate" : "wall");
    useEditor.getState().setView("2d");
    setTimeout(() => registry.fit?.(), 50);
    onClose();
    reset();
  };

  const recognise = async () => {
    if (!plan) return;
    setAiBusy(true);
    setError(null);
    setAiNote(null);
    try {
      const u = commitUnderlay(plan);
      const img = await underlayForAi(plan.dataUrl);
      const res = await aiFetch<{ plan: RecognisedPlan }>("/api/ai/import", {
        image: img.base64,
        width: img.width,
        height: img.height,
        pxPerMeter: pxPerMeterFor(plan) ? u.pxPerMeter * img.factor : undefined,
        textItems: plan.textItems.map((t) => ({
          str: t.str.slice(0, 200),
          px: t.px * img.factor,
          py: t.py * img.factor,
        })),
      });
      const st = useEditor.getState();
      st.mutate((f) => {
        f.nodes = [];
        f.walls = [];
        f.openings = [];
        f.rooms = [];
        applyRecognisedPlan(f, res.plan, f.underlay ?? u, 1 / img.factor);
        normalizeFloor(f);
        applyUnderlayLabels(f);
      });
      st.setView("2d");
      st.setTool("select");
      setTimeout(() => registry.fit?.(), 50);
      st.showToast(
        `KI-Erkennung abgeschlossen: ${res.plan.walls.length} Wände, ${res.plan.openings.length} Öffnungen, ${res.plan.rooms.length} Räume. ${res.plan.notes}`.trim(),
      );
      onClose();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die KI-Erkennung ist fehlgeschlagen.");
    } finally {
      setAiBusy(false);
    }
  };

  const scaleOptions = [
    ...(plan?.scaleRatio ? [{ value: "auto", label: `Aus dem Plan: 1:${plan.scaleRatio}` }] : []),
    { value: "kalibrieren", label: "Nach dem Import kalibrieren" },
    ...(plan?.scaleRatio ? ["50", "100", "200"].map((v) => ({ value: v, label: `1:${v}` })) : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Bauzeichnung importieren"
      wide
    >
      {!plan ? (
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line bg-paper px-6 py-14 text-center hover:border-accent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) {
              setFile(f);
              void load(f);
            }
          }}
        >
          {loading ? (
            <Loader2 className="animate-spin text-accent" size={32} />
          ) : (
            <FileUp className="text-accent" size={32} />
          )}
          <div>
            <div className="font-semibold">PDF, PNG oder JPG hierher ziehen oder auswählen</div>
            <div className="mt-1 text-sm text-muted">
              Bei Architekten-PDFs werden Maßstab (z. B. 1:100), Raumnamen und Flächen automatisch gelesen.
            </div>
          </div>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                void load(f);
              }
            }}
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
        </label>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={plan.dataUrl} alt="Vorschau der Bauzeichnung" className="max-h-[60vh] w-full object-contain" />
          </div>
          <div className="space-y-4">
            <div className="rounded-lg bg-paper p-3 text-sm">
              <div className="font-medium">{file?.name}</div>
              <div className="text-muted">
                {plan.widthPx} × {plan.heightPx} px
                {plan.pageCount > 1 && ` · Seite ${page} von ${plan.pageCount}`}
              </div>
              <div className="mt-2">
                {plan.scaleRatio ? `Maßstab erkannt: 1:${plan.scaleRatio}` : "Kein Maßstab im Plan gefunden."}
              </div>
              <div>
                {plan.labels.length
                  ? `${plan.labels.length} Raumbeschriftungen gefunden`
                  : "Keine Raumbeschriftungen im Textlayer."}
              </div>
              {plan.labels.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {plan.labels.slice(0, 14).map((l, i) => (
                    <span key={i} className="rounded bg-panel px-1.5 py-0.5 text-[11px]">
                      {l.name} {l.area ? `${l.area.toLocaleString("de-DE")} m²` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {plan.pageCount > 1 && (
              <Field label="Seite">
                <NumberInput
                  value={page}
                  digits={0}
                  step={1}
                  min={1}
                  max={plan.pageCount}
                  onCommit={(v) => {
                    setPage(v);
                    if (file) void load(file, v);
                  }}
                />
              </Field>
            )}
            <Field label="Maßstab">
              <Select value={ratio} onChange={setRatio} options={scaleOptions} />
            </Field>
            <Field label="Ziel">
              <Select
                value={target}
                onChange={setTarget}
                options={[
                  { value: "current", label: "Aktuelle Etage (Unterlage ersetzen)" },
                  { value: "new", label: "Als neue Etage anlegen" },
                ]}
              />
            </Field>
            {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            {aiNote && <p className="rounded-md bg-green-50 p-2 text-sm text-green-800">{aiNote}</p>}
            <div className="space-y-2">
              <Button variant="primary" className="w-full" onClick={() => void recognise()} disabled={aiBusy}>
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {aiBusy ? "KI erkennt Wände, Türen und Räume …" : "Mit KI automatisch erkennen"}
              </Button>
              <Button className="w-full" onClick={trace} disabled={aiBusy}>
                <PenLine size={16} /> Als Unterlage übernehmen und nachzeichnen
              </Button>
              <p className="text-xs text-muted">
                Die KI erstellt einen bearbeitbaren Entwurf (ersetzt die Wände der Ziel-Etage). Prüfen Sie Maße und
                Flächen danach; jede Änderung lässt sich mit Strg+Z zurücknehmen.
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                Andere Datei wählen
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
