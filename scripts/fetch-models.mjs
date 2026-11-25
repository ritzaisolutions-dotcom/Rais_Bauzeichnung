// Downloads selected CC0 furniture models from Poly Haven (https://polyhaven.com, CC0 licence),
// converts them to compact GLB files with WebP textures and writes a manifest with real dimensions.
//
//   node scripts/fetch-models.mjs            # all models, 2k textures
//   node scripts/fetch-models.mjs sofa_02    # only the given asset ids
//
// Output: public/models/<asset>.glb and src/furniture/models.generated.json
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

/** Poly Haven asset id -> how it is used in the catalog. */
export const MODELS = [
  { asset: "mid_century_lounge_chair", label: "Loungesessel" },
  { asset: "modern_arm_chair_01", label: "Armlehnsessel" },
  { asset: "modern_coffee_table_01", label: "Couchtisch Beton" },
  { asset: "coffee_table_round_01", label: "Couchtisch rund" },
  { asset: "side_table_01", label: "Beistelltisch Holz" },
  { asset: "modern_wooden_cabinet", label: "Sideboard Rillen" },
  { asset: "drawer_cabinet", label: "Kommode Holz/Metall" },
  { asset: "wooden_display_shelves_01", label: "Würfelregal" },
  { asset: "steel_frame_shelves_03", label: "Regal Industrial" },
  { asset: "dining_chair_02", label: "Esszimmerstuhl Leder" },
  { asset: "potted_plant_02", label: "Pflanze im Terrakottatopf" },
  { asset: "potted_plant_01", label: "Pflanze in Schale" },
  { asset: "potted_plant_04", label: "Sukkulente" },
  { asset: "ceramic_vase_01", label: "Keramikvase" },
  { asset: "throw_pillows_01", label: "Dekokissen" },
  { asset: "outdoor_table_chair_set_01", label: "Bistro-Set" },
  { asset: "modern_ceiling_lamp_01", label: "Pendelleuchte" },
];

const RES = process.env.MODEL_RES ?? "2k";
const SRC = ".cache/models-src";
const OUT = "public/models";
const MANIFEST = "src/furniture/models.generated.json";

async function download(url, path) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      return;
    }
    if (attempt === 4) throw new Error(`${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

async function fetchAsset(asset) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${asset}`)).json();
  const entry = files.gltf?.[RES]?.gltf ?? files.gltf?.["1k"]?.gltf;
  if (!entry) throw new Error(`no glTF for ${asset}`);
  const dir = join(SRC, asset);
  const gltfPath = join(dir, `${asset}.gltf`);
  await download(entry.url, gltfPath);
  for (const [rel, inc] of Object.entries(entry.include ?? {})) await download(inc.url, join(dir, rel));
  return gltfPath;
}

async function main() {
  const only = process.argv.slice(2);
  const list = only.length ? MODELS.filter((m) => only.includes(m.asset)) : MODELS;
  mkdirSync(OUT, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ sharp, "meshopt.encoder": MeshoptEncoder });

  for (const m of list) {
    process.stdout.write(`${m.asset} … `);
    const gltfPath = await fetchAsset(m.asset);
    const doc = await io.read(gltfPath);
    await doc.transform(
      dedup(),
      prune(),
      weld(),
      textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 82 }),
    );
    // measure before quantization so the manifest has exact real-world dimensions
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const size = { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1], d: b.max[2] - b.min[2] };
    const glb = await io.writeBinary(doc);
    writeFileSync(join(OUT, `${m.asset}.glb`), glb);
    manifest[m.asset] = {
      label: m.label,
      file: `/models/${m.asset}.glb`,
      w: +size.w.toFixed(3),
      d: +size.d.toFixed(3),
      h: +size.h.toFixed(3),
      source: `https://polyhaven.com/a/${m.asset}`,
      license: "CC0",
    };
    console.log(
      `${(glb.byteLength / 1e6).toFixed(2)} MB, ${size.w.toFixed(2)} × ${size.d.toFixed(2)} × ${size.h.toFixed(2)} m`,
    );
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
