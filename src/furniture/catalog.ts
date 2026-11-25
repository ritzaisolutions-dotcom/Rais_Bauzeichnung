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

function sofa(id: string, name: string, W: number, seats: number, color: string, accent: string): FurnitureDef {
  const D = 0.95;
  return piece(id, name, "wohnen", W, D, 0.84, (b) => {
    const arm = 0.2;
    b.legs(0.08, 0.035, 0.1, C.black, true, metal);
    b.box(0.02, W - 0.02, 0.04, D - 0.04, 0.1, 0.22, color, { ...fabric, round: 0.3 }); // plinth
    b.box(0, arm, 0.02, D, 0.1, 0.62, color, { ...fabric, round: 0.6 }); // arms
    b.box(W - arm, W, 0.02, D, 0.1, 0.62, color, { ...fabric, round: 0.6 });
    b.box(arm - 0.02, W - arm + 0.02, 0, 0.24, 0.1, 0.62, color, { ...fabric, round: 0.4 }); // back frame
    const cw = (W - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) {
      const x0 = arm + i * cw + 0.008;
      const x1 = arm + (i + 1) * cw - 0.008;
      b.box(x0, x1, 0.22, D - 0.02, 0.22, 0.43, color, { ...fabric, round: 0.7 }); // seat cushion
      b.box(x0, x1, 0.08, 0.3, 0.42, 0.84, color, { ...fabric, round: 0.9, tilt: 10, plan: false }); // back cushion
    }
    // throw pillows
    b.box(arm + 0.04, arm + 0.48, 0.24, 0.38, 0.42, 0.86, accent, {
      ...fabric,
      round: 1,
      tilt: 14,
      yaw: 8,
      plan: false,
      fixed: true,
    });
    b.box(W - arm - 0.48, W - arm - 0.04, 0.24, 0.38, 0.42, 0.86, accent, {
      ...fabric,
      round: 1,
      tilt: 14,
      yaw: -8,
      plan: false,
      fixed: true,
    });
  });
}

const cornerSofa = piece("sofa-ecke", "Ecksofa", "wohnen", 2.9, 1.9, 0.84, (b) => {
  const c = C.stone;
  const f = { ...fabric, round: 0.5 };
  b.legs(0.08, 0.035, 0.1, C.black, true, metal);
  b.box(0, 2.9, 0, 0.25, 0.1, 0.64, c, f); // back
  b.box(2.65, 2.9, 0, 1.9, 0.1, 0.64, c, f); // right back
  b.box(0, 0.2, 0, 0.95, 0.1, 0.62, c, { ...fabric, round: 0.7 }); // left arm
  b.box(0.2, 2.65, 0.25, 0.95, 0.1, 0.24, c, f);
  b.box(1.85, 2.65, 0.95, 1.9, 0.1, 0.24, c, f);
  for (let i = 0; i < 3; i++)
    b.box(0.21 + i * 0.66, 0.85 + i * 0.66, 0.25, 0.94, 0.24, 0.44, c, { ...fabric, round: 0.8 });
  b.box(1.86, 2.64, 0.96, 1.88, 0.24, 0.44, c, { ...fabric, round: 0.8 });
  for (let i = 0; i < 4; i++)
    b.box(0.22 + i * 0.6, 0.8 + i * 0.6, 0.06, 0.3, 0.43, 0.84, c, { ...fabric, round: 0.9, tilt: 10, plan: false });
  b.box(2.6, 2.84, 1.0, 1.6, 0.43, 0.84, c, { ...fabric, round: 0.9, plan: false });
  b.box(0.26, 0.7, 0.27, 0.4, 0.42, 0.86, C.terracotta, { ...fabric, round: 1, tilt: 14, yaw: 10, plan: false });
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
    b.box(0.03, W - 0.03, 0.62, D - 0.01, 0.4, 0.6, duvet, { ...fabric, round: 0.6, fixed: true }); // duvet
    b.box(0.03, W - 0.03, 0.55, 0.75, 0.52, 0.63, C.white, { ...fabric, round: 0.9, fixed: true }); // folded top
    const pw = mattressW > 1.2 ? (mattressW - 0.12) / 2 : mattressW - 0.2;
    const n = mattressW > 1.2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x0 = 0.1 + i * (pw + 0.04);
      b.box(x0, x0 + pw, 0.14, 0.48, 0.5, 0.72, C.offwhite, { ...fabric, round: 1, tilt: 8, fixed: true });
    }
    b.box(0.0, W, D - 0.55, D - 0.25, 0.58, 0.64, throwColor, { ...fabric, round: 0.8 }); // throw
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

function kitchenRun(b: Builder, x0: number, x1: number, y0: number, y1: number, frontAtMaxY: boolean) {
  const along = x1 - x0;
  b.box(x0, x1, y0, y1, 0, 0.1, C.darkgrey, { plan: false });
  b.box(x0, x1, y0, y1 - 0.02, 0.1, 0.88, C.white);
  const n = Math.max(1, Math.round(along / 0.6));
  const fw = along / n;
  const fy0 = frontAtMaxY ? y1 - 0.02 : y0;
  const fy1 = frontAtMaxY ? y1 : y0 + 0.02;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * fw + 0.002;
    const e = x0 + (i + 1) * fw - 0.002;
    b.box(a, e, fy0, fy1, 0.1, 0.88, C.white, { finish: "glanz", plan: false });
    const hy0 = frontAtMaxY ? fy1 : fy0 - 0.02;
    b.box(a + 0.08, e - 0.08, hy0, hy0 + 0.02, 0.83, 0.845, C.darkgrey, { ...metal, plan: false });
  }
  b.box(x0 - 0.005, x1 + 0.005, y0, y1 + (frontAtMaxY ? 0.02 : 0), 0.88, 0.92, C.stone, { finish: "glanz" });
}

