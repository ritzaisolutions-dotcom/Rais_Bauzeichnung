"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { errorText, reportError } from "@/lib/clientLog";

/** Shown by error.tsx / global-error.tsx. Projects are saved automatically, so retrying is safe. */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
    reportError({ kind: "boundary", ...errorText(error), digest });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6" data-testid="error-screen">
      <div className="max-w-md rounded-xl border border-line bg-panel p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Da ist etwas schiefgelaufen</h1>
        <p className="mt-2 text-sm text-muted">
          Ihre Projekte werden laufend gespeichert; die letzte Änderung ist in der Regel erhalten. Versuchen Sie es
          erneut oder öffnen Sie die Projektübersicht. Der Fehler wurde protokolliert.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white"
          >
            <RotateCcw size={15} /> Erneut versuchen
          </button>
          {/* full reload on purpose: after an error the client state should start fresh */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-medium">
            Zur Projektübersicht
          </a>
        </div>
      </div>
    </div>
  );
}
