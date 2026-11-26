"use client";

import type { ClientError } from "./logSchema";

const sent = new Set<string>();
let count = 0;
const MAX_PER_PAGE = 10;

/** Sends a client error to /api/log once per message, at most 10 per page view. */
export function reportError(e: ClientError) {
  const key = `${e.kind}:${e.message}`;
  if (sent.has(key) || count >= MAX_PER_PAGE) return;
  sent.add(key);
  count++;
  try {
    void fetch("/api/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...e, url: e.url ?? window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // logging must never break the app
  }
}

export function errorText(err: unknown) {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  return { message: typeof err === "string" ? err : JSON.stringify(err ?? "Unbekannter Fehler").slice(0, 500) };
}
