"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import type { PdfOptions } from "@/lib/pdfExport";
import { Button, Dialog, Field, NumberInput, Select, TextInput } from "../ui";

const KEY = "rais.pdfOptions";

function loadOptions(): PdfOptions {
  const base: PdfOptions = { paper: "A3", orientation: "quer", scale: "fit", north: 0, company: "" };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return base;
  }
}

export function PdfExportDialog({
  open,
  onClose,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  onExport: (o: PdfOptions) => Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Maßstäblicher PDF-Plan">
      {open && <Form onClose={onClose} onExport={onExport} />}
    </Dialog>
  );
}

function Form({ onClose, onExport }: { onClose: () => void; onExport: (o: PdfOptions) => Promise<void> }) {
  const [o, setO] = useState<PdfOptions>(loadOptions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<PdfOptions>) => setO((x) => ({ ...x, ...patch }));

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(KEY, JSON.stringify(o));
      } catch {
        // storage full (large logo) or blocked: export anyway
      }
      await onExport(o);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Papier">
          <Select
            value={o.paper}
            onChange={(v) => set({ paper: v })}
            options={[
              { value: "A4", label: "A4" },
              { value: "A3", label: "A3" },
            ]}
          />
        </Field>
        <Field label="Ausrichtung">
          <Select
            value={o.orientation}
            onChange={(v) => set({ orientation: v })}
            options={[
              { value: "quer", label: "Quer" },
              { value: "hoch", label: "Hoch" },
            ]}
          />
        </Field>
        <Field label="Maßstab">
          <Select
            value={String(o.scale)}
            onChange={(v) => set({ scale: v === "fit" ? "fit" : Number(v) })}
            options={[
              { value: "fit", label: "Automatisch" },
              { value: "50", label: "1:50" },
              { value: "100", label: "1:100" },
              { value: "200", label: "1:200" },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <Field label="Firma im Plankopf">
          <TextInput
            value={o.company}
            placeholder="z. B. Ihr Firmenname"
            onChange={(e) => set({ company: e.target.value })}
          />
        </Field>
        <Field label="Nordpfeil">
          <NumberInput
            value={o.north}
            digits={0}
            step={5}
            min={-180}
            max={180}
            suffix="°"
            onCommit={(v) => set({ north: v })}
          />
        </Field>
      </div>
      <Field label="Logo (PNG oder JPG)">
        <div className="flex items-center gap-2">
          {o.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.logo} alt="Logo" className="h-8 max-w-32 rounded border border-line object-contain" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 500_000) return setError("Das Logo ist zu groß (maximal 500 KB).");
              const r = new FileReader();
              r.onload = () => set({ logo: r.result as string });
              r.readAsDataURL(f);
            }}
          />
          {o.logo && (
            <Button size="sm" variant="ghost" onClick={() => set({ logo: undefined })}>
              Entfernen
            </Button>
          )}
        </div>
      </Field>
      <p className="text-xs text-muted">
        Der Plan wird in exakter Größe gesetzt (300 dpi). Beim Drucken „Tatsächliche Größe“ bzw. 100 % wählen, dann
        stimmt der Maßstab. Plankopf mit Flächen nach WoFlV, Maßstabsleiste und Nordpfeil.
      </p>
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="primary" disabled={busy} onClick={() => void run()} data-testid="pdf-export">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} PDF erstellen
        </Button>
      </div>
    </div>
  );
}
