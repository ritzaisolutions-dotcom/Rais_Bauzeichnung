import type { FloorMaterial, FurnitureDef, FurnitureItem, FurniturePart, RoomType } from "./types";

export interface FloorMaterialDef {
  label: string;
  base: string;
  /** Secondary colour for plank/tile lines. */
  line: string;
  pattern: "planks" | "tiles" | "plain" | "deck";
  /** Plank or tile size in meters. */
  size: number;
}

export const FLOOR_MATERIALS: Record<FloorMaterial, FloorMaterialDef> = {
  parkett_eiche: { label: "Parkett Eiche", base: "#b98c5e", line: "#9c7148", pattern: "planks", size: 0.2 },
  parkett_hell: { label: "Parkett hell", base: "#d8bf98", line: "#bfa27a", pattern: "planks", size: 0.2 },
  parkett_dunkel: { label: "Parkett dunkel", base: "#7a5638", line: "#5e4029", pattern: "planks", size: 0.2 },
  fliese_hell: { label: "Fliese hell", base: "#dcd8d0", line: "#c4bfb5", pattern: "tiles", size: 0.6 },
  fliese_grau: { label: "Fliese grau", base: "#a29d96", line: "#8b867f", pattern: "tiles", size: 0.6 },
  beton: { label: "Sichtestrich", base: "#b4b1ab", line: "#a5a29c", pattern: "plain", size: 1 },
  teppich: { label: "Teppichboden", base: "#cfc4b2", line: "#c2b7a5", pattern: "plain", size: 1 },
  terrasse: { label: "Terrassendielen", base: "#a99a86", line: "#8a7c69", pattern: "deck", size: 0.15 },
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  wohnen: "Wohnen",
  schlafen: "Schlafen",
  kind: "Kinderzimmer",
  bad: "Bad",
  wc: "WC",
  kueche: "Küche",
  essen: "Essen",
  flur: "Flur",
  arbeiten: "Arbeiten / Zimmer",
  abstell: "Abstellraum",
  hwr: "HWR",
  ankleide: "Ankleide",
  balkon: "Balkon / Terrasse",
  sonstiges: "Sonstiges",
};

/** Guesses the room type from a German room name. */
export function detectRoomType(name: string): RoomType {
  const n = name.toLowerCase();
  if (/wohn|living|lounge/.test(n)) return "wohnen";
  if (/schlaf|eltern/.test(n)) return "schlafen";
  if (/kind/.test(n)) return "kind";
  if (/\bwc\b|gäste|gaeste/.test(n)) return "wc";
  if (/bad|dusch/.test(n)) return "bad";
  if (/küche|kueche|koch/.test(n)) return "kueche";
  if (/ess/.test(n)) return "essen";
  if (/flur|diele|stg|treppe|eingang/.test(n)) return "flur";
  if (/büro|buero|arbeit|zimmer|gast/.test(n)) return "arbeiten";
  if (/abst|lager/.test(n)) return "abstell";
  if (/hwr|hauswirt|technik/.test(n)) return "hwr";
  if (/ankl|garder/.test(n)) return "ankleide";
  if (/balkon|terrass|loggia|garten/.test(n)) return "balkon";
  return "sonstiges";
}

export function defaultMaterialFor(type: RoomType): FloorMaterial {
  switch (type) {
    case "bad":
    case "wc":
    case "hwr":
      return "fliese_hell";
    case "balkon":
      return "terrasse";
    case "abstell":
      return "beton";
    default:
      return "parkett_eiche";
  }
}

export type StagingStyle = "skandinavisch" | "modern" | "klassisch" | "warm";

export const STYLES: Record<StagingStyle, { label: string; floor: FloorMaterial; textiles: string[]; wood: string }> = {
  skandinavisch: {
    label: "Skandinavisch",
    floor: "parkett_hell",
    textiles: ["#e7e1d6", "#a9b5a0", "#d9cfbf", "#c9b79c"],
    wood: "#d6b98f",
  },
  modern: {
    label: "Modern",
    floor: "beton",
    textiles: ["#5b5a58", "#8d8a86", "#2f2e2d", "#c9c4bb"],
    wood: "#3b3632",
  },
  klassisch: {
    label: "Klassisch",
    floor: "parkett_dunkel",
    textiles: ["#4c6378", "#b8684a", "#d9cfbf", "#7b5d46"],
    wood: "#6b4a33",
  },
  warm: {
    label: "Warm & wohnlich",
    floor: "parkett_eiche",
    textiles: ["#4f6b4a", "#d9cfbf", "#c9a77c", "#8a6a50"],
    wood: "#b08657",
  },
};

/** Resolves the colour of a part, applying the item's colour override to textile parts. */
export function partColor(part: FurniturePart, def: FurnitureDef, item?: Pick<FurnitureItem, "color">): string {
  if (!item?.color) return part.color;
  const hasTextile = def.parts.some((p) => p.finish === "stoff");
  if (part.fixed) return part.color;
  if (hasTextile) return part.finish === "stoff" ? item.color : part.color;
  return part.color === def.parts[0]?.color ? item.color : part.color;
}
