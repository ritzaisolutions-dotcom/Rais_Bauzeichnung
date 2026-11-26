import type { FurnitureCategory, FurnitureChild, FurnitureDef, FurniturePart, PartShape } from "@/model/types";
import manifest from "./models.generated.json";

// Two kinds of furniture:
// 1. Detailed procedural pieces, described in meters below and converted to footprint-relative parts.
//    The same parts draw the 2D symbol and build the 3D model.
// 2. Photorealistic CC0 models from Poly Haven (public/models/*.glb). Their parts are a simple
//    footprint for the technical 2D view; 3D and the presentation view use the real model.

export const C = {
  oak: "#b8895a",
  oakLight: "#d4b48a",
  walnut: "#6a4630",
  ash: "#e2d3b9",
  white: "#f3f1ec",
  offwhite: "#e8e2d7",
  linen: "#dcd2c2",
  sand: "#c8b59a",
  grey: "#8f8b86",
  stone: "#b9b4ac",
  darkgrey: "#4a4846",
  black: "#232221",
  green: "#4b6a45",
  sage: "#97a68c",
  terracotta: "#b6674a",
  blue: "#4c6378",
  chrome: "#c9ccd0",
  brass: "#b59456",
  ceramic: "#f8f8f6",
  glass: "#c9e0e6",
  rug: "#cbbba3",
  leaf: "#3f6b3a",
};

type Opt = Partial<Omit<FurniturePart, "shape" | "x" | "y" | "w" | "d" | "z" | "h" | "color">>;

/** Builds parts in meters: x/y from the back-left corner of the footprint, z from the floor. */
class Builder {
  parts: FurniturePart[] = [];
  constructor(
    readonly W: number,
    readonly D: number,
    readonly H: number,
  ) {}
  private add(
    shape: PartShape,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: string,
    o: Opt,
  ) {
    this.parts.push({
      shape,
      x: (x0 + x1) / 2 / this.W,
      y: (y0 + y1) / 2 / this.D,
      w: Math.abs(x1 - x0) / this.W,
      d: Math.abs(y1 - y0) / this.D,
      z: z0 / this.H,
      h: Math.abs(z1 - z0) / this.H,
      color,
      ...o,
    });
    return this;
  }
  /** Any shape by its bounding box in meters. */
  part(
    shape: PartShape,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: string,
    o: Opt = {},
  ) {
    return this.add(shape, x0, x1, y0, y1, z0, z1, color, o);
  }
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, o: Opt = {}) {
    return this.add("box", x0, x1, y0, y1, z0, z1, color, o);
  }
  cyl(cx: number, cy: number, dia: number, z0: number, z1: number, color: string, o: Opt = {}) {
    return this.add("cylinder", cx - dia / 2, cx + dia / 2, cy - dia / 2, cy + dia / 2, z0, z1, color, o);
  }
  ell(cx: number, cy: number, dx: number, dy: number, z0: number, z1: number, color: string, o: Opt = {}) {
    return this.add("cylinder", cx - dx / 2, cx + dx / 2, cy - dy / 2, cy + dy / 2, z0, z1, color, o);
  }
  sphere(cx: number, cy: number, dia: number, z0: number, z1: number, color: string, o: Opt = {}) {
    return this.add("sphere", cx - dia / 2, cx + dia / 2, cy - dia / 2, cy + dia / 2, z0, z1, color, o);
  }
  cone(cx: number, cy: number, dia: number, z0: number, z1: number, color: string, o: Opt = {}) {
    return this.add("cone", cx - dia / 2, cx + dia / 2, cy - dia / 2, cy + dia / 2, z0, z1, color, o);
  }
  /** Four legs inset from the corners. */
  legs(inset: number, size: number, z1: number, color: string, round = false, o: Opt = {}) {
    for (const [x, y] of [
      [inset, inset],
      [this.W - inset, inset],
      [this.W - inset, this.D - inset],
      [inset, this.D - inset],
    ]) {
      if (round) this.cyl(x, y, size, 0, z1, color, { plan: false, ...o });
      else this.box(x - size / 2, x + size / 2, y - size / 2, y + size / 2, 0, z1, color, { plan: false, ...o });
    }
    return this;
  }
}

function piece(
  id: string,
  name: string,
  category: FurnitureCategory,
  W: number,
  D: number,
  H: number,
  build: (b: Builder) => void,
  extra: Partial<FurnitureDef> = {},
): FurnitureDef {
  const b = new Builder(W, D, H);
  build(b);
  return { id, name, category, w: W, d: D, h: H, parts: b.parts, ...extra };
}

const metal = { finish: "metall" as const };
const fabric = { finish: "stoff" as const };
const wood = { finish: "holz" as const };
const gloss = { finish: "glanz" as const };

// ------------------------------------------------------------------ Wohnen

const cushionOpt = { finish: "stoff" as const };

function sofa(id: string, name: string, W: number, seats: number, color: string, accent: string): FurnitureDef {
  const D = 0.95;
  return piece(id, name, "wohnen", W, D, 0.86, (b) => {
    const arm = 0.2;
    // wooden base and tapered legs
    b.legs(0.09, 0.04, 0.08, C.walnut, true, wood);
    b.box(0.04, W - 0.04, 0.05, D - 0.05, 0.08, 0.13, C.walnut, { ...wood, plan: false });
    // upholstered frame: back and arms
    b.part("cushion", 0.01, W - 0.01, 0, 0.22, 0.12, 0.6, color, cushionOpt);
    b.part("cushion", 0, arm, 0.02, D, 0.12, 0.62, color, cushionOpt);
    b.part("cushion", W - arm, W, 0.02, D, 0.12, 0.62, color, cushionOpt);
    b.part("cushion", arm - 0.01, W - arm + 0.01, 0.18, D - 0.02, 0.12, 0.24, color, { ...cushionOpt, plan: false });
    const cw = (W - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) {
      const x0 = arm + i * cw + 0.006;
      const x1 = arm + (i + 1) * cw - 0.006;
      b.part("cushion", x0, x1, 0.22, D - 0.01, 0.23, 0.45, color, cushionOpt); // seat
      b.part("cushion", x0 + 0.01, x1 - 0.01, 0.07, 0.3, 0.42, 0.86, color, { ...cushionOpt, tilt: 12, plan: false }); // back
    }
    // scatter cushions in the accent colour
    b.part("pillow", arm + 0.03, arm + 0.48, 0.25, 0.4, 0.42, 0.86, accent, {
      ...fabric,
      tilt: 18,
      yaw: 10,
      plan: false,
      fixed: true,
    });
    b.part("pillow", W - arm - 0.48, W - arm - 0.03, 0.25, 0.4, 0.42, 0.86, accent, {
      ...fabric,
      tilt: 18,
      yaw: -10,
      plan: false,
      fixed: true,
    });
    // knitted throw over one arm
    b.part("throw", W - arm - 0.06, W + 0.01, 0.32, 0.78, 0.36, 0.66, C.offwhite, {
      ...fabric,
      plan: false,
      fixed: true,
    });
  });
}

