import "server-only";
import { randomBytes } from "node:crypto";
import type { Project } from "@/model/types";

// Thin PostgREST client for the rais_* tables. The secret key stays on the server;
// the tables have RLS enabled without policies, so only this key can read them.

const base = () => process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const key = () => process.env.SUPABASE_SECRET_KEY ?? "";

export const cloudEnabled = () => !!(base() && key());

function headers(extra: Record<string, string> = {}) {
  const k = key();
  const h: Record<string, string> = { apikey: k, "content-type": "application/json", ...extra };
  // legacy service_role keys are JWTs and must also be sent as bearer token
  if (k.startsWith("eyJ")) h.authorization = `Bearer ${k}`;
  return h;
}

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function rest<T>(path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`${base()}/rest/v1/${path}`, { ...init, headers: headers(init.headers), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Supabase", res.status, path.split("?")[0], text.slice(0, 300));
    throw new CloudError("Der Cloud-Speicher ist nicht erreichbar.", 502);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  floors: number;
  created_at: string;
  updated_at: string;
}

export const listProjects = () =>
  rest<ProjectSummary[]>("rais_projects?select=id,name,thumbnail,floors,created_at,updated_at&order=updated_at.desc");

export async function getProjectRow(id: string) {
  const rows = await rest<{ data: Project }[]>(`rais_projects?id=eq.${enc(id)}&select=data`);
  return rows[0]?.data ?? null;
}

/** Saves the project; refuses when someone else saved a newer version since `baseUpdatedAt`. */
export async function saveProjectRow(p: Project, baseUpdatedAt?: number) {
  if (baseUpdatedAt !== undefined) {
    const current = await rest<{ stamp: number }[]>(`rais_projects?id=eq.${enc(p.id)}&select=stamp:data->updatedAt`);
    const stamp = Number(current[0]?.stamp ?? 0);
    if (stamp && stamp > baseUpdatedAt) {
      throw new CloudError("Das Projekt wurde inzwischen an anderer Stelle geändert. Bitte neu laden.", 409);
    }
  }
  const { thumbnail, ...data } = p;
  await rest("rais_projects?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: p.id,
      name: p.name,
      data,
      thumbnail: thumbnail ?? null,
      floors: p.floors.length,
      created_at: new Date(p.createdAt).toISOString(),
      updated_at: new Date(p.updatedAt).toISOString(),
    }),
  });
}

export const deleteProjectRow = (id: string) =>
  rest(`rais_projects?id=eq.${enc(id)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });

export async function putAsset(projectId: string, id: string, kind: string, data: string) {
  await rest("rais_assets?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id, project_id: projectId, kind, data }),
  });
}

export async function getAssets(projectId: string) {
  return rest<{ id: string; data: string }[]>(`rais_assets?project_id=eq.${enc(projectId)}&select=id,data`);
}

/** Replaces `asset:<id>` markers (drawings, custom 3D models) with the stored data. */
export async function expandAssets(p: Project): Promise<Project> {
  const isRef = (v?: string) => !!v?.startsWith("asset:");
  const refs =
    p.floors.some((f) => isRef(f.underlay?.dataUrl)) || (p.customFurniture ?? []).some((d) => isRef(d.model?.url));
  if (!refs) return p;
  const assets = new Map((await getAssets(p.id)).map((a) => [a.id, a.data]));
  return {
    ...p,
    floors: p.floors.map((f) => {
      const ref = f.underlay?.dataUrl;
      if (!f.underlay || !isRef(ref)) return f;
      const data = assets.get(ref!.slice(6));
      return data ? { ...f, underlay: { ...f.underlay, dataUrl: data } } : { ...f, underlay: undefined };
    }),
    customFurniture: (p.customFurniture ?? []).map((d) => {
      if (!d.model || !isRef(d.model.url)) return d;
      const data = assets.get(d.model.url.slice(6));
      if (data) return { ...d, model: { ...d.model, url: data } };
      // model missing: fall back to the simple parts
      const { model: _gone, ...rest } = d;
      void _gone;
      return rest;
    }),
  };
}

export async function createShare(projectId: string) {
  const token = randomBytes(18).toString("base64url");
  await rest("rais_shares", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ token, project_id: projectId }),
  });
  return token;
}

export const activeShare = async (projectId: string) =>
  (
    await rest<{ token: string }[]>(
      `rais_shares?project_id=eq.${enc(projectId)}&revoked=is.false&select=token&order=created_at.desc&limit=1`,
    )
  )[0]?.token ?? null;

export const revokeShares = (projectId: string) =>
  rest(`rais_shares?project_id=eq.${enc(projectId)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ revoked: true }),
  });

export async function projectForShare(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const rows = await rest<{ project_id: string }[]>(
    `rais_shares?token=eq.${enc(token)}&revoked=is.false&select=project_id`,
  );
  const id = rows[0]?.project_id;
  if (!id) return null;
  const p = await getProjectRow(id);
  return p ? expandAssets(p) : null;
}

export function cloudErrorResponse(e: unknown) {
  if (e instanceof CloudError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Unerwarteter Fehler beim Speichern." }, { status: 500 });
}
