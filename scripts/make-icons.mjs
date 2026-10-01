// Renders the PNG app icons from public/brand/icon.svg. Run: npm run icons
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const brand = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand");
const svg = readFileSync(join(brand, "icon.svg"));

const plain = (size, name) => sharp(svg, { density: 300 }).resize(size, size).png().toFile(join(brand, name));

// Maskable: the chip shrunk into the safe zone on a full-bleed rail background.
const maskable = async (size, name) => {
  const inner = await sharp(svg, { density: 300 }).resize(Math.round(size * 0.78)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0F0F10" } })
    .composite([{ input: inner, gravity: "centre" }])
    .png()
    .toFile(join(brand, name));
};

await Promise.all([
  plain(192, "icon-192.png"),
  plain(512, "icon-512.png"),
  plain(180, "apple-touch-icon.png"),
  maskable(512, "icon-maskable-512.png"),
]);
console.log("icons written to public/brand");
