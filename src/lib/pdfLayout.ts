// Page layout for the to-scale plan PDF. Units: millimetres on paper, meters in the plan.

export type Paper = "A4" | "A3";
export type Orientation = "quer" | "hoch";

export const PAPER_MM: Record<Paper, [number, number]> = { A4: [297, 210], A3: [420, 297] };
export const STANDARD_SCALES = [50, 100, 200] as const;
export const MARGIN = 10;
/** Height of the bottom strip with scale bar, north arrow, area table and title block. */
export const STRIP = 42;

export interface PdfLayout {
  pageW: number;
  pageH: number;
  /** Plan area on the page (mm, origin top left). */
  plan: { x: number; y: number; w: number; h: number };
  /** Paper size of the drawn plan at the chosen scale. */
  drawnW: number;
  drawnH: number;
  scale: number;
  fits: boolean;
  strip: { x: number; y: number; w: number; h: number };
}

export function pageSize(paper: Paper, orientation: Orientation): [number, number] {
  const [a, b] = PAPER_MM[paper];
  return orientation === "quer" ? [a, b] : [b, a];
}

/**
 * Places a plan of planW × planH meters at 1:scale. With scale "fit" the largest
 * standard scale that fits is used (or 1:200 if nothing fits, flagged by fits = false).
 */
export function layoutPdf(
  planW: number,
  planH: number,
  paper: Paper,
  orientation: Orientation,
  scale: number | "fit",
): PdfLayout {
  const [pageW, pageH] = pageSize(paper, orientation);
  const area = { x: MARGIN, y: MARGIN, w: pageW - 2 * MARGIN, h: pageH - 2 * MARGIN - STRIP - 4 };
  const fitsAt = (s: number) => (planW * 1000) / s <= area.w + 1e-6 && (planH * 1000) / s <= area.h + 1e-6;
  let s: number;
  if (scale === "fit") s = STANDARD_SCALES.find(fitsAt) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1];
  else s = scale;
  const drawnW = (planW * 1000) / s;
  const drawnH = (planH * 1000) / s;
  return {
    pageW,
    pageH,
    // centred in the plan area
    plan: { x: area.x + (area.w - drawnW) / 2, y: area.y + (area.h - drawnH) / 2, w: drawnW, h: drawnH },
    drawnW,
    drawnH,
    scale: s,
    fits: fitsAt(s),
    strip: { x: MARGIN, y: pageH - MARGIN - STRIP, w: pageW - 2 * MARGIN, h: STRIP },
  };
}

/** Image resolution for the plan: 300 dpi on paper. */
export const pxPerMeterFor = (scale: number, dpi = 300) => ((1000 / scale) * dpi) / 25.4;

/** A "nice" scale bar length in meters that is at most maxMm long on paper. */
export function scaleBarMeters(scale: number, maxMm: number) {
  const maxM = (maxMm * scale) / 1000;
  return [1, 2, 5, 10, 20, 50].filter((m) => m <= maxM).pop() ?? 1;
}

/** Text in the PDF standard fonts only supports WinAnsi; replace what it cannot show. */
export function winAnsi(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/−/g, "-")
    .replace(/[^\x20-\x7E -ÿ–—•…€]/g, "?");
}
