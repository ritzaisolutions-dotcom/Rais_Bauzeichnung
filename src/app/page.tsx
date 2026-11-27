import { ProjectList } from "@/components/projects/ProjectList";
import { authConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function Home() {
  // the logout button only makes sense when a password is configured
  return <ProjectList canLogout={authConfig().mode === "protected"} />;
}
