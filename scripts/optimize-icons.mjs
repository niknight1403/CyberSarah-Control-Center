import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const maxBytes = 100_000;
const maxDimension = 512;
const assets = [
  "assets/images/icon.png",
  "assets/images/splash-icon.png",
  "assets/images/favicon.png",
  "assets/images/android-icon-foreground.png",
];

for (const relativePath of assets) {
  const path = resolve(relativePath);
  const data = await readFile(path);
  if (data.length > maxBytes) {
    throw new Error(`${relativePath} überschreitet das Größenlimit von ${maxBytes} Bytes.`);
  }
  if (data.readUInt32BE(0) !== 0x89504e47 || data.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error(`${relativePath} ist keine gültige PNG-Datei.`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width > maxDimension || height > maxDimension) {
    throw new Error(`${relativePath} überschreitet ${maxDimension}x${maxDimension}.`);
  }
  console.log(`${relativePath}: ${width}x${height}, ${data.length} bytes`);
}
