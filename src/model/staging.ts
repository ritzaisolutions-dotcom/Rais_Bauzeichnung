// Rule-based home staging: furnishes a room according to its type.
import { CATALOG, findDef } from "@/furniture/catalog";
import { boundsOf, pointInPolygon, rectCorners } from "./geometry";
import { detectRoomType, STYLES, type StagingStyle } from "./materials";
import { uid } from "./ops";
import type { Floor, FurnitureDef, FurnitureItem, RoomGeometry, RoomType, Vec2 } from "./types";
import { wallFrames, wallRect } from "./walls";

type Side = "top" | "right" | "bottom" | "left";

/** Rotation that puts an item's back (local -y) against the given wall. */
const ROT: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: 270 };
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

interface Step {
  defId: string;
  /** Wall to place against, relative to the room's main wall. */
  wall: "main" | "opposite" | "side1" | "side2" | "center";
  /** Position along the wall, 0..1. */
  along?: number;
  /** Extra distance from the wall in meters. */
  gap?: number;
  /** Place relative to an already placed item (index) instead. */
  besideOf?: number;
  besideSide?: -1 | 1;
  /** Place centered in front of an already placed item, dist meters from its front edge. */
  frontOf?: number;
  dist?: number;
  textile?: number;
  optional?: boolean;
}

/** Kitchen row for a living room without a separate kitchen (open plan). */
const kitchenStep = (area: number): Step => ({
  defId: area > 38 ? "kuechenzeile-l" : "kuechenzeile",
  wall: "side2",
  along: 0.5,
  gap: 0,
  optional: true,
});

const RECIPES: Partial<Record<RoomType, (area: number) => Step[]>> = {
  wohnkueche: (area) => [
    { defId: "sofa-3", wall: "main", along: 0.3, gap: 0.05, textile: 0 },
    { defId: "teppich", wall: "main", frontOf: 0, dist: -0.35, textile: 2, optional: true },
    { defId: "couchtisch", wall: "main", frontOf: 0, dist: 0.4, optional: true },
    { ...kitchenStep(area), optional: false },
    { defId: "essgruppe-6", wall: "center", along: 0.62, optional: true },
    { defId: "tv-board", wall: "opposite", along: 0.3, gap: 0.02, optional: true },
    { defId: "sessel", wall: "side1", along: 0.25, gap: 0.3, textile: 3, optional: true },
    { defId: "pflanze-gross", wall: "side1", along: 0.9, gap: 0.1, optional: true },
  ],
  wohnen: (area) => [
    { defId: "sofa-3", wall: "main", along: area > 28 ? 0.3 : 0.5, gap: 0.05, textile: 0 },
    { defId: "teppich", wall: "main", frontOf: 0, dist: -0.35, textile: 2, optional: true },
    { defId: "couchtisch", wall: "main", frontOf: 0, dist: 0.4, optional: true },
    { defId: "tv-board", wall: "opposite", along: area > 28 ? 0.7 : 0.5, gap: 0.02 },
    { defId: "sessel", wall: "side1", along: 0.25, gap: 0.3, textile: 3, optional: true },
    { defId: "stehlampe", wall: "main", besideOf: 0, besideSide: 1, optional: true },
    { defId: "pflanze-gross", wall: "side2", along: 0.08, gap: 0.1, optional: true },
    ...(area > 26 ? [{ defId: "essgruppe-6", wall: "center" as const, along: 0.78, optional: true }] : []),
  ],
  schlafen: (area) => [
    { defId: area > 13 ? "bett-180" : "bett-140", wall: "main", along: 0.5, gap: 0.02, textile: 0 },
    { defId: "nachttisch", wall: "main", besideOf: 0, besideSide: -1, optional: true },
    { defId: "nachttisch", wall: "main", besideOf: 0, besideSide: 1, optional: true },
    { defId: area > 14 ? "schrank-250" : "schrank-150", wall: "opposite", along: 0.5, gap: 0.02, optional: true },
    { defId: "pflanze", wall: "side1", along: 0.1, gap: 0.1, optional: true },
  ],
  kind: () => [
    { defId: "bett-90", wall: "main", along: 0.2, gap: 0.02, textile: 1 },
    { defId: "schreibtisch", wall: "opposite", along: 0.5, gap: 0.02 },
    { defId: "buerostuhl", wall: "opposite", along: 0.5, gap: 0.75, optional: true },
    { defId: "regal", wall: "side1", along: 0.7, gap: 0.02, optional: true },
    { defId: "teppich-rund", wall: "center", along: 0.5, optional: true, textile: 2 },
  ],
  arbeiten: () => [
    { defId: "bett-90", wall: "main", along: 0.25, gap: 0.02, textile: 0 },
    { defId: "schreibtisch", wall: "opposite", along: 0.5, gap: 0.02 },
    { defId: "buerostuhl", wall: "opposite", along: 0.5, gap: 0.75, optional: true },
    { defId: "regal", wall: "side1", along: 0.75, gap: 0.02, optional: true },
  ],
  bad: (area) => [
    { defId: area > 6.5 ? "badewanne" : "dusche", wall: "main", along: 0.0, gap: 0.0 },
    { defId: "badematte", wall: "main", frontOf: 0, dist: 0.06, optional: true },
    { defId: area > 7 ? "doppelwaschtisch" : "waschtisch", wall: "opposite", along: 0.6, gap: 0.0 },
    { defId: "wc", wall: "side1", along: 0.65, gap: 0.0 },
    { defId: "dusche", wall: "opposite", along: 1, gap: 0, optional: true },
    { defId: "handtuchheizkoerper", wall: "side2", along: 0.5, gap: 0.01, optional: true },
  ],
  wc: () => [
    { defId: "wc", wall: "main", along: 0.5, gap: 0 },
    { defId: "waschtisch", wall: "side1", along: 0.5, gap: 0, optional: true },
  ],
  kueche: (area) => [
    { defId: "kuechenzeile", wall: "main", along: 0.5, gap: 0 },
    ...(area > 12 ? [{ defId: "essgruppe-4", wall: "center" as const, along: 0.5, optional: true }] : []),
  ],
  essen: () => [
    { defId: "essgruppe-6", wall: "center", along: 0.5 },
    { defId: "sideboard", wall: "main", along: 0.5, gap: 0.02, optional: true },
  ],
  flur: () => [
    { defId: "sideboard", wall: "main", along: 0.3, gap: 0.02, optional: true },
    { defId: "pflanze", wall: "main", along: 0.9, gap: 0.05, optional: true },
  ],
  ankleide: () => [
    { defId: "schrank-250", wall: "main", along: 0.5, gap: 0.02 },
    { defId: "kommode", wall: "opposite", along: 0.5, gap: 0.02, optional: true },
  ],
  hwr: () => [
    { defId: "waschmaschine", wall: "main", along: 0, gap: 0 },
    { defId: "waschmaschine", wall: "main", besideOf: 0, besideSide: 1, optional: true },
  ],
  balkon: () => [
    { defId: "loungeset", wall: "main", along: 0.35, gap: 0.1 },
    { defId: "pflanze-gross", wall: "side2", along: 0.1, gap: 0.1, optional: true },
  ],
};

