// Which side of which wall faces which room, for wall colours and tiles, and
// the sun position for a time of day. Plain functions, no three.js.
import { pointInPolygon } from "./geometry";
import type { Floor, RoomGeometry } from "./types";
import { wallFrames, type WallFrame } from "./walls";

export interface WallSide {
  frame: WallFrame;
  /** +1: the side the wall normal points to, -1: the other side. */
  side: 1 | -1;
  room: RoomGeometry;
}

/** Wall faces that belong to rooms with a wall colour or tiles. */
export function finishedWallSides(floor: Floor, rooms: RoomGeometry[]): WallSide[] {
  const styled = rooms.filter((r) => r.meta.wallColor || (r.meta.tileHeight ?? 0) > 0);
  if (!styled.length) return [];
  const out: WallSide[] = [];
  for (const f of wallFrames(floor)) {
    if (f.wall.type === "gelaender") continue;
    const mid = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
    for (const side of [1, -1] as const) {
      const off = f.wall.thickness / 2 + 0.05;
      const p = { x: mid.x + f.normal.x * off * side, y: mid.y + f.normal.y * off * side };
      const room = styled.find((r) => pointInPolygon(p, r.inner));
      if (room) out.push({ frame: f, side, room });
    }
  }
  return out;
}

export interface Sun {
  /** Unit vector pointing from the scene towards the sun (x east, y up, z south in plan terms). */
  dir: { x: number; y: number; z: number };
  /** 0 at night, 1 at noon. */
  daylight: number;
  /** Warm at sunrise and sunset. */
  color: string;
}

/**
 * Simple sun path for central Europe: rises in the east at 6, highest (about 60°)
 * at 13 in the south, sets in the west at 20. Plan y points south.
 */
export function sunAt(hour: number): Sun {
  const t = (hour - 6) / 14; // 0 sunrise .. 1 sunset
  const elev = t <= 0 || t >= 1 ? -0.1 : Math.sin(Math.PI * t) * ((60 * Math.PI) / 180);
  const az = Math.PI * t; // 0 east, π/2 south, π west
  const x = Math.cos(az) * Math.cos(Math.max(elev, 0.02));
  const z = Math.sin(az) * Math.cos(Math.max(elev, 0.02));
  const y = Math.sin(Math.max(elev, 0.02));
  const daylight = elev <= 0 ? 0 : Math.min(1, Math.sin(elev) / Math.sin((40 * Math.PI) / 180));
  const warm = 1 - Math.min(1, Math.max(0, (elev * 180) / Math.PI / 25));
  const g = Math.round(244 - 60 * warm);
  const b = Math.round(232 - 120 * warm);
  return { dir: { x, y, z }, daylight, color: `rgb(255, ${g}, ${b})` };
}
