import type { FurnitureCategory, FurnitureDef, FurniturePart } from "@/model/types";

// Every model is built from primitives in footprint-relative coordinates:
// x/y/w/d are fractions of the item's width/depth (y=0 is the back, against the wall),
// z/h are fractions of its height. The same parts draw the 2D symbol and the 3D model.

const C = {
  oak: "#b08657",
  oakLight: "#cfae84",
  walnut: "#6b4a33",
  white: "#f2efe9",
  offwhite: "#e6e0d6",
  linen: "#d9cfbf",
  sand: "#c9b79c",
  grey: "#8d8a86",
  darkgrey: "#4a4846",
  black: "#262524",
  green: "#4f6b4a",
  sage: "#93a38a",
  terracotta: "#b8684a",
  blue: "#4c6378",
  chrome: "#c8cbcf",
  ceramic: "#f7f7f5",
  glass: "#bcd6de",
  plant: "#3f6b3a",
  pot: "#a26a4b",
  rug: "#cbbba3",
};

const box = (
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  h: number,
  color: string,
  extra: Partial<FurniturePart> = {},
): FurniturePart => ({ shape: "box", x, y, w, d, z, h, color, ...extra });

const cyl = (
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  h: number,
  color: string,
  extra: Partial<FurniturePart> = {},
): FurniturePart => ({ shape: "cylinder", x, y, w, d, z, h, color, ...extra });

const sphere = (
  x: number,
  y: number,
  w: number,
  d: number,
  z: number,
  h: number,
  color: string,
  extra: Partial<FurniturePart> = {},
): FurniturePart => ({
  shape: "sphere",
  x,
  y,
  w,
  d,
  z,
  h,
  color,
  ...extra,
});

/** Four legs inset from the footprint corners. */
function legs(inset: number, size: number, h: number, color: string, round = false): FurniturePart[] {
  const make = round ? cyl : box;
  return [
    [inset, inset],
    [1 - inset, inset],
    [1 - inset, 1 - inset],
    [inset, 1 - inset],
  ].map(([x, y]) => make(x, y, size, size, 0, h, color, { plan: false, finish: "metall" }));
}

function def(
  id: string,
  name: string,
  category: FurnitureCategory,
  w: number,
  d: number,
  h: number,
  parts: FurniturePart[],
  elevation?: number,
): FurnitureDef {
  return { id, name, category, w, d, h, parts, elevation };
}

function bed(id: string, name: string, w: number, color = C.linen): FurnitureDef {
  return def(id, name, "schlafen", w, 2.1, 1.0, [
    box(0.5, 0.52, 1, 0.96, 0, 0.3, C.oak),
    box(0.5, 0.55, 0.96, 0.88, 0.3, 0.22, C.white, { finish: "stoff" }),
    box(0.5, 0.04, 1, 0.08, 0, 1, C.sand, { finish: "stoff" }),
    ...(w > 1.2
      ? [
          box(0.27, 0.16, 0.38, 0.12, 0.52, 0.12, C.offwhite, { finish: "stoff" }),
          box(0.73, 0.16, 0.38, 0.12, 0.52, 0.12, C.offwhite, { finish: "stoff" }),
        ]
      : [box(0.5, 0.16, 0.7, 0.12, 0.52, 0.12, C.offwhite, { finish: "stoff" })]),
    box(0.5, 0.68, 1.0, 0.62, 0.52, 0.04, color, { finish: "stoff" }),
    box(0.5, 0.92, 1.02, 0.12, 0.45, 0.1, C.sand, { finish: "stoff" }),
  ]);
}

function sofa(id: string, name: string, w: number, color: string): FurnitureDef {
  const arm = 0.18 / w;
  return def(id, name, "wohnen", w, 0.95, 0.82, [
    box(0.5, 0.5, 1, 1, 0.05, 0.38, color, { finish: "stoff" }),
    box(0.5, 0.1, 1, 0.2, 0.05, 0.95, color, { finish: "stoff" }),
    box(arm / 2, 0.55, arm, 0.9, 0.05, 0.7, color, { finish: "stoff" }),
    box(1 - arm / 2, 0.55, arm, 0.9, 0.05, 0.7, color, { finish: "stoff" }),
    box(0.5, 0.58, 1 - 2 * arm, 0.65, 0.43, 0.16, color, { finish: "stoff" }),
    ...legs(0.05, 0.04, 0.06, C.black),
  ]);
}

