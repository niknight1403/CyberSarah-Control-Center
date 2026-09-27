/**
 * Sprint 367 — Minimaler, deterministischer PNG-Encoder (reine Logik, keine
 * Bild-Libraries): RGBA-Pixelbuffer -> PNG-Bytes via Node-zlib.
 * Nur fuer intern generierte Publishing-Karten; bewusst kompakt gehalten.
 */
import { deflateSync } from "node:zlib";

/** CRC32 (IEEE), wie im PNG-Standard gefordert. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Laenge: width * height * 4 (Reihenfolge R, G, B, A). */
  pixels: Buffer;
}

/** Kodiert ein RGBA-Bild als PNG (Color-Type 6, Bit-Depth 8, kein Filter). */
export function encodePng(image: RgbaImage): Buffer {
  if (image.pixels.length !== image.width * image.height * 4) {
    throw new Error(`Pixelbuffer-Passung falsch: ${image.pixels.length} Bytes fuer ${image.width}x${image.height}`);
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8; // Bit-Tiefe
  ihdr[9] = 6; // RGBA
  // Komprimierung 0, Filter 0, Interlace 0 bleiben Null.
  const raw = Buffer.alloc(image.height * (1 + image.width * 4));
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (1 + image.width * 4);
    raw[rowStart] = 0; // Filter-Typ None
    image.pixels.copy(raw, rowStart + 1, y * image.width * 4, (y + 1) * image.width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