const kitchen = piece("kuechenzeile", "Küchenzeile 300", "kueche", 3.0, 0.62, 2.3, (b) => {
  kitchenRun(b, 0, 3.0, 0, 0.6, true);
  // sink
  b.box(1.85, 2.45, 0.12, 0.5, 0.921, 0.922, C.chrome, { ...metal });
  b.box(1.9, 2.4, 0.16, 0.46, 0.92, 0.925, C.darkgrey, { ...metal, plan: false });
  b.cyl(2.15, 0.07, 0.04, 0.92, 1.22, C.chrome, { ...metal, plan: false });
  b.box(2.13, 2.17, 0.07, 0.26, 1.18, 1.22, C.chrome, { ...metal, plan: false });
  // cooktop
  b.box(0.4, 1.0, 0.08, 0.56, 0.92, 0.926, C.black, { finish: "glanz" });
  for (const [x, y] of [
    [0.55, 0.2],
    [0.85, 0.2],
    [0.55, 0.44],
    [0.85, 0.44],
  ])
    b.cyl(x, y, 0.18, 0.926, 0.927, C.darkgrey, { plan: false });
  // wall cabinets and hood
  b.box(0, 3.0, 0, 0.35, 1.45, 2.15, C.white, { plan: false });
  for (let i = 0; i < 5; i++)
    b.box(i * 0.6 + 0.002, (i + 1) * 0.6 - 0.002, 0.35, 0.37, 1.45, 2.15, C.white, { finish: "glanz", plan: false });
});

const kitchenL = piece("kuechenzeile-l", "Küche L-Form", "kueche", 2.8, 2.2, 0.95, (b) => {
  kitchenRun(b, 0, 2.8, 0, 0.6, true);
  // side leg: build as a second run rotated by drawing along y
  b.box(2.2, 2.8, 0.6, 2.2, 0, 0.1, C.darkgrey, { plan: false });
  b.box(2.2, 2.78, 0.6, 2.2, 0.1, 0.88, C.white);
  for (let i = 0; i < 3; i++) {
    const y0 = 0.6 + i * 0.533 + 0.002;
    b.box(2.18, 2.2, y0, y0 + 0.529, 0.1, 0.88, C.white, { finish: "glanz", plan: false });
  }
  b.box(2.18, 2.805, 0.6, 2.2, 0.88, 0.92, C.stone, { finish: "glanz" });
  b.box(0.7, 1.3, 0.08, 0.56, 0.92, 0.926, C.black, { finish: "glanz" });
  b.box(2.3, 2.7, 1.2, 1.8, 0.921, 0.922, C.chrome, metal);
  b.cyl(2.75, 1.5, 0.04, 0.92, 1.2, C.chrome, { ...metal, plan: false });
});

const island = piece("kochinsel", "Kochinsel", "kueche", 2.2, 1.0, 0.95, (b) => {
  b.box(0, 2.2, 0, 0.7, 0, 0.9, C.walnut, wood);
  b.box(-0.01, 2.21, -0.02, 1.0, 0.9, 0.95, C.white, { finish: "glanz" });
  b.box(0.75, 1.45, 0.12, 0.58, 0.95, 0.956, C.black, { finish: "glanz" });
  b.box(0.1, 0.12, 0.7, 0.98, 0, 0.9, C.white, { finish: "glanz", plan: false });
  b.box(2.08, 2.1, 0.7, 0.98, 0, 0.9, C.white, { finish: "glanz", plan: false });
});

const fridge = piece("kuehlschrank", "Kühlschrank hoch", "kueche", 0.6, 0.65, 2.0, (b) => {
  b.box(0, 0.6, 0, 0.62, 0, 2.0, C.chrome, { finish: "metall" });
  b.box(0.005, 0.595, 0.62, 0.64, 0.02, 1.2, C.chrome, { ...metal, plan: false });
  b.box(0.005, 0.595, 0.62, 0.64, 1.21, 1.99, C.chrome, { ...metal, plan: false });
  b.box(0.52, 0.54, 0.64, 0.66, 0.8, 1.15, C.darkgrey, { ...metal, plan: false });
});

