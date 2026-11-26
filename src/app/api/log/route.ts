import { clientErrorSchema } from "@/lib/logSchema";
import { allow, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Client-side errors end up in the server log (Vercel), no third-party service involved. */
export async function POST(req: Request) {
  if (!allow(`log:${clientIp(req)}`, 30, 60 * 1000)) return new Response(null, { status: 429 });
  const text = await req.text().catch(() => "");
  if (text.length > 8000) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  console.error(JSON.stringify({ source: "client", ...parsed.data, ua: req.headers.get("user-agent")?.slice(0, 160) }));
  return new Response(null, { status: 204 });
}
