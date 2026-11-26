"use client";

import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { useEffect, useState } from "react";
import { shareLink } from "@/lib/storage";
import { Button, Dialog } from "../ui";

/** Read-only link for customers: 2D presentation, 3D view and area list, no editing. */
export function ShareDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    shareLink(projectId, "get")
      .then((u) => !cancelled && setUrl(u))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const run = async (action: "create" | "revoke") => {
    setBusy(true);
    setError(null);
    try {
      setUrl(await shareLink(projectId, action));
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Projekt teilen">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Mit dem Link sehen Ihre Kunden den eingerichteten Grundriss, die 3D-Ansicht und die Flächenliste. Ein Passwort
          brauchen sie nicht, bearbeiten können sie nichts. Änderungen am Projekt erscheinen sofort.
        </p>
        {error && <p className="rounded-md bg-red-50 p-2 text-red-700">{error}</p>}
        {url ? (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-xs"
                data-testid="share-url"
              />
              <Button
                variant="primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Kopiert" : "Kopieren"}
              </Button>
            </div>
            <div className="flex justify-between gap-2">
              <Button
                disabled={busy}
                onClick={() => void run("revoke")}
                title="Der bisherige Link funktioniert danach nicht mehr"
              >
                <Link2Off size={15} /> Link deaktivieren
              </Button>
              <Button onClick={onClose}>Schließen</Button>
            </div>
          </>
        ) : (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" disabled={busy} onClick={() => void run("create")} data-testid="share-create">
              <Link2 size={15} /> Link erstellen
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