const cornerSofa = piece("sofa-ecke", "Ecksofa", "wohnen", 2.9, 1.9, 0.86, (b) => {
  const c = C.stone;
  b.legs(0.09, 0.04, 0.08, C.walnut, true, wood);
  b.box(0.04, 2.86, 0.05, 0.9, 0.08, 0.13, C.walnut, { ...wood, plan: false });
  b.box(1.85, 2.86, 0.9, 1.85, 0.08, 0.13, C.walnut, { ...wood, plan: false });
  b.part("cushion", 0, 2.9, 0, 0.24, 0.12, 0.62, c, cushionOpt); // back
  b.part("cushion", 2.66, 2.9, 0.2, 1.9, 0.12, 0.62, c, cushionOpt); // right back
  b.part("cushion", 0, 0.2, 0.02, 0.95, 0.12, 0.62, c, cushionOpt); // left arm
  b.part("cushion", 0.2, 2.66, 0.22, 0.95, 0.12, 0.24, c, { ...cushionOpt, plan: false });
  b.part("cushion", 1.86, 2.66, 0.95, 1.9, 0.12, 0.24, c, { ...cushionOpt, plan: false });
  for (let i = 0; i < 3; i++)
    b.part("cushion", 0.21 + i * 0.555, 0.76 + i * 0.555, 0.24, 0.94, 0.23, 0.45, c, cushionOpt);
  b.part("cushion", 1.88, 2.64, 0.24, 0.94, 0.23, 0.45, c, cushionOpt);
  b.part("cushion", 1.88, 2.64, 0.96, 1.88, 0.23, 0.45, c, cushionOpt);
  for (let i = 0; i < 4; i++)
    b.part("cushion", 0.22 + i * 0.6, 0.8 + i * 0.6, 0.06, 0.3, 0.42, 0.86, c, {
      ...cushionOpt,
      tilt: 12,
      plan: false,
    });
  b.part("cushion", 2.6, 2.86, 1.0, 1.7, 0.42, 0.86, c, { ...cushionOpt, plan: false });
  b.part("pillow", 0.24, 0.7, 0.26, 0.42, 0.42, 0.86, C.terracotta, {
    ...fabric,
    tilt: 18,
    yaw: 10,
    plan: false,
    fixed: true,
  });
  b.part("pillow", 2.1, 2.55, 0.26, 0.42, 0.42, 0.86, C.sand, {
    ...fabric,
    tilt: 18,
    yaw: -8,
    plan: false,
    fixed: true,
  });
});

const tvBoard = piece("tv-board", "TV-Lowboard mit TV", "wohnen", 1.8, 0.42, 1.3, (b) => {
  b.legs(0.05, 0.03, 0.12, C.black, false, metal);
  b.box(0, 1.8, 0, 0.42, 0.12, 0.5, C.walnut, wood);
  b.box(0.01, 0.89, 0.41, 0.425, 0.14, 0.48, C.walnut, { ...wood, plan: false });
  b.box(0.91, 1.79, 0.41, 0.425, 0.14, 0.48, C.walnut, { ...wood, plan: false });
  b.box(0.68, 1.12, 0.12, 0.3, 0.5, 0.51, C.black, { ...metal, plan: false }); // TV foot
  b.box(0.87, 0.93, 0.15, 0.19, 0.5, 0.62, C.black, { ...metal, plan: false });
  b.box(0.3, 1.5, 0.12, 0.16, 0.6, 1.3, C.black, { ...gloss, plan: false }); // 55" TV
});

const sideboard = piece("sideboard", "Sideboard", "wohnen", 1.8, 0.45, 0.8, (b) => {
  b.legs(0.06, 0.035, 0.16, C.black, true, metal);
  b.box(0, 1.8, 0, 0.45, 0.16, 0.8, C.oak, wood);
  for (let i = 0; i < 3; i++) {
    b.box(0.015 + i * 0.6, 0.585 + i * 0.6, 0.445, 0.46, 0.18, 0.78, C.oak, { ...wood, plan: false });
    b.box(0.27 + i * 0.6, 0.33 + i * 0.6, 0.46, 0.475, 0.66, 0.68, C.brass, { ...metal, plan: false });
  }
});

const bookshelf = piece("regal", "Bücherregal", "wohnen", 1.0, 0.35, 2.0, (b) => {
  b.box(0, 0.025, 0, 0.35, 0, 2, C.oakLight, wood);
  b.box(0.975, 1, 0, 0.35, 0, 2, C.oakLight, wood);
  b.box(0, 1, 0, 0.02, 0, 2, C.oakLight, { ...wood, plan: false });
  const books = [C.terracotta, C.blue, C.sand, C.green, C.offwhite, C.darkgrey, C.brass];
  for (let s = 0; s < 6; s++) {
    const z = s * 0.39;
    b.box(0, 1, 0, 0.35, z, z + 0.025, C.oakLight, { ...wood, plan: s === 5 });
    if (s < 5) {
      let x = 0.04;
      let k = s;
      while (x < 0.9) {
        const w = 0.025 + ((k * 37) % 5) * 0.008;
        const h = 0.22 + ((k * 13) % 4) * 0.03;
        if ((k * 7) % 9 !== 0)
          b.box(x, x + w, 0.04, 0.3, z + 0.025, z + 0.025 + h, books[k % books.length], { plan: false });
        x += w + 0.004;
        k++;
      }
    }
  }
});

const rug = (id: string, name: string, W: number, D: number, color: string, round = false) =>
  piece(id, name, "wohnen", W, D, 0.012, (b) => {
    if (round) b.cyl(W / 2, D / 2, W, 0, 0.012, color, { ...fabric });
    else {
      b.box(0, W, 0, D, 0, 0.012, color, { ...fabric });
      b.box(0.12, W - 0.12, 0.12, D - 0.12, 0.0121, 0.0122, color === C.rug ? C.sand : C.offwhite, {
        ...fabric,
        plan: false,
      });
    }
  });

