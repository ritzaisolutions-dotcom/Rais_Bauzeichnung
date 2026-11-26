import { cloudEnabled, cloudErrorResponse, listProjects } from "@/lib/cloud/server";

export const runtime = "nodejs";

/** Lists cloud projects; `cloud: false` tells the client to use browser storage instead. */
export async function GET() {
  if (!cloudEnabled()) return Response.json({ cloud: false, projects: [] });
  try {
    return Response.json({ cloud: true, projects: await listProjects() });
  } catch (e) {
    return cloudErrorResponse(e);
  }
}
