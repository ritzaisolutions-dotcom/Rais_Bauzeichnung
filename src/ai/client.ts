"use client";

const KEY_STORAGE = "rais.anthropicKey";

/** Optional customer API key, kept only in this browser. */
export function getUserApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setUserApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // storage unavailable: the server key is used instead
  }
}

export async function aiFetch<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const key = getUserApiKey();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-anthropic-key": key } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({ error: `Fehler ${res.status}` }));
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data as T;
}