const barstool = piece("barhocker", "Barhocker", "kueche", 0.42, 0.42, 0.8, (b) => {
  b.cyl(0.21, 0.21, 0.38, 0, 0.015, C.black, metal);
  b.cyl(0.21, 0.21, 0.04, 0.015, 0.7, C.black, { ...metal, plan: false });
  b.cyl(0.21, 0.21, 0.3, 0.3, 0.31, C.black, { ...metal, plan: false });
  b.cyl(0.21, 0.21, 0.42, 0.7, 0.78, C.walnut, { ...wood });
});

// ------------------------------------------------------------------ Bad

const bathtub = piece("badewanne", "Badewanne", "bad", 1.7, 0.75, 0.6, (b) => {
  const r = 0.06;
  b.box(0, 1.7, 0, 0.75, 0, 0.58, C.ceramic, gloss);
  // hollow basin: rim over a lowered inner floor
  b.box(0, 1.7, 0, r, 0.58, 0.6, C.ceramic, { ...gloss, round: 0.4 });
  b.box(0, 1.7, 0.75 - r, 0.75, 0.58, 0.6, C.ceramic, { ...gloss, round: 0.4 });
  b.box(0, r * 1.6, 0, 0.75, 0.58, 0.6, C.ceramic, { ...gloss, round: 0.4 });
  b.box(1.7 - r, 1.7, 0, 0.75, 0.58, 0.6, C.ceramic, { ...gloss, round: 0.4 });
  b.box(0.12, 1.62, 0.08, 0.67, 0.58, 0.585, "#d9eef3", { finish: "glas", plan: false });
  b.cyl(1.63, 0.375, 0.05, 0.6, 0.72, C.chrome, { ...metal, plan: false });
  b.box(1.5, 1.65, 0.36, 0.39, 0.68, 0.72, C.chrome, { ...metal, plan: false });
});

const shower = piece("dusche", "Dusche 90x90", "bad", 0.9, 0.9, 2.1, (b) => {
  b.box(0, 0.9, 0, 0.9, 0, 0.04, C.ceramic, gloss);
  b.box(0.38, 0.52, 0.38, 0.52, 0.04, 0.042, C.chrome, metal);
  b.box(0.885, 0.9, 0, 0.9, 0.04, 2.0, C.glass, { finish: "glas" });
  b.box(0, 0.9, 0.885, 0.9, 0.04, 2.0, C.glass, { finish: "glas" });
  b.box(0.88, 0.905, 0.88, 0.905, 0.04, 2.0, C.chrome, { ...metal, plan: false });
  b.cyl(0.08, 0.08, 0.025, 0.04, 2.05, C.chrome, { ...metal, plan: false });
  b.cyl(0.25, 0.25, 0.3, 2.0, 2.02, C.chrome, { ...metal, plan: false });
  b.box(0.08, 0.25, 0.07, 0.09, 2.02, 2.04, C.chrome, { ...metal, plan: false });
});

const wc = piece("wc", "WC wandhängend", "bad", 0.38, 0.56, 1.1, (b) => {
  b.box(0.01, 0.37, 0, 0.08, 0.3, 1.1, C.white, { ...gloss, plan: false }); // wall box
  b.box(0.11, 0.27, 0.06, 0.08, 0.95, 1.05, C.chrome, { ...metal, plan: false }); // flush plate
  b.ell(0.19, 0.33, 0.36, 0.48, 0.25, 0.42, C.ceramic, gloss);
  b.ell(0.19, 0.33, 0.37, 0.49, 0.42, 0.44, C.ceramic, { ...gloss, plan: false });
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
    b.box(0, W, 0, 0.5, 0.82, 0.86, C.white, gloss);
    for (let i = 0; i < basins; i++) {
      const cx = ((i + 0.5) * W) / basins;
      b.ell(cx, 0.28, 0.42, 0.3, 0.86, 0.87, C.ceramic, gloss);
      b.ell(cx, 0.28, 0.36, 0.24, 0.87, 0.872, "#e8ecee", { ...gloss, plan: false });
      b.cyl(cx, 0.08, 0.035, 0.86, 1.1, C.black, { ...metal, plan: false });
      b.box(cx - 0.0175, cx + 0.0175, 0.08, 0.2, 1.07, 1.1, C.black, { ...metal, plan: false });
    }
    b.box(0.05, W - 0.05, 0, 0.03, 1.15, 1.9, "#cfe3e8", { finish: "glas", plan: false }); // mirror
  });
}

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
  bed("bett-180", "Doppelbett 180×200", 1.8, C.white, C.sand),
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
