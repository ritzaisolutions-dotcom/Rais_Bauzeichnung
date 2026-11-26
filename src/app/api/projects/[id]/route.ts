import type { Project } from "@/model/types";
import {
  cloudEnabled,
  cloudErrorResponse,
  deleteProjectRow,
  expandAssets,
  getProjectRow,
  saveProjectRow,
} from "@/lib/cloud/server";

export const runtime = "nodejs";

const off = () => Response.json({ error: "Cloud-Speicher ist nicht eingerichtet." }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!cloudEnabled()) return off();
  const { id } = await params;
  try {
    const p = await getProjectRow(id);
    if (!p) return Response.json({ error: "Projekt nicht gefunden." }, { status: 404 });
    return Response.json({ project: await expandAssets(p) });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!cloudEnabled()) return off();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { project?: Project; baseUpdatedAt?: number } | null;
  const p = body?.project;
  if (!p || p.id !== id || !Array.isArray(p.floors) || typeof p.name !== "string") {
    return Response.json({ error: "Ungültiges Projekt." }, { status: 400 });
  }
  // images must be uploaded as assets first; inline data would blow up every autosave
  if (p.floors.some((f) => f.underlay?.dataUrl.startsWith("data:"))) {
    return Response.json({ error: "Bauzeichnung bitte separat hochladen." }, { status: 400 });
  }
  try {
    await saveProjectRow(p, body?.baseUpdatedAt);
    return Response.json({ ok: true });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!cloudEnabled()) return off();
  const { id } = await params;
  try {
    await deleteProjectRow(id);
    return Response.json({ ok: true });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}
