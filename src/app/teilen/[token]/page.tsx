import type { Metadata } from "next";
import { ShareView } from "@/components/share/ShareView";

export const metadata: Metadata = { title: "Grundriss", robots: { index: false, follow: false } };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
