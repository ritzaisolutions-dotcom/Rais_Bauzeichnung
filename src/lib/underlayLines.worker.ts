import { detectUnderlayLines, type Bitmap } from "./underlayLines";

self.onmessage = (e: MessageEvent<{ id: number; bmp: Bitmap; ppm: number }>) => {
  const { id, bmp, ppm } = e.data;
  (self as unknown as Worker).postMessage({ id, lines: detectUnderlayLines(bmp, ppm) });
};
