import { describe, expect, it } from "vitest";
import { layoutPdf, pxPerMeterFor, scaleBarMeters, winAnsi } from "./pdfLayout";

describe("layoutPdf", () => {
  it("draws 1 m as 10 mm at 1:100 and centres the plan", () => {
    const l = layoutPdf(13.6, 10.6, "A4", "quer", 100);
    expect(l.drawnW).toBeCloseTo(136);
    expect(l.drawnH).toBeCloseTo(106);
    expect(l.fits).toBe(true);
    expect(l.plan.x + l.plan.w / 2).toBeCloseTo(297 / 2);
  });
  it("picks the largest standard scale that fits", () => {
    expect(layoutPdf(10, 6, "A3", "quer", "fit").scale).toBe(50);
    expect(layoutPdf(20, 12, "A4", "quer", "fit").scale).toBe(100);
    expect(layoutPdf(40, 25, "A4", "quer", "fit").scale).toBe(200);
    const big = layoutPdf(90, 60, "A4", "quer", "fit");
    expect(big.scale).toBe(200);
    expect(big.fits).toBe(false);
  });
  it("swaps the page for portrait", () => {
    const l = layoutPdf(5, 5, "A4", "hoch", 100);
    expect([l.pageW, l.pageH]).toEqual([210, 297]);
  });
});

describe("helpers", () => {
  it("renders at 300 dpi", () => {
    expect(pxPerMeterFor(100)).toBeCloseTo(118.11, 1);
  });
  it("chooses a round scale bar", () => {
    expect(scaleBarMeters(100, 60)).toBe(5);
    expect(scaleBarMeters(50, 60)).toBe(2);
  });
  it("keeps German text and replaces unsupported characters", () => {
    expect(winAnsi("Wohnfläche 36,31 m² – „Süd“ ✓")).toBe('Wohnfläche 36,31 m² – "Süd" ?');
  });
});
