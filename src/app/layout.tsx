import type { Metadata } from "next";
import { ErrorReporter } from "@/components/ErrorReporter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rais Bauzeichnung – Grundriss-Editor",
  description: "Grundrisse aus Bauzeichnungen erstellen, bearbeiten und in 2D und 3D einrichten.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
