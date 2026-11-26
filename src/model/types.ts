// Core document model. All lengths are in meters, world coordinates use
// x to the right and y downwards (like the drawing on screen).

export type Vec2 = { x: number; y: number };

export type WallType = "aussen" | "innen" | "tragend" | "gelaender";

export interface WallNode {
  id: string;
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  a: string; // node id
  b: string; // node id
  thickness: number;
  height: number;
  type: WallType;
  /**
   * Roof slope above this wall (attic): the ceiling starts at the knee height on the
   * wall's inner face and rises at the given angle into the adjoining rooms.
   */
  slope?: RoofSlope;
}

export interface RoofSlope {
  /** Height of the knee wall in meters. */
  knee: number;
  /** Roof pitch in degrees. */
  angle: number;
}

export type OpeningKind = "tuer" | "fenster" | "schiebetuer" | "durchgang" | "bodenfenster";

export interface Opening {
  id: string;
  wallId: string;
  /** Distance of the opening center from wall node a, in meters. */
  offset: number;
  width: number;
  height: number;
  sill: number;
  kind: OpeningKind;
  /** Door swings to the left side of a->b if false, right side if true. */
  flipSide: boolean;
  /** Hinge at the a-side if false, b-side if true. */
  flipHinge: boolean;
}

export type FloorMaterial =
  | "parkett_eiche"
  | "parkett_hell"
  | "parkett_dunkel"
  | "fliese_hell"
  | "fliese_grau"
  | "beton"
  | "teppich"
  | "terrasse";

/**
 * Room metadata. The polygon itself is derived from the walls on every change;
 * the anchor point ties the metadata to the face that contains it.
 */
export interface RoomMeta {
  id: string;
  anchor: Vec2;
  name: string;
  floorMaterial: FloorMaterial;
  /** Area as stated in the source drawing, for comparison. */
  targetArea?: number;
  /** Room type drives automatic staging. */
  roomType?: RoomType;
}

export type RoomType =
  | "wohnen"
  | "schlafen"
  | "kind"
  | "bad"
  | "wc"
  | "kueche"
  | "essen"
  | "flur"
  | "arbeiten"
  | "abstell"
  | "hwr"
  | "ankleide"
  | "balkon"
  | "sonstiges";

export interface FurnitureItem {
  id: string;
  defId: string;
  x: number;
  y: number;
  /** Rotation in degrees, clockwise on screen. */
  rotation: number;
  w: number;
  d: number;
  h: number;
  /** Optional colour override for the main material. */
  color?: string;
  elevation?: number;
}

export interface TextLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  size: number;
}

export interface Dimension {
  id: string;
  a: Vec2;
  b: Vec2;
  offset: number;
}

export interface Underlay {
  dataUrl: string;
  /** Image pixels per meter. */
  pxPerMeter: number;
  /** World position of the image's top-left corner. */
  x: number;
  y: number;
  opacity: number;
  widthPx: number;
  heightPx: number;
  /** Room labels found in the PDF text layer, in world coordinates. */
  labels?: { name: string; area?: number; x: number; y: number }[];
  visible: boolean;
}

export interface Floor {
  id: string;
  name: string;
  /** Default wall height for this floor. */
  height: number;
  nodes: WallNode[];
  walls: Wall[];
  openings: Opening[];
  rooms: RoomMeta[];
  items: FurnitureItem[];
  labels: TextLabel[];
  dimensions: Dimension[];
  underlay?: Underlay;
}

export type PartShape =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  // organic shapes generated in 3D (drawn as rectangles/ellipses in the technical plan)
  | "duvet"
  | "throw"
  | "pillow"
  | "towel"
  | "tub"
  | "basin"
  | "tray"
  | "toilet"
  | "faucet"
  | "cushion"
  | "sink";

/** A primitive in a furniture model. Coordinates are relative to the item's footprint (0..1). */
export interface FurniturePart {
  shape: PartShape;
  /** Footprint-relative position of the part's center (0..1 on x and y). */
  x: number;
  y: number;
  /** Footprint-relative size (0..1). */
  w: number;
  d: number;
  /** Height-relative bottom and height (0..1). */
  z: number;
  h: number;
  color: string;
  /** Slight roughness/metal hints for 3D. */
  finish?:
    | "matt"
    | "glanz"
    | "metall"
    | "stoff"
    | "glas"
    | "holz"
    | "licht"
    | "keramik"
    | "chrom"
    | "stein"
    | "lack"
    | "edelstahl";
  /** Draw in the 2D symbol (default true). */
  plan?: boolean;
  /** Tilt around the item's x axis in degrees (e.g. leaning back cushions). */
  tilt?: number;
  /** Rotation around the vertical axis in degrees. */
  yaw?: number;
  /** Corner radius factor for boxes (0 = sharp, 1 = pillow-like). */
  round?: number;
  /** Keeps its own colour when the item gets a colour override (bed linen, accent pillows). */
  fixed?: boolean;
}

/** A furniture piece placed inside a composite (e.g. chairs of a dining set). Meters from the footprint center. */
export interface FurnitureChild {
  defId: string;
  x: number;
  y: number;
  z?: number;
  rotation: number;
}

/** Reference to a detailed 3D model (glTF/GLB) that replaces the primitive parts in 3D. */
export interface FurnitureModelRef {
  url: string;
  /** Native model size in meters (before rotation). */
  w: number;
  d: number;
  h: number;
  /** Rotation (degrees) so the model's front faces the item's front (+y in the plan). */
  rotY: number;
  credit?: string;
}

export type FurnitureCategory =
  "wohnen" | "schlafen" | "essen" | "kueche" | "bad" | "arbeiten" | "deko" | "aussen" | "bau" | "eigene";

export interface FurnitureDef {
  id: string;
  name: string;
  category: FurnitureCategory;
  w: number;
  d: number;
  h: number;
  parts: FurniturePart[];
  /** Mounted on the wall / elevated (e.g. wall cabinet). */
  elevation?: number;
  model?: FurnitureModelRef;
  children?: FurnitureChild[];
  custom?: boolean;
}

export interface Project {
  id: string;
  name: string;
  floors: Floor[];
  customFurniture: FurnitureDef[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  notes?: string;
}

/** Derived room geometry (not persisted). */
export interface RoomGeometry {
  meta: RoomMeta;
  /** Centerline polygon (wall axes). */
  outline: Vec2[];
  /** Inner polygon (clear dimensions, used for the area). */
  inner: Vec2[];
  area: number;
  perimeter: number;
  centroid: Vec2;
}
