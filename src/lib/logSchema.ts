import { z } from "zod";

/** What the browser may report; everything is cut to size so logs stay readable. */
export const clientErrorSchema = z.object({
  kind: z.enum(["error", "unhandledrejection", "boundary", "webgl"]),
  message: z.string().transform((s) => s.slice(0, 500)),
  stack: z
    .string()
    .optional()
    .transform((s) => s?.slice(0, 2000)),
  url: z
    .string()
    .optional()
    // keep the path only: share tokens and query strings stay out of the logs
    .transform((s) =>
      s
        ? s
            .replace(/^https?:\/\/[^/]+/, "")
            .replace(/[?#].*$/, "")
            .replace(/\/teilen\/[^/]+/, "/teilen/…")
        : s,
    ),
  digest: z
    .string()
    .optional()
    .transform((s) => s?.slice(0, 100)),
});

export type ClientError = z.input<typeof clientErrorSchema>;