function chair(id: string, name: string, color: string, category: FurnitureCategory = "essen"): FurnitureDef {
  return def(id, name, category, 0.48, 0.52, 0.85, [
    box(0.5, 0.55, 0.92, 0.82, 0.52, 0.06, color, { finish: "stoff" }),
    box(0.5, 0.1, 0.92, 0.1, 0.52, 0.48, color, { finish: "stoff" }),
    ...legs(0.1, 0.06, 0.52, C.walnut, true),
  ]);
}

function diningTable(id: string, name: string, w: number, d: number, round = false): FurnitureDef {
  const top = round ? cyl : box;
  return def(id, name, "essen", w, d, 0.75, [
    top(0.5, 0.5, 1, 1, 0.95, 0.05, C.oak),
    ...(round ? [cyl(0.5, 0.5, 0.12, 0.12, 0, 0.95, C.walnut, { plan: false })] : legs(0.06, 0.06, 0.95, C.walnut)),
  ]);
}

/** Dining table with chairs as one group item. */
function diningSet(id: string, name: string, seats: number): FurnitureDef {
  const tableW = seats <= 4 ? 1.4 : seats <= 6 ? 1.8 : 2.4;
  const w = tableW + 0.2;
  const d = 0.9 + 1.1;
  const parts: FurniturePart[] = [
    box(0.5, 0.5, tableW / w, 0.9 / d, 0.96, 0.04, C.oak),
    ...[
      [0.5 - tableW / w / 2 + 0.06, 0.5 - 0.45 / d + 0.06],
      [0.5 + tableW / w / 2 - 0.06, 0.5 - 0.45 / d + 0.06],
      [0.5 - tableW / w / 2 + 0.06, 0.5 + 0.45 / d - 0.06],
      [0.5 + tableW / w / 2 - 0.06, 0.5 + 0.45 / d - 0.06],
    ].map(([x, y]) => box(x, y, 0.05 / w, 0.05 / d, 0, 0.96, C.walnut, { plan: false })),
  ];
  const perSide = Math.floor(seats / 2);
  for (let i = 0; i < perSide; i++) {
    const cx = 0.5 + ((i + 0.5) / perSide - 0.5) * (tableW / w) * 0.9;
    for (const side of [-1, 1]) {
      const cy = 0.5 + side * (0.45 / d + 0.2 / d);
      parts.push(box(cx, cy, 0.44 / w, 0.42 / d, 0, 0.6, C.linen, { finish: "stoff" }));
      parts.push(box(cx, cy + side * (0.19 / d), 0.44 / w, 0.05 / d, 0.6, 0.45, C.linen, { finish: "stoff" }));
    }
  }
  return def(id, name, "essen", w, d, 0.76, parts);
}

function wardrobe(id: string, name: string, w: number, category: FurnitureCategory = "schlafen"): FurnitureDef {
  const doors = Math.max(2, Math.round(w / 0.5));
  const parts: FurniturePart[] = [box(0.5, 0.5, 1, 1, 0, 1, C.white)];
  for (let i = 1; i < doors; i++) {
    parts.push(box(i / doors, 0.985, 0.004, 0.03, 0.02, 0.96, C.grey, { plan: false }));
  }
  return def(id, name, category, w, 0.62, 2.25, parts);
}

function plant(id: string, name: string, size: number, h: number): FurnitureDef {
  return def(id, name, "deko", size, size, h, [
    cyl(0.5, 0.5, 0.5, 0.5, 0, 0.3, C.pot),
    sphere(0.5, 0.5, 1, 1, 0.3, 0.7, C.plant, { finish: "stoff" }),
  ]);
}

