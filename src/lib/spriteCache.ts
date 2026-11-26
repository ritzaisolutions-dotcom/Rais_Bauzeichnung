"use client";

// Persistent cache for rendered furniture top views (data URLs) in a small IndexedDB
// database of its own. Without IndexedDB (private windows, blocked storage) every
// call quietly does nothing and the sprites are simply rendered again.

const DB = "rais-sprites";
const STORE = "sprites";

interface Entry {
  url: string;
  /** Last use, for pruning. */
  t: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function getSprite(key: string): Promise<string | undefined> {
  const e = await run<Entry>("readonly", (s) => s.get(key));
  if (!e) return undefined;
  // remember the use without waiting for it
  void run("readwrite", (s) => s.put({ url: e.url, t: Date.now() }, key));
  return e.url;
}

export function putSprite(key: string, url: string) {
  return run("readwrite", (s) => s.put({ url, t: Date.now() } satisfies Entry, key));
}

/** Keeps the max most recently used entries. */
export async function pruneSprites(max = 600) {
  const db = await open();
  if (!db) return 0;
  return new Promise<number>((resolve) => {
    try {
      const store = db.transaction(STORE, "readwrite").objectStore(STORE);
      const all: { key: IDBValidKey; t: number }[] = [];
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) {
          all.push({ key: c.key, t: (c.value as Entry).t });
          c.continue();
          return;
        }
        const old = all.sort((a, b) => b.t - a.t).slice(max);
        for (const o of old) store.delete(o.key);
        resolve(old.length);
      };
      cur.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}
