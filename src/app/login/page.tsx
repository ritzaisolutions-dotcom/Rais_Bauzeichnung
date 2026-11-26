import { authConfig } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { mode } = authConfig();
  // only allow redirects inside this app
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return <LoginForm next={target} locked={mode === "locked"} />;
}
