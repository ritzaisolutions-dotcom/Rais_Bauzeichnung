"use client";

// Project storage: Supabase via the app's API when the server has it configured,
// otherwise IndexedDB in this browser. Large images travel separately as assets.
import type { Project } from "@/model/types";
import * as local from "./db";

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail?: string | null;
  floors: number;
  updatedAt: number;
  createdAt: number;
}

let cloudFlag: boolean | null = null;
const lastSaved = new Map<string, number>();
const uploaded = new Map<string, string>(); // assetId -> fingerprint

const fingerprint = (s: string) => `${s.length}:${s.slice(64, 96)}:${s.slice(-48)}`;
const assetId = (projectId: string, floorId: string) => `${projectId}-underlay-${floorId}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Fehler ${res.status}`), { status: res.status });
  return data as T;
}

export async function isCloud() {
  if (cloudFlag === null) await listProjects();
  return !!cloudFlag;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await api<{
      cloud: boolean;
      projects: { id: string; name: string; thumbnail: string | null; floors: number; created_at: string; updated_at: string }[];
    }>("/api/projects");
    cloudFlag = res.cloud;
    if (res.cloud) {
      return res.projects.map((p) => ({
        id: p.id,
        name: p.name,
        thumbnail: p.thumbnail,
        floors: p.floors,
        createdAt: Date.parse(p.created_at),
        updatedAt: Date.parse(p.updated_at),
      }));
    }
  } catch (e) {
    // a configured cloud that fails must not silently fall back to local data
    if (cloudFlag) throw e;
    cloudFlag = false;
  }
  return (await local.listProjects()).map((r) => ({
    id: r.id,
    name: r.name,
    thumbnail: r.thumbnail,
    floors: r.data.floors.length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function loadProject(id: string): Promise<Project | null> {
  if (await isCloud()) {
    try {
      const { project } = await api<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`);
      lastSaved.set(id, project.updatedAt);
      for (const f of project.floors) {
        if (f.underlay?.dataUrl.startsWith("data:")) uploaded.set(assetId(id, f.id), fingerprint(f.underlay.dataUrl));
      }
      return project;
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  return local.loadProject(id);
}

export async function saveProject(p: Project) {
  if (!(await isCloud())) return local.saveProject(p);
  // upload changed drawings separately; the project itself only keeps references to them
  const uploads: { id: string; fp: string; data: string }[] = [];
  const floors = p.floors.map((f) => {
    const u = f.underlay;
    if (!u?.dataUrl.startsWith("data:")) return f;
    const id = assetId(p.id, f.id);
    const fp = fingerprint(u.dataUrl);
    if (uploaded.get(id) !== fp) uploads.push({ id, fp, data: u.dataUrl });
    return { ...f, underlay: { ...u, dataUrl: `asset:${id}` } };
  });
  await api(`/api/projects/${encodeURIComponent(p.id)}`, {
    method: "PUT",
    body: JSON.stringify({ project: { ...p, floors }, baseUpdatedAt: lastSaved.get(p.id) }),
  });
  lastSaved.set(p.id, p.updatedAt);
  for (const up of uploads) {
    await api(`/api/projects/${encodeURIComponent(p.id)}/assets/${encodeURIComponent(up.id)}`, {
      method: "PUT",
      body: JSON.stringify({ kind: "underlay", data: up.data }),
    });
    uploaded.set(up.id, up.fp);
  }
}

export async function deleteProject(id: string) {
  if (await isCloud()) {
    await api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  await local.deleteProject(id);
}

/** Projects that only exist in this browser (from before the cloud was set up). */
export async function localOnlyProjects() {
  if (!(await isCloud())) return [];
  const cloud = new Set((await listProjects()).map((p) => p.id));
  return (await local.listProjects()).filter((r) => !cloud.has(r.id));
}

export async function migrateToCloud(onProgress?: (done: number, total: number) => void) {
  const rows = await localOnlyProjects();
  let done = 0;
  for (const r of rows) {
    await saveProject(r.data);
    onProgress?.(++done, rows.length);
  }
  return done;
}

export async function shareLink(projectId: string, action: "get" | "create" | "revoke") {
  const path = `/api/projects/${encodeURIComponent(projectId)}/share`;
  const method = action === "get" ? "GET" : action === "create" ? "POST" : "DELETE";
  const res = await api<{ token?: string | null }>(path, { method });
  return res.token ? `${window.location.origin}/teilen/${res.token}` : null;
}
