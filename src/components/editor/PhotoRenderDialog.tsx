"use client";

import { Camera, Save, X } from "lucide-react";
import { useRef, useState } from "react";
import { download, screenshot3d } from "@/lib/exports";
import { registry } from "@/lib/registry";
import { Button, Dialog, Field, Select } from "../ui";

const SIZES = {
  klein: { label: "Vorschau (1280 px)", width: 1280 },
  fullhd: { label: "Full HD (1920 px)", width: 1920 },
  uhd: { label: "4K (3840 px)", width: 3840 },
} as const;
const QUALITY = {
  entwurf: { label: "Entwurf (32 Durchgänge)", samples: 32 },
  gut: { label: "Gut (256 Durchgänge)", samples: 256 },
  sehrgut: { label: "Sehr gut (1000 Durchgänge)", samples: 1000 },
} as const;

type Status =
  | { kind: "idle" }
  | { kind: "prepare" }
  | { kind: "render"; samples: number; etaS: number }
  | { kind: "error"; message: string };

const fmtEta = (s: number) =>
  !isFinite(s) ? "wird geschätzt …" : s < 60 ? `noch ca. ${Math.ceil(s)} s` : `noch ca. ${Math.ceil(s / 60)} min`;

export function PhotoRenderDialog({
  open,
  onClose,
  fileBase,
}: {
  open: boolean;
  onClose: () => void;
  fileBase: string;
}) {
  const [size, setSize] = useState<keyof typeof SIZES>("fullhd");
  const [quality, setQuality] = useState<keyof typeof QUALITY>("gut");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const discard = useRef(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const busy = status.kind === "prepare" || status.kind === "render";

  const start = async () => {
    const input = registry.pathScene?.();
    const view = registry.glCanvas;
    if (!input || !view) {
      setStatus({ kind: "error", message: "Bitte zuerst die 3D-Ansicht öffnen." });
      return;
    }
    const width = SIZES[size].width;
    const height = Math.round((width * view.clientHeight) / Math.max(1, view.clientWidth));
    abort.current = new AbortController();
    discard.current = false;
    setStatus({ kind: "prepare" });
    try {
      const { renderPhoto, PathTraceUnsupported } = await import("@/lib/pathTrace");
      try {
        const blob = await renderPhoto(input, {
          width,
          height,
          samples: QUALITY[quality].samples,
          signal: abort.current.signal,
          onProgress: (p) => {
            if (p.phase === "prepare") return setStatus({ kind: "prepare" });
            setStatus({ kind: "render", samples: p.samples, etaS: p.etaS });
            const c = preview.current;
            if (c && p.preview) {
              c.width = 480;
              c.height = Math.round((480 * p.preview.height) / p.preview.width);
              c.getContext("2d")?.drawImage(p.preview, 0, 0, c.width, c.height);
            }
          },
        });
        if (!discard.current) download(blob, `${fileBase}_foto_${width}.png`);
        setStatus({ kind: "idle" });
        if (!discard.current) onClose();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return setStatus({ kind: "idle" });
        if (!(e instanceof PathTraceUnsupported)) throw e;
        // fallback: the normal high-resolution render
        const b = await screenshot3d(width);
        if (b) download(b, `${fileBase}_3d_${width}.png`);
        setStatus({
          kind: "error",
          message: `Pathtracing wird hier nicht unterstützt (${e.message}). Stattdessen wurde das normale ${width}-px-Bild gespeichert.`,
        });
      }
    } catch (e) {
      console.error(e);
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Das Bild konnte nicht berechnet werden." });
    }
  };

  const target = QUALITY[quality].samples;
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (busy) {
          discard.current = true;
          abort.current?.abort();
        }
        onClose();
      }}
      title="Fotorealistisches Bild"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Berechnet die aktuelle 3D-Ansicht mit echtem Licht, Reflexionen und Glas. Richten Sie die Kamera vorher in der
          3D-Ansicht aus; Tageszeit und Leuchten werden übernommen. Je nach Rechner dauert das von einer bis zu mehreren
          Minuten.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Auflösung">
            <Select
              value={size}
              onChange={setSize}
              options={Object.entries(SIZES).map(([value, s]) => ({
                value: value as keyof typeof SIZES,
                label: s.label,
              }))}
            />
          </Field>
          <Field label="Qualität">
            <Select
              value={quality}
              onChange={setQuality}
              options={Object.entries(QUALITY).map(([value, q]) => ({
                value: value as keyof typeof QUALITY,
                label: q.label,
              }))}
            />
          </Field>
        </div>
        {busy && (
          <div className="space-y-2" data-testid="photo-progress">
            <canvas ref={preview} className="w-full rounded-md border border-line bg-paper" />
            <div className="h-2 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${status.kind === "render" ? Math.min(100, (status.samples / target) * 100) : 2}%` }}
              />
            </div>
            <div className="text-xs text-muted">
              {status.kind === "prepare"
                ? "Szene wird vorbereitet …"
                : `${Math.floor(status.samples)} von ${target} Durchgängen, ${fmtEta(status.etaS)}`}
            </div>
          </div>
        )}
        {status.kind === "error" && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">{status.message}</p>
        )}
        <div className="flex justify-end gap-2">
          {busy ? (
            <>
              <Button
                onClick={() => {
                  discard.current = true;
                  abort.current?.abort();
                }}
              >
                <X size={15} /> Abbrechen
              </Button>
              <Button
                variant="primary"
                disabled={status.kind !== "render" || status.samples < 1}
                onClick={() => abort.current?.abort()}
                title="Den aktuellen Stand als Bild speichern"
              >
                <Save size={15} /> Jetzt speichern
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Schließen</Button>
              <Button variant="primary" onClick={() => void start()} data-testid="photo-start">
                <Camera size={15} /> Bild berechnen
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
