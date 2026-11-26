import { activeShare, cloudEnabled, cloudErrorResponse, createShare, revokeShares } from "@/lib/cloud/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const off = () => Response.json({ error: "Teilen braucht den Cloud-Speicher." }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  if (!cloudEnabled()) return off();
  try {
    return Response.json({ token: await activeShare((await params).id) });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}

export async function POST(_req: Request, { params }: Ctx) {
  if (!cloudEnabled()) return off();
  try {
    const id = (await params).id;
    return Response.json({ token: (await activeShare(id)) ?? (await createShare(id)) });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!cloudEnabled()) return off();
  try {
    await revokeShares((await params).id);
    return Response.json({ ok: true });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}
