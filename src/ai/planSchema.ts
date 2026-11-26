import { z } from "zod";

/** Floor plan recognised by the vision model, in image pixels. */
export const planSchema = z.object({
  walls: z.array(
    z.object({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      thickness_px: z.number(),
      type: z.enum(["aussen", "innen", "tragend", "gelaender"]),
    }),
  ),
  openings: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      kind: z.enum(["tuer", "fenster", "schiebetuer", "durchgang", "bodenfenster"]),
      width_px: z.number(),
    }),
  ),
  rooms: z.array(z.object({ name: z.string(), x: z.number(), y: z.number(), area_m2: z.number() })),
  notes: z.string(),
});

export type RecognisedPlan = z.infer<typeof planSchema>;
