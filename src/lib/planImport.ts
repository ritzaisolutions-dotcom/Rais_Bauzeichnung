"use client";

// Loads a construction drawing (PDF or image) as an underlay, reads the PDF text
// layer for room names, areas and the drawing scale.

export interface PlanLabel {
  name: string;
  area?: number;
  /** Position in image pixels. */
  px: number;
  py: number;
}

export interface LoadedPlan {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  /** Pixels per meter if a scale like 1:100 was found. */
  pxPerMeter?: number;
  scaleRatio?: number;
  labels: PlanLabel[];
  pageCount: number;
  /** Plain text lines of the page, given to the AI as context. */
  textItems: { str: string; px: number; py: number }[];
}

const TARGET_PX = 3200;
const PT_PER_MM = 72 / 25.4;

export async function loadPlanFile(file: File, pageNumber = 1): Promise<LoadedPlan> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return loadPdf(await file.arrayBuffer(), pageNumber);
  }
  return loadImage(file);
}

async function loadImage(file: File): Promise<LoadedPlan> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = await loadImg(dataUrl);
  // re-encode large photos/scans: at most 4000 px, WebP
  const k = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight));
  if (k < 1 || dataUrl.length > 2_500_000) {
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL("image/webp", 0.88), widthPx: c.width, heightPx: c.height, labels: [], pageCount: 1, textItems: [] };
  }
  return { dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight, labels: [], pageCount: 1, textItems: [] };
}

export function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadPdf(data: ArrayBuffer, pageNumber: number): Promise<LoadedPlan> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(Math.min(pageNumber, doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = TARGET_PX / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  // WebP keeps line drawings sharp at a fraction of the PNG size (cloud uploads stay small)
  const dataUrl = canvas.toDataURL("image/webp", 0.9);

  const text = await page.getTextContent();
  const textItems: LoadedPlan["textItems"] = [];
  for (const it of text.items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const [x, y] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = Math.hypot(it.transform[2], it.transform[3]) * scale;
    // transform points to the baseline; shift up to the middle of the glyphs
    textItems.push({ str: it.str.trim(), px: x, py: y - h * 0.35 });
  }
  const joined = textItems.map((t) => t.str).join(" ");
  const m = joined.match(/\b1\s*:\s*(50|100|200|250|500)\b/);
  const scaleRatio = m ? Number(m[1]) : undefined;
  const pxPerMeter = scaleRatio ? (1000 / scaleRatio) * PT_PER_MM * scale : undefined;

  return {
    dataUrl,
    widthPx: canvas.width,
    heightPx: canvas.height,
    pxPerMeter,
    scaleRatio,
    labels: extractRoomLabels(textItems, scale),
    pageCount: doc.numPages,
    textItems,
  };
}

const AREA_RE = /(\d{1,3}[.,]\d{1,2})\s*m(?:2|²)?/i;
const NOT_A_NAME = /^(m|2|²|b:|p\d|seite|gspublisher|rd|ra|\d.*)$/i;

/** Pairs "Wohnen" with the "36,31 m2" below it. */
export function extractRoomLabels(items: { str: string; px: number; py: number }[], scale = 1): PlanLabel[] {
  const areas = items.filter((t) => AREA_RE.test(t.str) && !/^b\s*:/i.test(t.str));
  const names = items.filter(
    (t) => /[a-zäöüß]{2,}/i.test(t.str) && !AREA_RE.test(t.str) && !NOT_A_NAME.test(t.str) && t.str.length <= 30,
  );
  const lineH = 12 * scale;
  const out: PlanLabel[] = [];
  const used = new Set<number>();
  for (const a of areas) {
    let best = -1;
    let bestD = Infinity;
    names.forEach((n, i) => {
      if (used.has(i)) return;
      const dy = a.py - n.py;
      const dx = Math.abs(a.px - n.px);
      if (dy <= 0 || dy > lineH * 3.5 || dx > lineH * 6) return;
      const d = dy + dx * 0.5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) continue;
    used.add(best);
    const n = names[best];
    const area = parseFloat(AREA_RE.exec(a.str)![1].replace(",", "."));
    out.push({ name: n.str, area, px: n.px, py: (n.py + a.py) / 2 });
  }
  return out;
}

/** Downscaled JPEG of the underlay for the vision model. */
export async function underlayForAi(dataUrl: string, maxPx = 1568) {
  const img = await loadImg(dataUrl);
  const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.88);
  return { base64: url.split(",")[1], width: c.width, height: c.height, factor: k };
}