const fireplace = piece("kamin", "Kaminofen", "wohnen", 0.6, 0.5, 1.15, (b) => {
  b.cyl(0.3, 0.25, 0.5, 0, 0.05, C.darkgrey, metal);
  b.box(0.05, 0.55, 0.02, 0.48, 0.05, 1.1, C.black, metal);
  b.box(0.12, 0.48, 0.48, 0.5, 0.35, 0.75, "#2a1a10", { ...gloss, plan: false });
  b.box(0.16, 0.44, 0.47, 0.49, 0.38, 0.5, "#ff9a3c", { finish: "licht", plan: false });
  b.cyl(0.3, 0.25, 0.14, 1.1, 1.15, C.black, metal);
});

const floorLamp = piece("stehlampe", "Stehlampe", "deko", 0.45, 0.45, 1.65, (b) => {
  b.cyl(0.225, 0.225, 0.3, 0, 0.025, C.black, metal);
  b.cyl(0.225, 0.225, 0.025, 0.025, 1.3, C.brass, { ...metal, plan: false });
  b.cyl(0.225, 0.225, 0.42, 1.25, 1.62, C.linen, { ...fabric });
  b.cyl(0.225, 0.225, 0.3, 1.27, 1.29, "#fff4dc", { finish: "licht", plan: false });
});

// ------------------------------------------------------------------ Schlafen

function bed(id: string, name: string, mattressW: number, duvet: string, throwColor: string): FurnitureDef {
  const W = mattressW + 0.12;
  const D = 2.18;
  return piece(id, name, "schlafen", W, D, 1.05, (b) => {
    b.legs(0.1, 0.05, 0.08, C.walnut, false, wood);
    b.box(0, W, 0.08, D, 0.08, 0.34, C.oak, wood); // frame
    b.box(0, W, 0, 0.1, 0.08, 1.05, C.linen, { ...fabric, round: 0.4 }); // headboard
    const channels = Math.max(4, Math.round(W / 0.22));
    for (let i = 0; i < channels; i++) {
      const x0 = (i * W) / channels + 0.008;
      const x1 = ((i + 1) * W) / channels - 0.008;
      b.box(x0, x1, 0.08, 0.13, 0.36, 1.0, C.linen, { ...fabric, round: 1, plan: false });
    }
    b.box(0.06, W - 0.06, 0.12, D - 0.04, 0.3, 0.52, C.white, { ...fabric, round: 0.35, fixed: true }); // mattress
    // duvet draped over the mattress, hanging down at both sides and the foot end
    b.part("duvet", 0.015, W - 0.015, 0.66, D + 0.015, 0.33, 0.61, duvet, { ...fabric, fixed: true });
    // turned-down top edge of the duvet
    b.part("throw", 0.03, W - 0.03, 0.54, 0.8, 0.45, 0.635, C.offwhite, { ...fabric, fixed: true, plan: false });
    const pw = mattressW > 1.2 ? (mattressW - 0.14) / 2 : mattressW - 0.16;
    const n = mattressW > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x0 = 0.1 + i * (pw + 0.06);
      b.part("pillow", x0, x0 + pw, 0.13, 0.55, 0.5, 0.72, C.offwhite, { ...fabric, tilt: 10, fixed: true });
    }
    // decorative cushion in the accent colour
    const cw = Math.min(0.5, mattressW * 0.35);
    b.part("pillow", W / 2 - cw / 2, W / 2 + cw / 2, 0.5, 0.68, 0.6, 0.76, throwColor, {
      ...fabric,
      tilt: 6,
      plan: false,
    });
    // throw across the foot end
    b.part("throw", 0, W, D - 0.66, D - 0.22, 0.38, 0.68, throwColor, fabric);
  });
}

const nightstand = piece("nachttisch", "Nachttisch mit Lampe", "schlafen", 0.45, 0.4, 0.95, (b) => {
  b.legs(0.04, 0.025, 0.18, C.walnut, true, wood);
  b.box(0, 0.45, 0, 0.4, 0.18, 0.5, C.oak, wood);
  b.box(0.02, 0.43, 0.395, 0.41, 0.3, 0.48, C.oak, { ...wood, plan: false });
  b.box(0.19, 0.26, 0.41, 0.42, 0.38, 0.4, C.brass, { ...metal, plan: false });
  b.cyl(0.22, 0.2, 0.12, 0.5, 0.52, C.brass, { ...metal, plan: false });
  b.cyl(0.22, 0.2, 0.015, 0.52, 0.72, C.brass, { ...metal, plan: false });
  b.cyl(0.22, 0.2, 0.24, 0.7, 0.92, C.offwhite, fabric);
});

function wardrobe(id: string, name: string, W: number, category: FurnitureCategory = "schlafen"): FurnitureDef {
  const D = 0.62;
  const H = 2.25;
  return piece(id, name, category, W, D, H, (b) => {
    b.box(0.02, W - 0.02, 0.02, D - 0.04, 0, 0.08, C.darkgrey); // plinth
    b.box(0, W, 0, D - 0.02, 0.08, H, C.white);
    const doors = Math.max(2, Math.round(W / 0.5));
    const dw = W / doors;
    for (let i = 0; i < doors; i++) {
      const x0 = i * dw + 0.002;
      const x1 = (i + 1) * dw - 0.002;
      b.box(x0, x1, D - 0.022, D, 0.085, H - 0.005, C.white, { plan: false });
      const hx = i % 2 === 0 ? x1 - 0.05 : x0 + 0.05;
      b.box(hx - 0.008, hx + 0.008, D, D + 0.02, 0.85, 1.45, C.brass, { ...metal, plan: false });
    }
  });
}

const dresser = piece("kommode", "Kommode", "schlafen", 1.2, 0.5, 0.85, (b) => {
  b.legs(0.05, 0.03, 0.12, C.oak, true, wood);
  b.box(0, 1.2, 0, 0.5, 0.12, 0.85, C.white);
  for (let r = 0; r < 3; r++) {
    const z0 = 0.14 + r * 0.235;
    b.box(0.01, 1.19, 0.495, 0.512, z0, z0 + 0.225, C.white, { plan: false });
    b.box(0.5, 0.7, 0.512, 0.525, z0 + 0.1, z0 + 0.125, C.brass, { ...metal, plan: false });
  }
});

