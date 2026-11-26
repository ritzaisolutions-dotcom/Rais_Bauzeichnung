"use client";

import { computeRoomGeometry, floorBounds, formatM } from "@/model/geometry";
import { ROOM_TYPE_LABELS } from "@/model/materials";
import { livingArea, roomAreas } from "@/model/woflv";
import type { Floor, Project } from "@/model/types";
import { registry } from "./registry";

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) =>
  s
    .replace(/[^\wäöüÄÖÜß\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_") || "grundriss";

/** Serialises the current 2D plan, framed to the floor's bounds, as a standalone SVG. */
/** Plan extent in meters (floor bounds plus a margin), shared by the image and PDF exports. */
export function planExtent(floor: Floor, pad = 0.8) {
  const b = floorBounds(floor);
  return { x: b.minX - pad, y: b.minY - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

export function planSvgString(
  floor: Floor,
  pxPerMeter = 120,
  pad = 0.8,
): { svg: string; width: number; height: number } | null {
  const src = registry.svg;
  if (!src) return null;
  const { x, y, w, h } = planExtent(floor, pad);
  const clone = src.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  const width = Math.round(w * pxPerMeter);
  const height = Math.round(h * pxPerMeter);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  const root = clone.querySelector(":scope > g");
  root?.setAttribute("transform", "");
  const bg = clone.querySelector('[data-kind="bg"]');
  bg?.setAttribute("fill", "#ffffff");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    "text{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}";
  clone.insertBefore(style, clone.firstChild);
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

export async function planPngBlob(floor: Floor, pxPerMeter = 300, pad = 0.8): Promise<Blob | null> {
  const res = planSvgString(floor, pxPerMeter, pad);
  if (!res) return null;
  const url = URL.createObjectURL(new Blob([res.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const c = document.createElement("canvas");
    c.width = res.width;
    c.height = res.height;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    return await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printPlan(pngUrl: string, title: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(
    `<!doctype html><html><head><title>${title}</title><style>@page{size:A4 landscape;margin:12mm}body{margin:0;font-family:system-ui,sans-serif}h1{font-size:14px;margin:0 0 8px}img{width:100%;max-height:180mm;object-fit:contain}</style></head><body><h1>${title}</h1><img src="${pngUrl}" onload="setTimeout(()=>print(),200)"></body></html>`,
  );
  w.document.close();
  return true;
}

export function areaCsv(floor: Floor) {
  const rooms = computeRoomGeometry(floor);
  const rows = [["Raum", "Raumtyp", "Grundfläche m²", "Wohnfläche WoFlV m²", "Soll laut Plan m²", "Umfang m"]];
  for (const r of rooms) {
    rows.push([
      r.meta.name,
      ROOM_TYPE_LABELS[r.meta.roomType ?? "sonstiges"],
      formatM(r.area),
      formatM(roomAreas(floor, r).counted),
      r.meta.targetArea !== undefined ? formatM(r.meta.targetArea) : "",
      formatM(r.perimeter),
    ]);
  }
  const total = rooms.reduce((s, r) => s + r.area, 0);
  rows.push(["Summe", "", formatM(total), formatM(livingArea(floor, rooms)), "", ""]);
  return "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
}

export async function exportGlb(): Promise<Blob | null> {
  const scene = registry.scene;
  if (!scene) return null;
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary: true });
  return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
}

export function screenshot3d(width = 3840): Promise<Blob | null> {
  if (registry.renderHiRes) return registry.renderHiRes(width);
  const c = registry.glCanvas;
  if (!c) return Promise.resolve(null);
  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

export function projectJson(p: Project) {
  return new Blob([JSON.stringify({ format: "rais-bauzeichnung", version: 1, project: p })], {
    type: "application/json",
  });
}

export async function readProjectFile(file: File): Promise<Project> {
  const data = JSON.parse(await file.text());
  const p = (data?.project ?? data) as Project;
  if (!p || !Array.isArray(p.floors) || !p.name) throw new Error("Keine gültige Projektdatei.");
  p.customFurniture ??= [];
  return p;
}
