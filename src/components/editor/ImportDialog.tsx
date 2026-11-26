"use client";

import clsx from "clsx";
import { Check, Crop as CropIcon, FileUp, Loader2, PenLine, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { aiFetch } from "@/ai/client";
import { buildPreview, commitRecognised, textForAi, type Crop, type ImportPreview } from "@/ai/importPreview";
import type { RecognisedPlan } from "@/ai/planSchema";
import { loadPlanFile, underlayForAi, type LoadedPlan } from "@/lib/planImport";
import { registry } from "@/lib/registry";
import { formatM } from "@/model/geometry";
import { emptyFloor } from "@/model/ops";
import type { Underlay, Vec2 } from "@/model/types";
import { useActiveFloor, useEditor } from "@/store/editor";
import { Button, Dialog, Field, NumberInput, Select } from "../ui";
import { PlanPreview } from "./PlanPreview";

interface Recognition {
  plan: RecognisedPlan;
  preview: ImportPreview;
  underlay: Underlay;
  k: number;
  offset: Vec2;
}

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
  const [crop, setCrop] = useState<Crop | null>(null);
  const [result, setResult] = useState<Recognition | null>(null);
  const activeFloor = useActiveFloor();

  const reset = () => {
    setFile(null);
    setPlan(null);
    setError(null);
    setCrop(null);
    setResult(null);
    setRatio("auto");
    setPage(1);
  };

  const load = async (f: File, p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadPlanFile(f, p);
      setPlan(res);
      setCrop(null);
      setResult(null);
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

  const close = () => {
    onClose();
    reset();
  };

  const trace = () => {
    if (!plan) return;
    commitUnderlay(plan);
    const needsCalibration = !pxPerMeterFor(plan);
    useEditor.getState().setTool(needsCalibration ? "calibrate" : "wall");
    useEditor.getState().setView("2d");
    setTimeout(() => registry.fit?.(), 50);
    close();
  };

  /** Sends the drawing (or the selected crop) to the AI and shows the result as a preview. */
  const recognise = async () => {
    if (!plan) return;
    setAiBusy(true);
    setError(null);
    setResult(null);
    try {
      const u = placeUnderlay(plan);
      const img = await underlayForAi(plan.dataUrl, crop ?? undefined);
      const res = await aiFetch<{ plan: RecognisedPlan }>("/api/ai/import", {
        image: img.base64,
        width: img.width,
        height: img.height,
        pxPerMeter: pxPerMeterFor(plan) ? u.pxPerMeter * img.factor : undefined,
        textItems: textForAi(plan.textItems, crop, img.factor),
      });
      const k = 1 / img.factor;
      const offset = { x: crop?.x ?? 0, y: crop?.y ?? 0 };
      const preview = buildPreview(res.plan, u, k, offset, activeFloor?.height ?? 2.6);
      if (!preview.walls) throw new Error("Die KI hat keine Wände erkannt. Wählen Sie einen engeren Ausschnitt.");
      setResult({ plan: res.plan, preview, underlay: u, k, offset });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Die KI-Erkennung ist fehlgeschlagen.");
    } finally {
      setAiBusy(false);
    }
  };

  /** Takes over the previewed result as one undo step (plus the floor creation, if any). */
  const accept = (mode: "replace" | "add") => {
    if (!plan || !result) return;
    const st = useEditor.getState();
    const { plan: rp, k, offset } = result;
    if (target === "new") {
      const f = emptyFloor(file?.name.replace(/\.[a-z]+$/i, "") || "Neue Etage");
      f.height = activeFloor?.height ?? f.height;
      f.underlay = result.underlay;
      st.mutateProject((p) => {
        p.floors.push(f);
      });
      st.setFloor(f.id);
      st.mutate((fl) => commitRecognised(fl, rp, result.underlay, k, offset, "replace"));
    } else {
      st.mutate((fl) => {
        // adding to a floor that already uses this drawing keeps its calibration and position
        const old = fl.underlay;
        const same = mode === "add" && old && old.widthPx === plan.widthPx && old.heightPx === plan.heightPx;
        const u = same ? old : result.underlay;
        fl.underlay = u;
        commitRecognised(fl, rp, u, k, offset, mode);
      });
    }
    st.setView("2d");
    st.setTool("select");
    setTimeout(() => registry.fit?.(), 50);
    const { walls, openings, rooms } = result.preview;
    st.showToast(
      `KI-Ergebnis übernommen: ${walls} Wände, ${openings} Öffnungen, ${rooms.length} Räume. Bitte Maße prüfen.`,
    );
    close();
  };

  const scaleOptions = [
    ...(plan?.scaleRatio ? [{ value: "auto", label: `Aus dem Plan: 1:${plan.scaleRatio}` }] : []),
    { value: "kalibrieren", label: "Nach dem Import kalibrieren" },
    ...(plan?.scaleRatio ? ["50", "100", "200"].map((v) => ({ value: v, label: `1:${v}` })) : []),
  ];

  return (
    <Dialog open={open} onClose={close} title="Bauzeichnung importieren" wide>
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
          <div>
            <div className="flex max-h-[64vh] justify-center overflow-hidden rounded-lg border border-line bg-white">
              <div className="w-full" style={{ maxWidth: `calc(64vh * ${plan.widthPx / plan.heightPx})` }}>
                <PlanPreview
                  src={plan.dataUrl}
                  width={plan.widthPx}
                  height={plan.heightPx}
                  crop={crop}
                  onCrop={result || aiBusy ? undefined : setCrop}
                  result={result?.preview.floor}
                />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <CropIcon size={14} />
              {result ? (
                <span>
                  <span className="font-medium text-red-600">Rot</span> Außen- und tragende Wände,{" "}
                  <span className="font-medium text-blue-600">blau</span> Innenwände,{" "}
                  <span className="font-medium text-green-600">grün</span> Türen,{" "}
                  <span className="font-medium text-sky-600">hellblau</span> Fenster.
                </span>
              ) : crop ? (
                <>
                  <span>Ausschnitt gewählt: nur dieser Bereich geht an die KI (schärfere Erkennung).</span>
                  <button type="button" className="underline" onClick={() => setCrop(null)}>
                    Ganze Seite
                  </button>
                </>
              ) : (
                <span>Tipp: Ziehen Sie ein Rechteck um die Wohnung, damit die KI nur diesen Bereich erkennt.</span>
              )}
            </div>
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
            {result ? (
              <div className="space-y-3" data-testid="ai-result">
                <div className="rounded-lg border border-line p-3 text-sm">
                  <div className="font-medium">
                    Erkannt: {result.preview.walls} Wände, {result.preview.openings} Öffnungen,{" "}
                    {result.preview.rooms.length} Räume
                  </div>
                  {result.preview.rooms.length > 0 && (
                    <table className="mt-2 w-full text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="text-left font-normal">Raum</th>
                          <th className="text-right font-normal">berechnet</th>
                          <th className="text-right font-normal">laut Plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.preview.rooms.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name}</td>
                            <td className="text-right tabular-nums">{formatM(r.area)} m²</td>
                            <td
                              className={clsx(
                                "text-right tabular-nums",
                                r.deviation !== undefined &&
                                  (Math.abs(r.deviation) > 0.05 ? "text-red-700" : "text-green-700"),
                              )}
                            >
                              {r.target ? `${formatM(r.target)} m²` : "–"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {result.plan.notes && <p className="mt-2 text-xs text-muted">{result.plan.notes}</p>}
                </div>
                <Button variant="primary" className="w-full" onClick={() => accept("replace")} data-testid="ai-accept">
                  <Check size={16} />
                  {target === "new" ? "Als neue Etage übernehmen" : "Übernehmen (ersetzt die Wände der Etage)"}
                </Button>
                {target === "current" && (activeFloor?.walls.length ?? 0) > 0 && (
                  <Button className="w-full" onClick={() => accept("add")}>
                    <Plus size={16} /> Zu den bestehenden Wänden hinzufügen
                  </Button>
                )}
                <Button className="w-full" onClick={() => setResult(null)}>
                  <X size={16} /> Verwerfen
                </Button>
                <p className="text-xs text-muted">Jede Übernahme lässt sich mit Strg+Z zurücknehmen.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Button variant="primary" className="w-full" onClick={() => void recognise()} disabled={aiBusy}>
                  {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {aiBusy
                    ? "KI erkennt Wände, Türen und Räume …"
                    : crop
                      ? "Ausschnitt mit KI erkennen"
                      : "Mit KI automatisch erkennen"}
                </Button>
                <Button className="w-full" onClick={trace} disabled={aiBusy}>
                  <PenLine size={16} /> Als Unterlage übernehmen und nachzeichnen
                </Button>
                <p className="text-xs text-muted">
                  Das Ergebnis erscheint erst als Vorschau; Sie entscheiden dann, ob es übernommen wird. Für die
                  Erkennung wird das Bild an Anthropic (Claude) übermittelt.
                </p>
                <Button variant="ghost" size="sm" onClick={reset}>
                  Andere Datei wählen
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
