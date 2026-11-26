import { cloudEnabled, cloudErrorResponse, projectForShare } from "@/lib/cloud/server";
import { allow, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Public, read-only: the project behind a share link. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const gone = () => Response.json({ error: "Dieser Link ist ungültig oder wurde zurückgezogen." }, { status: 404 });
  if (!cloudEnabled()) return gone();
  if (!allow(`share:${clientIp(req)}`, 60, 60 * 1000)) {
    return Response.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }
  try {
    const p = await projectForShare((await params).token);
    if (!p) return gone();
    return Response.json({ project: p });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}