function rectsOverlap(a: Vec2[], b: Vec2[]) {
  // Separating axis test for two convex quads.
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % 4];
      const axis = { x: q.y - p.y, y: p.x - q.x };
      const proj = (pts: Vec2[]) => pts.map((v) => v.x * axis.x + v.y * axis.y);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

/** Footprint rect for an item placed against a side of the bounding box. */
function placeAgainst(side: Side, bb: ReturnType<typeof boundsOf>, def: FurnitureDef, along: number, gap: number) {
  const rot = ROT[side];
  // along the wall the item occupies def.w, away from the wall def.d
  const horizontal = side === "top" || side === "bottom";
  const span = horizontal ? bb.w : bb.h;
  const pos = Math.max(def.w / 2, Math.min(span - def.w / 2, along * span));
  let x: number;
  let y: number;
  if (side === "top") {
    x = bb.minX + pos;
    y = bb.minY + gap + def.d / 2;
  } else if (side === "bottom") {
    x = bb.minX + pos;
    y = bb.maxY - gap - def.d / 2;
  } else if (side === "left") {
    y = bb.minY + pos;
    x = bb.minX + gap + def.d / 2;
  } else {
    y = bb.minY + pos;
    x = bb.maxX - gap - def.d / 2;
  }
  return { x, y, rotation: rot };
}

/** Areas in front of doors and passages that furniture must keep clear. */
export function doorClearances(floor: Floor): Vec2[][] {
  const out: Vec2[][] = [];
  for (const f of wallFrames(floor)) {
    for (const o of f.openings) {
      if (o.kind === "fenster") continue;
      const depth = o.kind === "tuer" ? o.width + 0.05 : 0.8;
      const s = o.offset - o.width / 2;
      const e = o.offset + o.width / 2;
      out.push(wallRect(f, s, e, f.wall.thickness + depth * 2));
    }
  }
  return out;
}

