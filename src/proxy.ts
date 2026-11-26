import { NextResponse, type NextRequest } from "next/server";
import { authConfig, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Paths reachable without the password: login, shared read-only plans and legal pages.
const PUBLIC = [/^\/login$/, /^\/api\/login$/, /^\/api\/log$/, /^\/teilen\//, /^\/api\/share\//];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const { mode, secret } = authConfig();
  if (mode === "open") return NextResponse.next();
  const ok = mode === "protected" && verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next internals and static files from /public
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|models/|pdf\\.worker\\.min\\.mjs|.*\\.(?:png|jpg|svg|webp|glb|ico)$).*)",
  ],
};