const crib = piece("kinderbett", "Kinderbett", "schlafen", 0.77, 1.47, 0.9, (b) => {
  b.legs(0.03, 0.04, 0.9, C.white, false);
  b.box(0.04, 0.73, 0.04, 1.43, 0.25, 0.38, C.white, { ...fabric, round: 0.4 });
  b.box(0.06, 0.71, 0.5, 1.4, 0.38, 0.44, C.sage, { ...fabric, round: 0.6 });
  for (const y of [0.02, 1.45]) b.box(0, 0.77, y - 0.02, y + 0.02, 0.2, 0.9, C.white, { plan: false });
  for (let i = 0; i < 12; i++) {
    const y = 0.1 + i * 0.11;
    b.cyl(0.02, y, 0.02, 0.38, 0.88, C.white, { plan: false });
    b.cyl(0.75, y, 0.02, 0.38, 0.88, C.white, { plan: false });
  }
});

// ------------------------------------------------------------------ Essen

function diningTable(id: string, name: string, W: number, D: number): FurnitureDef {
  return piece(id, name, "essen", W, D, 0.76, (b) => {
    b.box(0, W, 0, D, 0.72, 0.76, C.oak, { ...wood, round: 0.2 });
    b.box(0.08, W - 0.08, 0.08, D - 0.08, 0.64, 0.72, C.oak, { ...wood, plan: false });
    b.legs(0.1, 0.07, 0.72, C.walnut, false, wood);
  });
}

const roundTable = piece("esstisch-rund", "Esstisch rund", "essen", 1.2, 1.2, 0.76, (b) => {
  b.cyl(0.6, 0.6, 1.2, 0.72, 0.76, C.oak, wood);
  b.cyl(0.6, 0.6, 0.16, 0.05, 0.72, C.walnut, { ...wood, plan: false });
  b.cyl(0.6, 0.6, 0.55, 0, 0.05, C.walnut, { ...wood, plan: false });
});

/** Dining set: table plus real model chairs around it. */
function diningSet(id: string, name: string, seats: number): FurnitureDef {
  const tableW = seats <= 4 ? 1.4 : seats <= 6 ? 1.8 : 2.4;
  const tableD = 0.9;
  const W = tableW + 0.1;
  const D = tableD + 1.0;
  const children: FurnitureChild[] = [{ defId: `esstisch-${Math.round(tableW * 100)}`, x: 0, y: 0, rotation: 0 }];
  const perSide = Math.floor(seats / 2);
  for (let i = 0; i < perSide; i++) {
    const x = ((i + 0.5) / perSide - 0.5) * tableW * 0.92;
    children.push({ defId: "stuhl", x, y: -(tableD / 2 + 0.12), rotation: 0 });
    children.push({ defId: "stuhl", x, y: tableD / 2 + 0.12, rotation: 180 });
  }
  return { id, name, category: "essen", w: W, d: D, h: 0.97, parts: [], children };
}

// ------------------------------------------------------------------ Küche

const lacquer = { finish: "lack" as const };
const stoneTop = { finish: "stein" as const };
const steel = { finish: "edelstahl" as const };
const FRONT = "#ebe8e2";
const WORKTOP = "#d9d5ce";

/** Worktop slab with rectangular cut-outs (e.g. for an undermount sink). */
function worktop(
  b: Builder,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  holes: { x0: number; x1: number; y0: number; y1: number }[] = [],
) {
  let x = x0;
  for (const h of [...holes].sort((p, q) => p.x0 - q.x0)) {
    if (h.x0 > x) b.box(x, h.x0, y0, y1, z0, z1, WORKTOP, stoneTop);
    if (h.y0 > y0) b.box(h.x0, h.x1, y0, h.y0, z0, z1, WORKTOP, stoneTop);
    if (h.y1 < y1) b.box(h.x0, h.x1, h.y1, y1, z0, z1, WORKTOP, stoneTop);
    x = h.x1;
  }
  if (x < x1) b.box(x, x1, y0, y1, z0, z1, WORKTOP, stoneTop);
}

type Unit = "doors" | "drawers" | "oven" | "dishwasher";

/** Base cabinets along x with fronts facing +y: plinth, carcass, lacquered fronts with shadow gaps, handles. */
function baseRun(b: Builder, x0: number, x1: number, depth: number, units: Unit[]) {
  b.box(x0, x1, 0, depth - 0.07, 0, 0.1, C.darkgrey, { plan: false });
  b.box(x0, x1, 0, depth - 0.02, 0.1, 0.88, "#d2cec7", { plan: false });
  const fw = (x1 - x0) / units.length;
  const gap = 0.003;
  const fy0 = depth - 0.02;
  const fy1 = depth;
  units.forEach((u, i) => {
    const a = x0 + i * fw + gap;
    const e = x0 + (i + 1) * fw - gap;
    const handle = (z: number) =>
      b.box(a + 0.06, e - 0.06, fy1, fy1 + 0.018, z - 0.006, z + 0.006, C.black, { ...metal, plan: false });
    if (u === "drawers") {
      const rows = [
        [0.1, 0.38],
        [0.38, 0.63],
        [0.63, 0.88],
      ];
      for (const [z0, z1] of rows) {
        b.box(a, e, fy0, fy1, z0 + gap, z1 - gap, FRONT, { ...lacquer, plan: false });
        handle(z1 - 0.05);
      }
    } else if (u === "oven") {
      b.box(a, e, fy0, fy1, 0.1 + gap, 0.2, FRONT, { ...lacquer, plan: false });
      b.box(a, e, fy0, fy1, 0.2 + gap, 0.79, C.black, { finish: "glanz", plan: false });
      b.box(a + 0.04, e - 0.04, fy1 - 0.002, fy1 + 0.001, 0.3, 0.66, "#3a3d40", { finish: "glas", plan: false });
      b.box(a + 0.05, e - 0.05, fy1, fy1 + 0.03, 0.72, 0.735, C.chrome, { ...steel, plan: false });
      b.box(a, e, fy0, fy1, 0.79 + gap, 0.88 - gap, C.black, { finish: "glanz", plan: false });
    } else {
      b.box(a, e, fy0, fy1, 0.1 + gap, 0.88 - gap, FRONT, { ...lacquer, plan: false });
      handle(0.83);
    }
  });
  b.box(x0, x1, 0, depth, 0.88, 0.92, WORKTOP, { ...stoneTop, plan: false });
}

