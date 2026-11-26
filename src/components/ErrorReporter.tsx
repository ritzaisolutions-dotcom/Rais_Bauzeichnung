"use client";

import { useEffect } from "react";
import { errorText, reportError } from "@/lib/clientLog";

/** Reports uncaught errors and rejected promises of the whole app. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError({ kind: "error", ...errorText(e.error ?? e.message) });
    const onRejection = (e: PromiseRejectionEvent) =>
      reportError({ kind: "unhandledrejection", ...errorText(e.reason) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
