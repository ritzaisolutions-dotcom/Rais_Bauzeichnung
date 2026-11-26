import { cloudEnabled, cloudErrorResponse, putAsset } from "@/lib/cloud/server";

export const runtime = "nodejs";

const MAX = 4_000_000; // stays under the serverless request limit

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  if (!cloudEnabled()) return Response.json({ error: "Cloud-Speicher ist nicht eingerichtet." }, { status: 404 });
  const { id, assetId } = await params;
  const body = (await req.json().catch(() => null)) as { kind?: string; data?: string } | null;
  if (!body?.data?.startsWith("data:") || !body.kind || !/^[\w:-]{1,120}$/.test(assetId)) {
    return Response.json({ error: "Ungültige Datei." }, { status: 400 });
  }
  if (body.data.length > MAX) {
    return Response.json({ error: "Die Datei ist zu groß (max. ca. 3 MB)." }, { status: 413 });
  }
  try {
    await putAsset(id, assetId, body.kind, body.data);
    return Response.json({ ok: true, ref: `asset:${assetId}` });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}