function cooktop(b: Builder, x0: number, y0: number) {
  b.box(x0, x0 + 0.58, y0, y0 + 0.51, 0.92, 0.926, C.black, { finish: "glanz" });
  for (const [dx, dy, dia] of [
    [0.15, 0.14, 0.18],
    [0.43, 0.14, 0.2],
    [0.15, 0.37, 0.21],
    [0.43, 0.37, 0.16],
  ]) {
    b.cyl(x0 + dx, y0 + dy, dia, 0.926, 0.9262, "#55585c", { plan: true });
    b.cyl(x0 + dx, y0 + dy, dia - 0.012, 0.9262, 0.9264, C.black, { finish: "glanz", plan: false });
  }
  b.box(x0 + 0.18, x0 + 0.4, y0 + 0.47, y0 + 0.49, 0.926, 0.9265, "#6b6f73", { plan: false });
}

/** Counter decoration that makes a top view read as a real kitchen. */
function counterProps(b: Builder, x: number, y: number) {
  b.box(x, x + 0.4, y, y + 0.27, 0.92, 0.94, C.oakLight, { ...wood, round: 0.2 }); // cutting board
  b.part("basin", x + 0.55, x + 0.85, y + 0.02, y + 0.32, 0.92, 1.0, C.white, { finish: "keramik" }); // fruit bowl
  for (const [fx, fy, col] of [
    [0.66, 0.13, "#e88a2a"],
    [0.75, 0.2, "#c8402e"],
    [0.68, 0.23, "#e9a43a"],
    [0.76, 0.11, "#9ab83a"],
  ] as const)
    b.sphere(x + fx, y + fy, 0.075, 0.95, 1.02, col, { finish: "glanz" });
}

const kitchen = piece("kuechenzeile", "Küchenzeile 300", "kueche", 3.0, 0.62, 2.3, (b) => {
  const D = 0.62;
  baseRun(b, 0, 3.0, D, ["drawers", "oven", "drawers", "dishwasher", "doors"]);
  // worktop with the sink cut-out, sink, mixer
  b.parts.pop(); // replace the plain worktop of baseRun with one that has a hole
  worktop(b, 0, 3.0, 0, D, 0.88, 0.92, [{ x0: 1.86, x1: 2.34, y0: 0.12, y1: 0.5 }]);
  b.part("sink", 1.84, 2.36, 0.1, 0.52, 0.71, 0.922, C.chrome, steel);
  b.part("faucet", 2.08, 2.12, 0.03, 0.32, 0.92, 1.3, C.chrome, { finish: "chrom" });
  cooktop(b, 0.61, 0.06);
  counterProps(b, 0.05, 0.25);
  b.cyl(2.62, 0.2, 0.17, 0.92, 1.12, C.chrome, steel); // kettle
  b.cyl(2.62, 0.2, 0.05, 1.12, 1.15, C.black, { plan: false });
  b.cyl(2.85, 0.12, 0.07, 0.92, 1.2, "#6d7a3a", { finish: "glas" }); // oil bottle
  // tiled splashback
  b.box(0, 3.0, 0, 0.012, 0.92, 1.45, "#f1efea", { finish: "glanz", plan: false });
  for (let z = 1.0; z < 1.45; z += 0.075) b.box(0, 3.0, 0.012, 0.013, z, z + 0.002, "#d7d3cc", { plan: false });
  // wall cabinets with a chimney hood above the cooktop
  for (let i = 0; i < 5; i++) {
    if (i === 1) continue;
    b.box(i * 0.6, (i + 1) * 0.6, 0, 0.33, 1.48, 2.2, "#d2cec7", { plan: false });
    b.box(i * 0.6 + 0.003, (i + 1) * 0.6 - 0.003, 0.33, 0.35, 1.483, 2.197, FRONT, { ...lacquer, plan: false });
  }
  b.box(0.61, 1.19, 0, 0.5, 1.6, 1.66, C.chrome, { ...steel, plan: false });
  b.box(0.8, 1.0, 0, 0.26, 1.66, 2.3, C.chrome, { ...steel, plan: false });
});

const kitchenL = piece("kuechenzeile-l", "Küche L-Form", "kueche", 2.8, 2.2, 0.95, (b) => {
  const D = 0.62;
  baseRun(b, 0, 2.8, D, ["drawers", "oven", "drawers", "doors"]);
  b.parts.pop();
  worktop(b, 0, 2.8, 0, D, 0.88, 0.92);
  cooktop(b, 0.71, 0.06);
  counterProps(b, 1.45, 0.25);
  // side run along y, fronts facing -x (into the room)
  const X0 = 2.8 - D;
  b.box(X0 + 0.07, 2.8, D, 2.2, 0, 0.1, C.darkgrey, { plan: false });
  b.box(X0 + 0.02, 2.8, D, 2.2, 0.1, 0.88, "#d2cec7", { plan: false });
  const n = 3;
  const fw = (2.2 - D) / n;
  for (let i = 0; i < n; i++) {
    const y0 = D + i * fw + 0.003;
    const y1 = D + (i + 1) * fw - 0.003;
    b.box(X0, X0 + 0.02, y0, y1, 0.103, 0.877, FRONT, { ...lacquer, plan: false });
    b.box(X0 - 0.018, X0, y0 + 0.06, y1 - 0.06, 0.824, 0.836, C.black, { ...metal, plan: false });
  }
  worktop(b, X0, 2.8, D, 2.2, 0.88, 0.92, [{ x0: X0 + 0.1, x1: X0 + 0.5, y0: 1.2, y1: 1.7 }]);
  b.part("sink", X0 + 0.08, X0 + 0.52, 1.18, 1.72, 0.71, 0.922, C.chrome, steel);
  b.part("faucet", 2.62, 2.78, 1.43, 1.47, 0.92, 1.28, C.chrome, { finish: "chrom", yaw: 90 });
});