export const CATALOG: FurnitureDef[] = [
  // Wohnen
  sofa("sofa-2", "Sofa 2-Sitzer", 1.7, C.sage),
  sofa("sofa-3", "Sofa 3-Sitzer", 2.3, C.linen),
  def("sofa-ecke", "Ecksofa", "wohnen", 2.8, 1.9, 0.82, [
    box(0.5, 0.25, 1, 0.5, 0.05, 0.38, C.grey, { finish: "stoff" }),
    box(0.84, 0.75, 0.32, 0.5, 0.05, 0.38, C.grey, { finish: "stoff" }),
    box(0.5, 0.05, 1, 0.1, 0.05, 0.95, C.grey, { finish: "stoff" }),
    box(0.97, 0.5, 0.06, 1, 0.05, 0.95, C.grey, { finish: "stoff" }),
    box(0.03, 0.27, 0.06, 0.44, 0.05, 0.7, C.grey, { finish: "stoff" }),
    box(0.47, 0.29, 0.86, 0.33, 0.43, 0.16, C.grey, { finish: "stoff" }),
    box(0.82, 0.72, 0.24, 0.5, 0.43, 0.16, C.grey, { finish: "stoff" }),
  ]),
  def("sessel", "Sessel", "wohnen", 0.85, 0.85, 0.8, [
    box(0.5, 0.5, 1, 1, 0.08, 0.4, C.terracotta, { finish: "stoff" }),
    box(0.5, 0.1, 1, 0.2, 0.08, 0.92, C.terracotta, { finish: "stoff" }),
    box(0.08, 0.55, 0.16, 0.9, 0.08, 0.7, C.terracotta, { finish: "stoff" }),
    box(0.92, 0.55, 0.16, 0.9, 0.08, 0.7, C.terracotta, { finish: "stoff" }),
    ...legs(0.1, 0.05, 0.08, C.walnut, true),
  ]),
  def("couchtisch", "Couchtisch", "wohnen", 1.1, 0.6, 0.4, [
    box(0.5, 0.5, 1, 1, 0.85, 0.15, C.walnut),
    box(0.5, 0.5, 0.9, 0.85, 0.15, 0.08, C.walnut, { plan: false }),
    ...legs(0.05, 0.05, 0.85, C.walnut),
  ]),
  def("couchtisch-rund", "Couchtisch rund", "wohnen", 0.8, 0.8, 0.4, [
    cyl(0.5, 0.5, 1, 1, 0.85, 0.15, C.offwhite),
    cyl(0.5, 0.5, 0.4, 0.4, 0, 0.85, C.offwhite, { plan: false }),
  ]),
  def("beistelltisch", "Beistelltisch", "wohnen", 0.45, 0.45, 0.55, [
    cyl(0.5, 0.5, 1, 1, 0.92, 0.08, C.oak),
    cyl(0.5, 0.5, 0.15, 0.15, 0, 0.92, C.black, { plan: false, finish: "metall" }),
  ]),
  def("tv-board", "TV-Lowboard", "wohnen", 1.8, 0.42, 0.5, [
    box(0.5, 0.5, 1, 1, 0.12, 0.88, C.walnut),
    ...legs(0.04, 0.03, 0.12, C.black),
    box(0.5, 0.2, 0.68, 0.06, 1, 1.25, C.black, { plan: false, finish: "glanz" }),
  ]),
  def("regal", "Bücherregal", "wohnen", 1.0, 0.35, 2.0, [
    box(0.5, 0.5, 1, 1, 0, 1, C.oakLight),
    ...[0.2, 0.4, 0.6, 0.8].map((z) => box(0.5, 0.7, 0.94, 0.5, z, 0.1, C.terracotta, { plan: false })),
  ]),
  def("sideboard", "Sideboard", "wohnen", 1.8, 0.45, 0.8, [
    box(0.5, 0.5, 1, 1, 0.15, 0.85, C.oak),
    ...legs(0.04, 0.03, 0.15, C.black),
  ]),
  def("teppich", "Teppich 200x300", "wohnen", 3.0, 2.0, 0.01, [box(0.5, 0.5, 1, 1, 0, 1, C.rug, { finish: "stoff" })]),
  def("teppich-rund", "Teppich rund", "wohnen", 2.0, 2.0, 0.01, [
    cyl(0.5, 0.5, 1, 1, 0, 1, C.sand, { finish: "stoff" }),
  ]),
  def("kamin", "Kaminofen", "wohnen", 0.6, 0.5, 1.1, [
    box(0.5, 0.5, 1, 1, 0, 1, C.black, { finish: "metall" }),
    box(0.5, 0.98, 0.6, 0.04, 0.35, 0.35, "#e07a2e", { plan: false, finish: "glanz" }),
  ]),
  def("stehlampe", "Stehlampe", "deko", 0.4, 0.4, 1.6, [
    cyl(0.5, 0.5, 0.7, 0.7, 0, 0.03, C.black, { finish: "metall" }),
    cyl(0.5, 0.5, 0.06, 0.06, 0.03, 0.8, C.black, { plan: false, finish: "metall" }),
    cyl(0.5, 0.5, 1, 1, 0.8, 0.2, C.offwhite, { finish: "stoff" }),
  ]),
  plant("pflanze", "Zimmerpflanze", 0.6, 1.3),
  plant("pflanze-gross", "Große Pflanze", 0.9, 1.9),

  // Schlafen
  bed("bett-90", "Einzelbett 90x200", 0.9),
  bed("bett-140", "Bett 140x200", 1.4),
  bed("bett-180", "Doppelbett 180x200", 1.8),
  bed("bett-200", "Boxspring 200x200", 2.0, C.sage),
  def("nachttisch", "Nachttisch", "schlafen", 0.45, 0.4, 0.5, [
    box(0.5, 0.5, 1, 1, 0.15, 0.85, C.oak),
    ...legs(0.08, 0.06, 0.15, C.walnut),
    cyl(0.5, 0.45, 0.4, 0.45, 1, 0.6, C.offwhite, { plan: false, finish: "stoff" }),
  ]),
  wardrobe("schrank-150", "Kleiderschrank 150", 1.5),
  wardrobe("schrank-250", "Kleiderschrank 250", 2.5),
  def("kommode", "Kommode", "schlafen", 1.2, 0.5, 0.85, [
    box(0.5, 0.5, 1, 1, 0.1, 0.9, C.white),
    ...legs(0.05, 0.04, 0.1, C.oak),
  ]),
  def("kinderbett", "Kinderbett", "schlafen", 0.77, 1.47, 0.9, [
    box(0.5, 0.5, 1, 1, 0.2, 0.15, C.white),
    box(0.5, 0.5, 0.92, 0.95, 0.35, 0.12, C.white, { finish: "stoff" }),
    box(0.5, 0.02, 1, 0.04, 0, 1, C.white),
    box(0.5, 0.98, 1, 0.04, 0, 1, C.white),
    box(0.02, 0.5, 0.04, 1, 0.2, 0.8, C.white, { plan: false }),
    box(0.98, 0.5, 0.04, 1, 0.2, 0.8, C.white, { plan: false }),
  ]),

  // Essen
  diningSet("essgruppe-4", "Essgruppe 4 Personen", 4),
  diningSet("essgruppe-6", "Essgruppe 6 Personen", 6),
  diningSet("essgruppe-8", "Essgruppe 8 Personen", 8),
  diningTable("esstisch", "Esstisch 180x90", 1.8, 0.9),
  diningTable("esstisch-rund", "Esstisch rund", 1.2, 1.2, true),
  chair("stuhl", "Stuhl", C.linen),
  def("barhocker", "Barhocker", "kueche", 0.4, 0.4, 0.75, [
    cyl(0.5, 0.5, 1, 1, 0.9, 0.1, C.oak),
    cyl(0.5, 0.5, 0.12, 0.12, 0, 0.9, C.black, { plan: false, finish: "metall" }),
  ]),

  // Küche
  def("kuechenzeile", "Küchenzeile 300", "kueche", 3.0, 0.62, 0.92, [
    box(0.5, 0.5, 1, 1, 0, 0.95, C.white),
    box(0.5, 0.5, 1, 1, 0.95, 0.05, C.darkgrey, { finish: "glanz" }),
    box(0.25, 0.5, 0.2, 0.75, 1.0, 0.01, C.black, { finish: "glanz" }),
    box(0.7, 0.5, 0.18, 0.7, 0.96, 0.05, C.chrome, { finish: "metall" }),
  ]),
  def("kuechenzeile-l", "Küche L-Form", "kueche", 2.8, 2.2, 0.92, [
    box(0.5, 0.14, 1, 0.28, 0, 0.95, C.white),
    box(0.5, 0.14, 1, 0.28, 0.95, 0.05, C.darkgrey, { finish: "glanz" }),
    box(0.89, 0.64, 0.22, 0.72, 0, 0.95, C.white),
    box(0.89, 0.64, 0.22, 0.72, 0.95, 0.05, C.darkgrey, { finish: "glanz" }),
    box(0.3, 0.14, 0.2, 0.2, 1.0, 0.01, C.black, { finish: "glanz" }),
    box(0.89, 0.6, 0.16, 0.25, 0.96, 0.05, C.chrome, { finish: "metall" }),
  ]),
  def("kochinsel", "Kochinsel", "kueche", 2.2, 0.95, 0.92, [
    box(0.5, 0.5, 1, 1, 0, 0.95, C.walnut),
    box(0.5, 0.5, 1.02, 1.04, 0.95, 0.05, C.offwhite, { finish: "glanz" }),
    box(0.5, 0.5, 0.32, 0.6, 1.0, 0.01, C.black, { finish: "glanz" }),
  ]),
  def("kuehlschrank", "Kühlschrank hoch", "kueche", 0.6, 0.62, 2.0, [
    box(0.5, 0.5, 1, 1, 0, 1, C.white, { finish: "glanz" }),
  ]),
  def("haengeschrank", "Hängeschrank 120", "kueche", 1.2, 0.35, 0.7, [box(0.5, 0.5, 1, 1, 0, 1, C.white)], 1.45),

  // Bad
  def("badewanne", "Badewanne", "bad", 1.7, 0.75, 0.58, [
    box(0.5, 0.5, 1, 1, 0, 1, C.ceramic, { finish: "glanz" }),
    box(0.5, 0.5, 0.88, 0.76, 0.35, 0.66, C.glass, { finish: "glas" }),
  ]),
  def("dusche", "Dusche 90x90", "bad", 0.9, 0.9, 2.0, [
    box(0.5, 0.5, 1, 1, 0, 0.02, C.ceramic, { finish: "glanz" }),
    box(0.99, 0.5, 0.02, 1, 0.02, 0.98, C.glass, { finish: "glas" }),
    box(0.5, 0.99, 1, 0.02, 0.02, 0.98, C.glass, { finish: "glas" }),
    cyl(0.5, 0.5, 0.15, 0.15, 0.019, 0.002, C.chrome, { finish: "metall" }),
  ]),
  def("wc", "WC", "bad", 0.38, 0.56, 0.8, [
    box(0.5, 0.15, 1, 0.3, 0.45, 0.55, C.ceramic, { finish: "glanz" }),
    cyl(0.5, 0.6, 0.95, 0.75, 0.0, 0.5, C.ceramic, { finish: "glanz" }),
  ]),
  def("waschtisch", "Waschtisch", "bad", 0.8, 0.48, 0.85, [
    box(0.5, 0.5, 1, 1, 0.45, 0.55, C.oak),
    box(0.5, 0.55, 0.6, 0.6, 0.98, 0.04, C.ceramic, { finish: "glanz" }),
    box(0.5, 0.06, 0.04, 0.12, 1.0, 0.15, C.chrome, { plan: false, finish: "metall" }),
  ]),
  def("doppelwaschtisch", "Doppelwaschtisch", "bad", 1.4, 0.5, 0.85, [
    box(0.5, 0.5, 1, 1, 0.45, 0.55, C.walnut),
    box(0.27, 0.55, 0.32, 0.6, 0.98, 0.04, C.ceramic, { finish: "glanz" }),
    box(0.73, 0.55, 0.32, 0.6, 0.98, 0.04, C.ceramic, { finish: "glanz" }),
  ]),
  def("waschmaschine", "Waschmaschine", "bad", 0.6, 0.6, 0.85, [
    box(0.5, 0.5, 1, 1, 0, 1, C.white, { finish: "glanz" }),
    cyl(0.5, 0.99, 0.6, 0.02, 0.25, 0.5, C.grey, { plan: false }),
  ]),

  // Arbeiten
  def("schreibtisch", "Schreibtisch", "arbeiten", 1.4, 0.7, 0.75, [
    box(0.5, 0.5, 1, 1, 0.95, 0.05, C.oakLight),
    ...legs(0.04, 0.04, 0.95, C.black),
    box(0.5, 0.2, 0.4, 0.05, 1, 0.55, C.black, { plan: false, finish: "glanz" }),
  ]),
  chair("buerostuhl", "Bürostuhl", C.darkgrey, "arbeiten"),

  // Außen
  def("loungeset", "Lounge-Set Terrasse", "aussen", 2.2, 1.8, 0.75, [
    box(0.5, 0.12, 1, 0.24, 0, 0.5, C.offwhite, { finish: "stoff" }),
    box(0.1, 0.6, 0.2, 0.6, 0, 0.5, C.offwhite, { finish: "stoff" }),
    box(0.55, 0.6, 0.35, 0.3, 0, 0.45, C.oak),
  ]),
  def("gartentisch", "Gartentisch mit Stühlen", "aussen", 1.6, 1.6, 0.75, [
    cyl(0.5, 0.5, 0.6, 0.6, 0.95, 0.05, C.oak),
    cyl(0.5, 0.5, 0.08, 0.08, 0, 0.95, C.darkgrey, { plan: false }),
    ...[
      [0.5, 0.1],
      [0.9, 0.5],
      [0.5, 0.9],
      [0.1, 0.5],
    ].map(([x, y]) => box(x, y, 0.25, 0.25, 0, 0.6, C.darkgrey)),
  ]),
];

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  wohnen: "Wohnen",
  schlafen: "Schlafen",
  essen: "Essen",
  kueche: "Küche",
  bad: "Bad",
  arbeiten: "Arbeiten",
  deko: "Deko & Licht",
  aussen: "Außen",
  eigene: "Eigene Möbel",
};

export function findDef(id: string, custom: FurnitureDef[] = []): FurnitureDef | undefined {
  return custom.find((d) => d.id === id) ?? CATALOG.find((d) => d.id === id);
}

export const COLOR_SWATCHES = Object.values(C);
