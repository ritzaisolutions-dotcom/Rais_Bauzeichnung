"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="de">
      <body>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