export function stageRoom(
  room: RoomGeometry,
  existing: FurnitureItem[],
  style: StagingStyle = "warm",
  custom: FurnitureDef[] = [],
  obstacles: Vec2[][] = [],
  opts: { addKitchen?: boolean } = {},
): FurnitureItem[] {
  const type =
    room.meta.roomType && room.meta.roomType !== "sonstiges" ? room.meta.roomType : detectRoomType(room.meta.name);
  const recipe = RECIPES[type];
  if (!recipe) return [];
  const poly = room.inner;
  const bb = boundsOf(poly);
  const palette = STYLES[style];
  // The main wall is a long side; prefer the top/left so the room reads naturally.
  const main: Side = bb.w >= bb.h ? "top" : "left";

  const placed: FurnitureItem[] = [];
  const occupied: Vec2[][] = [
    ...existing.filter((it) => it.h >= 0.05).map((it) => rectCorners(it.x, it.y, it.w, it.d, it.rotation)),
    ...obstacles,
  ];
  const steps = recipe(room.area);
  // open plan: the living room also gets the kitchen row when the flat has no kitchen
  if (opts.addKitchen && type === "wohnen") steps.splice(3, 0, kitchenStep(room.area));

  const fits = (x: number, y: number, w: number, d: number, rotation: number, ignoreOverlap: boolean) => {
    // shrink by 1 cm so items standing flush against a wall count as inside
    const corners = rectCorners(x, y, Math.max(0.02, w - 0.02), Math.max(0.02, d - 0.02), rotation);
    if (!corners.every((c) => pointInPolygon(c, poly))) return null;
    if (!ignoreOverlap && occupied.some((o) => rectsOverlap(o, corners))) return null;
    return corners;
  };

  const resolveSides = (m: Side) => {
    const s1: Side = m === "top" || m === "bottom" ? "left" : "top";
    return { main: m, opposite: OPPOSITE[m], side1: s1, side2: OPPOSITE[s1] };
  };
  let sides = resolveSides(main);
  const ALL: Side[] = ["top", "right", "bottom", "left"];
  const offsets = [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2];

  type Cand = { x: number; y: number; rotation: number; side?: Side; along: number[]; across: number[] };

  steps.forEach((step, index) => {
    const def = findDef(step.defId, custom) ?? CATALOG[0];
    const isRug = def.h < 0.05;
    const cands: Cand[] = [];
    if (step.besideOf !== undefined || step.frontOf !== undefined) {
      const ref = placed[(step.besideOf ?? step.frontOf)!];
      if (!ref) return;
      const r = (ref.rotation * Math.PI) / 180;
      const dir = { x: Math.cos(r), y: Math.sin(r) };
      const front = { x: -Math.sin(r), y: Math.cos(r) };
      if (step.besideOf !== undefined) {
        const shift = (ref.w / 2 + def.w / 2 + 0.05) * (step.besideSide ?? 1);
        const backShift = (def.d - ref.d) / 2; // align backs
        cands.push({
          x: ref.x + dir.x * shift + front.x * backShift,
          y: ref.y + dir.y * shift + front.y * backShift,
          rotation: ref.rotation,
          along: [0, 0.1],
          across: [0],
        });
      } else {
        const dist = ref.d / 2 + (step.dist ?? 0.4) + def.d / 2;
        cands.push({
          x: ref.x + front.x * dist,
          y: ref.y + front.y * dist,
          rotation: ref.rotation,
          along: [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6],
          across: [0, 0.15, -0.15],
        });
      }
    } else if (step.wall === "center") {
      const along = step.along ?? 0.5;
      const horizontal = bb.w >= bb.h;
      cands.push({
        x: horizontal ? bb.minX + bb.w * along : bb.minX + bb.w / 2,
        y: horizontal ? bb.minY + bb.h / 2 : bb.minY + bb.h * along,
        rotation: horizontal ? 0 : 90,
        along: offsets,
        across: offsets,
      });
    } else {
      const preferred = sides[step.wall];
      for (const side of [preferred, ...ALL.filter((x) => x !== preferred)]) {
        cands.push({
          ...placeAgainst(side, bb, def, step.along ?? 0.5, step.gap ?? 0.02),
          side,
          along: offsets,
          across: [0],
        });
      }
    }

    for (const c of cands) {
      const r = (c.rotation * Math.PI) / 180;
      for (const off of c.along) {
        for (const off2 of c.across) {
          const x = c.x + Math.cos(r) * off - Math.sin(r) * off2;
          const y = c.y + Math.sin(r) * off + Math.cos(r) * off2;
          const ok = fits(x, y, def.w, def.d, c.rotation, isRug);
          if (!ok) continue;
          placed.push({
            id: uid(),
            defId: def.id,
            x,
            y,
            rotation: c.rotation,
            w: def.w,
            d: def.d,
            h: def.h,
            elevation: def.elevation,
            color: step.textile !== undefined ? palette.textiles[step.textile % palette.textiles.length] : undefined,
          });
          if (!isRug) occupied.push(ok);
          // the first piece defines the room's orientation for the rest of the recipe
          if (index === 0 && c.side) sides = resolveSides(c.side);
          return;
        }
      }
    }
  });
  return placed;
}

/**
 * The room that gets a kitchen row when "furnish all" runs: the largest living room
 * (at least 18 m²), but only if the floor has no kitchen of its own.
 */
export function kitchenHostRoom(rooms: RoomGeometry[]): string | null {
  const typeOf = (r: RoomGeometry) =>
    r.meta.roomType && r.meta.roomType !== "sonstiges" ? r.meta.roomType : detectRoomType(r.meta.name);
  if (rooms.some((r) => typeOf(r) === "kueche" || typeOf(r) === "wohnkueche")) return null;
  const living = rooms.filter((r) => typeOf(r) === "wohnen" && r.area >= 18).sort((a, b) => b.area - a.area);
  return living[0]?.meta.id ?? null;
}

/** Items whose center lies inside the room polygon. */
export function itemsInRoom(room: RoomGeometry, items: FurnitureItem[]) {
  return items.filter((it) => pointInPolygon({ x: it.x, y: it.y }, room.outline));
}