const island = piece("kochinsel", "Kochinsel", "kueche", 2.2, 1.0, 0.95, (b) => {
  // cabinets on the working side (back, -y), seating overhang on the front
  b.box(0.06, 2.14, 0.1, 0.7, 0, 0.1, C.darkgrey, { plan: false });
  b.box(0.06, 2.14, 0.02, 0.7, 0.1, 0.9, C.walnut, { ...wood, plan: false });
  for (let i = 0; i < 3; i++) {
    const a = 0.06 + i * 0.693 + 0.003;
    const e = 0.06 + (i + 1) * 0.693 - 0.003;
    b.box(a, e, 0, 0.02, 0.103, 0.897, C.walnut, { ...wood, plan: false });
    b.box(a + 0.08, e - 0.08, -0.018, 0, 0.84, 0.852, C.black, { ...metal, plan: false });
  }
  // stone top with waterfall sides
  b.box(0, 2.2, 0, 1.0, 0.9, 0.95, WORKTOP, stoneTop);
  b.box(0, 0.05, 0, 1.0, 0, 0.9, WORKTOP, { ...stoneTop, plan: false });
  b.box(2.15, 2.2, 0, 1.0, 0, 0.9, WORKTOP, { ...stoneTop, plan: false });
  b.box(0.81, 1.39, 0.08, 0.59, 0.95, 0.956, C.black, { finish: "glanz" });
  for (const [dx, dy] of [
    [0.95, 0.22],
    [1.25, 0.22],
    [0.95, 0.45],
    [1.25, 0.45],
  ])
    b.cyl(dx, dy, 0.19, 0.956, 0.9562, "#55585c");
  b.part("basin", 1.7, 2.0, 0.6, 0.9, 0.95, 1.03, C.white, { finish: "keramik" });
  b.sphere(1.8, 0.72, 0.08, 0.98, 1.05, "#c8402e", { finish: "glanz" });
  b.sphere(1.88, 0.78, 0.08, 0.98, 1.05, "#e88a2a", { finish: "glanz" });
  b.box(0.15, 0.55, 0.62, 0.9, 0.95, 0.97, C.oakLight, { ...wood, round: 0.2 });
});

const fridge = piece("kuehlschrank", "Kühlschrank hoch", "kueche", 0.6, 0.66, 2.0, (b) => {
  b.box(0, 0.6, 0, 0.62, 0, 2.0, C.chrome, { finish: "edelstahl" });
  b.box(0.004, 0.596, 0.62, 0.64, 0.02, 1.2, C.chrome, { finish: "edelstahl", plan: false });
  b.box(0.004, 0.596, 0.62, 0.64, 1.21, 1.99, C.chrome, { finish: "edelstahl", plan: false });
  b.box(0.52, 0.535, 0.64, 0.66, 0.85, 1.15, C.darkgrey, { ...metal, plan: false });
  b.box(0.52, 0.535, 0.64, 0.66, 1.25, 1.55, C.darkgrey, { ...metal, plan: false });
});

const barstool = piece("barhocker", "Barhocker", "kueche", 0.42, 0.42, 0.8, (b) => {
  b.cyl(0.21, 0.21, 0.38, 0, 0.015, C.black, metal);
  b.cyl(0.21, 0.21, 0.04, 0.015, 0.7, C.black, { ...metal, plan: false });
  b.cyl(0.21, 0.21, 0.3, 0.3, 0.31, C.black, { ...metal, plan: false });
  b.cyl(0.21, 0.21, 0.42, 0.7, 0.78, C.walnut, { ...wood });
});

// ------------------------------------------------------------------ Bad

const ceramic = { finish: "keramik" as const };
const chrome = { finish: "chrom" as const };

const bathtub = piece("badewanne", "Badewanne", "bad", 1.7, 0.75, 0.78, (b) => {
  b.part("tub", 0, 1.7, 0, 0.75, 0, 0.6, C.ceramic, ceramic);
  // drain and wall-mounted mixer at the foot end, spout pointing into the tub
  b.cyl(1.42, 0.375, 0.05, 0.14, 0.146, C.chrome, { ...chrome, plan: false });
  b.part("faucet", 1.6, 1.65, 0.3, 0.45, 0.6, 0.78, C.chrome, { ...chrome, yaw: 90, plan: false });
});

const shower = piece("dusche", "Dusche 90x90", "bad", 0.9, 0.9, 2.15, (b) => {
  b.part("tray", 0, 0.9, 0, 0.9, 0, 0.05, C.ceramic, ceramic);
  b.cyl(0.45, 0.45, 0.11, 0.03, 0.033, C.chrome, chrome);
  b.box(0.885, 0.9, 0, 0.9, 0.05, 2.0, C.glass, { finish: "glas" });
  b.box(0, 0.6, 0.885, 0.9, 0.05, 2.0, C.glass, { finish: "glas" });
  for (const z of [0.3, 1.7]) b.box(0.876, 0.909, 0.84, 0.88, z, z + 0.08, C.chrome, { ...chrome, plan: false });
  b.box(0.885, 0.9, 0.0, 0.02, 0.05, 2.0, C.chrome, { ...chrome, plan: false });
  // rain shower with arm, hand shower bar and thermostat
  b.cyl(0.45, 0.4, 0.3, 2.07, 2.082, C.chrome, { ...chrome, plan: false });
  b.box(0.44, 0.46, 0.02, 0.4, 2.09, 2.11, C.chrome, { ...chrome, plan: false });
  b.cyl(0.45, 0.025, 0.025, 0.9, 2.1, C.chrome, { ...chrome, plan: false });
  b.box(0.33, 0.57, 0.02, 0.07, 1.0, 1.08, C.chrome, { ...chrome, plan: false });
});

const wc = piece("wc", "WC wandhängend", "bad", 0.38, 0.6, 1.1, (b) => {
  b.box(0.0, 0.38, 0, 0.07, 0.0, 1.1, C.white, { finish: "glanz", plan: false }); // pre-wall
  b.box(0.11, 0.27, 0.07, 0.085, 0.95, 1.06, C.chrome, { ...chrome, plan: false }); // flush plate
  b.part("toilet", 0.01, 0.37, 0.06, 0.6, 0.24, 0.44, C.ceramic, ceramic);
});

