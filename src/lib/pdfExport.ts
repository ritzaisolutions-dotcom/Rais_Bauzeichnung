"use client";

// To-scale plan PDF: the plan as a 300 dpi image at its exact paper size, plus a
// bottom strip with scale bar, north arrow, area table and title block.
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { computeRoomGeometry, formatM } from "@/model/geometry";
import type { Floor, Project } from "@/model/types";
import { livingArea, roomAreas } from "@/model/woflv";
import { planExtent, planPngBlob } from "./exports";
import { layoutPdf, pxPerMeterFor, scaleBarMeters, winAnsi, type Orientation, type Paper } from "./pdfLayout";

export interface PdfOptions {
  paper: Paper;
  orientation: Orientation;
  scale: number | "fit";
  /** North arrow rotation in degrees (0 = up). */
  north: number;
  company: string;
  /** PNG or JPEG data URL. */
  logo?: string;
}

const PT = 72 / 25.4;
const INK = rgb(0.15, 0.15, 0.14);
const MUTED = rgb(0.45, 0.44, 0.42);
const LINE = rgb(0.7, 0.69, 0.66);

export class PlanDoesNotFitError extends Error {}

export async function planPdf(project: Project, floor: Floor, o: PdfOptions): Promise<Blob> {
  const pad = 0.4;
  const ext = planExtent(floor, pad);
  const L = layoutPdf(ext.w, ext.h, o.paper, o.orientation, o.scale);
  if (!L.fits)
    throw new PlanDoesNotFitError(
      `Der Plan passt bei 1:${L.scale} nicht auf ${o.paper} ${o.orientation === "quer" ? "quer" : "hoch"}. Bitte größeres Papier oder kleineren Maßstab wählen.`,
    );
  const png = await planPngBlob(floor, pxPerMeterFor(L.scale), pad);
  if (!png) throw new Error("Der Plan konnte nicht gezeichnet werden.");

  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(`${project.name} – ${floor.name}`));
  doc.setCreator("Rais Bauzeichnung");
  const page = doc.addPage([L.pageW * PT, L.pageH * PT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // mm, origin top left → PDF points, origin bottom left
  const X = (mm: number) => mm * PT;
  const Y = (mm: number) => (L.pageH - mm) * PT;

  const img = await doc.embedPng(await png.arrayBuffer());
  page.drawImage(img, { x: X(L.plan.x), y: Y(L.plan.y + L.plan.h), width: X(L.plan.w), height: X(L.plan.h) });

  // frame and strip
  page.drawRectangle({
    x: X(5),
    y: Y(L.pageH - 5),
    width: X(L.pageW - 10),
    height: X(L.pageH - 10),
    borderColor: INK,
    borderWidth: 0.6,
  });
  const s = L.strip;
  page.drawLine({
    start: { x: X(s.x), y: Y(s.y - 2) },
    end: { x: X(s.x + s.w), y: Y(s.y - 2) },
    thickness: 0.4,
    color: LINE,
  });

  // 1) scale bar and north arrow
  drawScaleBar(page, font, X, Y, s.x, s.y + 8, L.scale);
  drawNorth(page, bold, X, Y, s.x + 68, s.y + 20, o.north);

  // 3) title block (right)
  const tbW = 88;
  const tbX = s.x + s.w - tbW;
  await drawTitleBlock(doc, page, font, bold, X, Y, tbX, s.y, tbW, s.h, project, floor, L.scale, o);

  // 2) area table between
  const rooms = computeRoomGeometry(floor)
    .slice()
    .sort((a, b) => b.area - a.area);
  const tableX = s.x + 84;
  const tableW = tbX - tableX - 6;
  const rows = rooms.map((r) => [winAnsi(r.meta.name), `${formatM(roomAreas(floor, r).counted)} m²`]);
  const living = `${formatM(livingArea(floor, rooms))} m²`;
  const perCol = 6;
  const colW = 44;
  const cols = Math.max(1, Math.floor(tableW / colW));
  const fitsTable = rows.length <= perCol * cols;
  page.drawText("Flächen (WoFlV)", { x: X(tableX), y: Y(s.y + 4), size: 7.5, font: bold, color: INK });
  const shown = fitsTable ? rows : rows.slice(0, perCol * cols - 1);
  shown.forEach(([name, area], i) => {
    const cx = tableX + Math.floor(i / perCol) * colW;
    const cy = s.y + 9 + (i % perCol) * 4.2;
    page.drawText(fit(name, font, 6.5, X(colW - 17)), { x: X(cx), y: Y(cy), size: 6.5, font, color: INK });
    page.drawText(area, {
      x: X(cx + colW - 3) - font.widthOfTextAtSize(area, 6.5),
      y: Y(cy),
      size: 6.5,
      font,
      color: INK,
    });
  });
  if (!fitsTable) {
    const i = shown.length;
    page.drawText("weitere Räume auf Seite 2", {
      x: X(tableX + Math.floor(i / perCol) * colW),
      y: Y(s.y + 9 + (i % perCol) * 4.2),
      size: 6.5,
      font,
      color: MUTED,
    });
  }
  page.drawText(`Wohnfläche gesamt: ${living}`, { x: X(tableX), y: Y(s.y + 38), size: 7.5, font: bold, color: INK });

  if (!fitsTable) {
    const p2 = doc.addPage([L.pageW * PT, L.pageH * PT]);
    p2.drawText(winAnsi(`${project.name} – ${floor.name}: Flächen nach WoFlV`), {
      x: X(15),
      y: Y(20),
      size: 12,
      font: bold,
      color: INK,
    });
    rows.forEach(([name, area], i) => {
      const y = 30 + i * 6;
      p2.drawText(name, { x: X(15), y: Y(y), size: 9, font, color: INK });
      p2.drawText(area, { x: X(120) - font.widthOfTextAtSize(area, 9), y: Y(y), size: 9, font, color: INK });
    });
    p2.drawText(`Wohnfläche gesamt: ${living}`, {
      x: X(15),
      y: Y(36 + rows.length * 6),
      size: 10,
      font: bold,
      color: INK,
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function fit(text: string, font: PDFFont, size: number, maxPt: number) {
  if (font.widthOfTextAtSize(text, size) <= maxPt) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxPt) t = t.slice(0, -1);
  return `${t}…`;
}

type Conv = (mm: number) => number;

function drawScaleBar(page: PDFPage, font: PDFFont, X: Conv, Y: Conv, x: number, y: number, scale: number) {
  const meters = scaleBarMeters(scale, 50);
  const len = (meters * 1000) / scale;
  const n = meters <= 2 ? meters * 2 : meters >= 10 ? 5 : meters;
  for (let i = 0; i < n; i++) {
    page.drawRectangle({
      x: X(x + (len * i) / n),
      y: Y(y + 2.5),
      width: X(len / n),
      height: X(2.5),
      color: i % 2 ? rgb(1, 1, 1) : INK,
      borderColor: INK,
      borderWidth: 0.4,
    });
  }
  page.drawText("0", { x: X(x) - 1, y: Y(y + 6.5), size: 6.5, font, color: INK });
  const label = `${meters} m`;
  page.drawText(label, {
    x: X(x + len) - font.widthOfTextAtSize(label, 6.5) / 2,
    y: Y(y + 6.5),
    size: 6.5,
    font,
    color: INK,
  });
  page.drawText(`Maßstab 1:${scale}`, { x: X(x), y: Y(y - 2), size: 8, font, color: INK });
  page.drawText("Nur maßstäblich bei Druck in Originalgröße (100 %).", {
    x: X(x),
    y: Y(y + 13),
    size: 5.5,
    font,
    color: MUTED,
  });
}

function drawNorth(page: PDFPage, bold: PDFFont, X: Conv, Y: Conv, cx: number, cy: number, deg: number) {
  const r = 7;
  const rad = (deg * Math.PI) / 180;
  const rot = (dx: number, dy: number) => ({
    x: X(cx + dx * Math.cos(rad) - dy * Math.sin(rad)),
    y: Y(cy + dx * Math.sin(rad) + dy * Math.cos(rad)),
  });
  page.drawCircle({ x: X(cx), y: Y(cy), size: X(r), borderColor: INK, borderWidth: 0.5 });
  const tip = rot(0, -r + 1);
  const left = rot(-2.6, r - 2);
  const mid = rot(0, r - 3.8);
  const right = rot(2.6, r - 2);
  page.drawSvgPath(`M ${tip.x} ${-tip.y} L ${left.x} ${-left.y} L ${mid.x} ${-mid.y} Z`, { x: 0, y: 0, color: INK });
  page.drawSvgPath(`M ${tip.x} ${-tip.y} L ${right.x} ${-right.y} L ${mid.x} ${-mid.y} Z`, {
    x: 0,
    y: 0,
    borderColor: INK,
    borderWidth: 0.4,
  });
  const n = rot(0, -r - 3);
  page.drawText("N", { x: n.x - 2.5, y: n.y - 2.5, size: 8, font: bold, color: INK, rotate: degrees(-deg) });
}

async function drawTitleBlock(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  X: Conv,
  Y: Conv,
  x: number,
  y: number,
  w: number,
  h: number,
  project: Project,
  floor: Floor,
  scale: number,
  o: PdfOptions,
) {
  page.drawRectangle({ x: X(x), y: Y(y + h), width: X(w), height: X(h), borderColor: INK, borderWidth: 0.6 });
  let top = y;
  const logoH = 11;
  if (o.logo) {
    try {
      const bytes = await (await fetch(o.logo)).arrayBuffer();
      const img = o.logo.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const k = Math.min((w - 6) / (img.width / (img.height / logoH)), 1);
      const lw = (img.width / img.height) * logoH * k;
      page.drawImage(img, { x: X(x + 3), y: Y(top + 2 + logoH * k), width: X(lw), height: X(logoH * k) });
      top += logoH + 2;
    } catch {
      // unreadable logo: leave it out
    }
  }
  if (o.company) {
    page.drawText(fit(winAnsi(o.company), bold, 8, X(w - 6)), {
      x: X(x + 3),
      y: Y(top + 5),
      size: 8,
      font: bold,
      color: INK,
    });
    top += 6;
  }
  page.drawLine({
    start: { x: X(x), y: Y(top + 1.5) },
    end: { x: X(x + w), y: Y(top + 1.5) },
    thickness: 0.4,
    color: LINE,
  });
  const rows: [string, string][] = [
    ["Projekt", project.name],
    ["Plan", `Grundriss ${floor.name}`],
    ["Maßstab", `1:${scale}`],
    ["Datum", new Date().toLocaleDateString("de-DE")],
  ];
  const avail = y + h - top - 2;
  const step = Math.min(5, avail / rows.length);
  rows.forEach(([k, v], i) => {
    const ry = top + 4.5 + i * step;
    page.drawText(k, { x: X(x + 3), y: Y(ry), size: 6, font, color: MUTED });
    page.drawText(fit(winAnsi(v), bold, 7.5, X(w - 24)), { x: X(x + 21), y: Y(ry), size: 7.5, font: bold, color: INK });
  });
}
