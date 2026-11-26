"use client";

import { LayoutGrid, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

export function LoginForm({ next, locked }: { next: string; locked: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.assign(next);
      return;
    }
    const data = await res?.json().catch(() => null);
    setError(data?.error ?? "Anmeldung fehlgeschlagen.");
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
            <LayoutGrid size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Rais Bauzeichnung</h1>
            <p className="text-xs text-muted">Grundriss-Editor</p>
          </div>
        </div>
        {locked ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Der Zugang ist noch nicht eingerichtet. Bitte in der Server-Konfiguration ein Passwort hinterlegen
            (APP_PASSWORD).
          </p>
        ) : (
          <>
            <label className="block text-sm font-medium" htmlFor="password">
              Passwort
            </label>
            <div className="relative mt-1">
              <Lock size={15} className="absolute left-2.5 top-2.5 text-muted" />
              <input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-md border border-line bg-panel pl-8 pr-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                data-testid="login-password"
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              className="mt-4 w-full"
              disabled={busy || !password}
              data-testid="login-submit"
            >
              {busy && <Loader2 size={15} className="animate-spin" />} Anmelden
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