function vanity(id: string, name: string, W: number, basins: number): FurnitureDef {
  return piece(id, name, "bad", W, 0.5, 1.9, (b) => {
    b.box(0, W, 0, 0.48, 0.4, 0.82, C.oak, wood);
    for (let i = 0; i < basins; i++) {
      const x0 = (i * W) / basins + 0.01;
      const x1 = ((i + 1) * W) / basins - 0.01;
      b.box(x0, x1, 0.478, 0.49, 0.42, 0.8, C.oak, { ...wood, plan: false });
      const cx = (x0 + x1) / 2;
      b.box(cx - 0.08, cx + 0.08, 0.49, 0.5, 0.75, 0.765, C.black, { ...metal, plan: false });
    }
    b.box(0, W, 0, 0.5, 0.82, 0.85, C.white, { finish: "glanz" });
    for (let i = 0; i < basins; i++) {
      const cx = ((i + 0.5) * W) / basins;
      // countertop vessel basin with a tall mixer behind it
      b.part("basin", cx - 0.22, cx + 0.22, 0.13, 0.46, 0.85, 0.99, C.ceramic, ceramic);
      b.part("faucet", cx - 0.022, cx + 0.022, 0.02, 0.21, 0.85, 1.16, C.black, { ...metal });
    }
    // mirror with a thin frame
    b.box(0.04, W - 0.04, 0, 0.025, 1.12, 1.9, C.darkgrey, { ...metal, plan: false });
    b.box(0.055, W - 0.055, 0.02, 0.03, 1.135, 1.885, "#d9dee2", { ...chrome, plan: false });
  });
}

const towelRail = piece("handtuchheizkoerper", "Handtuchheizkörper mit Handtüchern", "bad", 0.55, 0.14, 1.3, (b) => {
  b.cyl(0.03, 0.04, 0.03, 0.15, 1.3, C.chrome, chrome);
  b.cyl(0.52, 0.04, 0.03, 0.15, 1.3, C.chrome, chrome);
  for (let z = 0.2; z < 1.28; z += 0.11)
    b.box(0.03, 0.52, 0.03, 0.05, z, z + 0.018, C.chrome, { ...chrome, plan: false });
  b.part("towel", 0.06, 0.49, 0.045, 0.11, 0.62, 1.23, C.offwhite, fabric);
  b.part("towel", 0.12, 0.43, 0.08, 0.14, 0.75, 1.24, C.sand, { ...fabric, plan: false });
});

const bathMat = piece("badematte", "Badematte", "bad", 0.8, 0.5, 0.015, (b) => {
  b.part("throw", 0, 0.8, 0, 0.5, 0, 0.015, C.offwhite, fabric);
});

const washer = piece("waschmaschine", "Waschmaschine", "bad", 0.6, 0.6, 0.85, (b) => {
  b.box(0, 0.6, 0, 0.6, 0, 0.85, C.white, gloss);
  b.box(0.02, 0.58, 0.6, 0.61, 0.74, 0.83, C.offwhite, { plan: false });
  b.ell(0.3, 0.605, 0.36, 0.02, 0.22, 0.58, C.chrome, { ...metal, plan: false });
  b.ell(0.3, 0.615, 0.28, 0.02, 0.26, 0.54, "#5d6d74", { finish: "glas", plan: false });
});

// ------------------------------------------------------------------ Arbeiten

const desk = piece("schreibtisch", "Schreibtisch", "arbeiten", 1.4, 0.7, 1.25, (b) => {
  b.box(0, 1.4, 0, 0.7, 0.72, 0.75, C.oakLight, wood);
  for (const x of [0.05, 1.35]) {
    b.box(x - 0.02, x + 0.02, 0.05, 0.65, 0, 0.03, C.black, { ...metal, plan: false });
    b.box(x - 0.02, x + 0.02, 0.33, 0.37, 0, 0.72, C.black, { ...metal, plan: false });
  }
  b.box(0.55, 0.85, 0.12, 0.25, 0.75, 0.76, C.darkgrey, { ...metal, plan: false });
  b.box(0.68, 0.72, 0.16, 0.2, 0.76, 0.9, C.darkgrey, { ...metal, plan: false });
  b.box(0.4, 1.0, 0.14, 0.17, 0.88, 1.24, C.black, { ...gloss, plan: false });
  b.box(0.5, 0.92, 0.38, 0.52, 0.75, 0.765, C.offwhite, { plan: false });
  b.box(1.05, 1.15, 0.42, 0.54, 0.75, 0.76, C.offwhite, { plan: false });
});

const officeChair = piece("buerostuhl", "Bürostuhl", "arbeiten", 0.62, 0.62, 1.1, (b) => {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = 0.31 + Math.cos(a) * 0.26;
    const y = 0.31 + Math.sin(a) * 0.26;
    b.sphere(x, y, 0.05, 0, 0.05, C.black, { plan: false });
  }
  b.cyl(0.31, 0.31, 0.56, 0.05, 0.08, C.black, { ...metal, plan: false });
  b.cyl(0.31, 0.31, 0.05, 0.08, 0.42, C.chrome, { ...metal, plan: false });
  b.box(0.08, 0.54, 0.12, 0.58, 0.42, 0.5, C.darkgrey, { ...fabric, round: 0.6 });
  b.box(0.1, 0.52, 0.04, 0.12, 0.55, 1.1, C.darkgrey, { ...fabric, round: 0.6, tilt: 8 });
  b.box(0.04, 0.08, 0.2, 0.5, 0.58, 0.62, C.black, { plan: false });
  b.box(0.54, 0.58, 0.2, 0.5, 0.58, 0.62, C.black, { plan: false });
});

// ------------------------------------------------------------------ Außen

const lounge = piece("loungeset", "Lounge-Set Terrasse", "aussen", 2.2, 1.8, 0.75, (b) => {
  b.box(0, 2.2, 0, 0.8, 0, 0.36, C.darkgrey, { finish: "metall" });
  b.box(0.04, 2.16, 0.04, 0.78, 0.36, 0.48, C.offwhite, { ...fabric, round: 0.6 });
  for (let i = 0; i < 3; i++)
    b.box(0.06 + i * 0.7, 0.72 + i * 0.7, 0.02, 0.22, 0.46, 0.75, C.offwhite, {
      ...fabric,
      round: 0.9,
      tilt: 10,
      plan: false,
    });
  b.box(0.75, 1.45, 1.1, 1.7, 0, 0.32, C.oak, wood);
});

// ------------------------------------------------------------------ CC0 models

type ManifestEntry = { label: string; file: string; w: number; d: number; h: number; source: string };
const M = manifest as Record<string, ManifestEntry>;

/**
 * A furniture def backed by a real 3D model. rotY turns the model so its front faces +y (into the room);
 * the footprint dims are swapped accordingly. The parts are a simple outline for the technical 2D view.
 */
function modelPiece(
  id: string,
  asset: string,
  name: string,
  category: FurnitureCategory,
  rotY: number,
  outline: (b: Builder) => void,
  extra: Partial<FurnitureDef> = {},
): FurnitureDef {
  const m = M[asset];
  const swap = Math.abs(rotY % 180) === 90;
  const W = swap ? m.d : m.w;
  const D = swap ? m.w : m.d;
  const def = piece(id, name, category, W, D, m.h, outline, extra);
  def.model = { url: m.file, w: m.w, d: m.d, h: m.h, rotY, credit: m.source };
  return def;
}

const outlineBox = (color: string) => (b: Builder) => b.box(0, b.W, 0, b.D, 0, b.H, color);
const outlineRound = (color: string) => (b: Builder) => b.cyl(b.W / 2, b.D / 2, Math.min(b.W, b.D), 0, b.H, color);
const outlineChair = (color: string) => (b: Builder) => {
  b.box(0.04, b.W - 0.04, 0.12, b.D - 0.02, 0, b.H * 0.45, color, fabric);
  b.box(0.04, b.W - 0.04, 0, 0.14, 0, b.H, color, fabric);
};

const MODEL_PIECES: FurnitureDef[] = [
  modelPiece("sessel", "mid_century_lounge_chair", "Loungesessel Leder", "wohnen", 0, outlineChair("#7a5234")),
  modelPiece("sessel-armlehne", "modern_arm_chair_01", "Armlehnsessel", "wohnen", 0, outlineChair("#2d2b29")),
  modelPiece("couchtisch", "modern_coffee_table_01", "Couchtisch Beton/Eiche", "wohnen", 90, outlineBox("#9d978e")),
  modelPiece(
    "couchtisch-rund",
    "coffee_table_round_01",
    "Couchtisch rund Marmor",
    "wohnen",
    0,
    outlineRound("#d9d6d0"),
  ),
  modelPiece("beistelltisch", "side_table_01", "Beistelltisch Holz", "wohnen", 0, outlineBox("#b98a55")),
  modelPiece("sideboard-rillen", "modern_wooden_cabinet", "Sideboard Rillenfront", "wohnen", 0, outlineBox("#6a4630")),
  modelPiece("regal-wuerfel", "wooden_display_shelves_01", "Würfelregal", "wohnen", 90, outlineBox("#c9a47a")),
  modelPiece("regal-industrial", "steel_frame_shelves_03", "Regal Industrial", "arbeiten", 0, outlineBox("#5a4a3a")),
  modelPiece("kommode-metall", "drawer_cabinet", "Kommode Holz/Metall", "schlafen", 0, outlineBox("#b98a55")),
  modelPiece("stuhl", "dining_chair_02", "Esszimmerstuhl Leder", "essen", 0, outlineChair("#3a2c24")),
  modelPiece("pflanze", "potted_plant_02", "Zimmerpflanze", "deko", 0, outlineRound(C.leaf)),
  modelPiece("pflanze-gross", "potted_plant_01", "Pflanze groß", "deko", 0, outlineRound(C.leaf)),
  modelPiece("sukkulente", "potted_plant_04", "Sukkulente", "deko", 0, outlineRound(C.sage)),
  modelPiece("vase", "ceramic_vase_01", "Keramikvase", "deko", 0, outlineRound(C.white)),
  modelPiece("dekokissen", "throw_pillows_01", "Dekokissen (2)", "deko", 0, outlineBox(C.terracotta)),
  modelPiece("gartentisch", "outdoor_table_chair_set_01", "Bistro-Set", "aussen", 90, outlineBox(C.oak)),
  modelPiece("pendelleuchte", "modern_ceiling_lamp_01", "Pendelleuchte", "deko", 0, outlineRound(C.white), {
    elevation: 1.5,
  }),
];

export const CATALOG: FurnitureDef[] = [
  // Wohnen
  sofa("sofa-2", "Sofa 2-Sitzer", 1.8, 2, C.sage, C.offwhite),
  sofa("sofa-3", "Sofa 3-Sitzer", 2.3, 3, C.linen, C.terracotta),
  cornerSofa,
  tvBoard,
  sideboard,
  bookshelf,
  rug("teppich", "Teppich 200×300", 3.0, 2.0, C.rug),
  rug("teppich-rund", "Teppich rund", 2.0, 2.0, C.sand, true),
  fireplace,
  floorLamp,
  // Schlafen
  bed("bett-90", "Einzelbett 90×200", 0.9, C.offwhite, C.sage),
  bed("bett-140", "Bett 140×200", 1.4, C.offwhite, C.terracotta),
  bed("bett-180", "Doppelbett 180×200", 1.8, C.offwhite, C.sand),
  bed("bett-200", "Boxspring 200×200", 2.0, C.offwhite, C.blue),
  nightstand,
  wardrobe("schrank-150", "Kleiderschrank 150", 1.5),
  wardrobe("schrank-250", "Kleiderschrank 250", 2.5),
  dresser,
  crib,
  // Essen
  diningSet("essgruppe-4", "Essgruppe 4 Personen", 4),
  diningSet("essgruppe-6", "Essgruppe 6 Personen", 6),
  diningSet("essgruppe-8", "Essgruppe 8 Personen", 8),
  diningTable("esstisch", "Esstisch 180×90", 1.8, 0.9),
  diningTable("esstisch-140", "Esstisch 140×90", 1.4, 0.9),
  diningTable("esstisch-180", "Esstisch 180×90 (Set)", 1.8, 0.9),
  diningTable("esstisch-240", "Esstisch 240×90", 2.4, 0.9),
  roundTable,
  // Küche
  kitchen,
  kitchenL,
  island,
  fridge,
  barstool,
  // Bad
  bathtub,
  shower,
  wc,
  vanity("waschtisch", "Waschtisch mit Spiegel", 0.8, 1),
  vanity("doppelwaschtisch", "Doppelwaschtisch mit Spiegel", 1.4, 2),
  towelRail,
  bathMat,
  washer,
  // Arbeiten
  desk,
  officeChair,
  // Außen
  lounge,
  // Echte 3D-Modelle
  ...MODEL_PIECES,
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

/** Catalog entries shown in the library (hides internal parts of composites). */
export const LIBRARY = CATALOG.filter(
  (d) => d.id !== "esstisch-140" && d.id !== "esstisch-180" && d.id !== "esstisch-240",
);

export const COLOR_SWATCHES = [
  C.linen,
  C.offwhite,
  C.sand,
  C.stone,
  C.grey,
  C.darkgrey,
  C.sage,
  C.green,
  C.terracotta,
  C.blue,
  C.oak,
  C.walnut,
];
