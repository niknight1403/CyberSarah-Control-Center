/**
 * Sprint 367 — Automatische Publishing-Karten: deterministische PNG-Posts im
 * Persona-Stil, von der App selbst gehostet (keine externen Asset-Dienste).
 *
 * Reine Logik: Persona-Farben, Formatwahl (1:1 / 4:5), 5x7-Bitmap-Font,
 * Textlayout und Asset-Validierung. Die Encodierung uebernimmt lib/png-encoder.
 */
import { encodePng } from "./png-encoder";
import { INFLUENCER_PERSONAS } from "./influencer-persona-logic";

/* ==================== Formate ==================== */

export const IG_RATIOS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
} as const;

export type IgRatioKey = keyof typeof IG_RATIOS;

export function isIgRatioKey(value: string): value is IgRatioKey {
  return value === "square" || value === "portrait";
}

/* ==================== Persona-Farben (deterministisch) ==================== */

const PERSONA_PALETTE: Record<string, { primary: [number, number, number]; accent: [number, number, number] }> = {
  nova: { primary: [15, 23, 42], accent: [56, 189, 248] },
  mira: { primary: [30, 27, 75], accent: [167, 139, 250] },
  juno: { primary: [15, 43, 30], accent: [52, 211, 153] },
  lina: { primary: [69, 26, 3], accent: [251, 191, 36] },
  kaya: { primary: [12, 34, 24], accent: [45, 212, 191] },
  zara: { primary: [50, 8, 40], accent: [244, 114, 182] },
  orion: { primary: [23, 12, 50], accent: [129, 140, 248] },
  ava: { primary: [40, 16, 8], accent: [251, 146, 60] },
  rio: { primary: [8, 28, 35], accent: [34, 211, 238] },
  nala: { primary: [35, 20, 12], accent: [250, 204, 21] },
};

export function personaColors(personaId: string): { primary: [number, number, number]; accent: [number, number, number] } {
  return PERSONA_PALETTE[personaId] ?? PERSONA_PALETTE.nova;
}

/* ==================== Bitmap-Font (5x7, Grossbuchstaben + Ziffern) ==================== */

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10011", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "/": ["00001", "00010", "00100", "00100", "01000", "10000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
};

// Umlaute und SZ werden auf Basisglyphen abgebildet (aehnlich genug im 5x7-Font).
FONT["Ä"] = FONT.A;
FONT["Ö"] = FONT.O;
FONT["Ü"] = FONT.U;
FONT["ß"] = FONT.B;

/* ==================== Karten-Renderer ==================== */

export interface CardInput {
  personaId: string;
  product: string;
  headline: string;
  ratio?: IgRatioKey;
}

/** Escapt und normalisiert Text fuer den Bitmap-Font (Grossbuchstaben, Umlaute behalten). */
export function normalizeCardText(text: string, maxLength = 90): string {
  return text
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

function drawText(buffer: { width: number; height: number; pixels: Buffer }, text: string, x: number, y: number, scale: number, color: [number, number, number]) {
  let cursor = x;
  for (const char of text) {
    const glyph = FONT[char];
    if (!glyph) continue; // Unbekannte Zeichen: ehrlich ueberspringen statt crashen.
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === "1") {
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              const px = cursor + col * scale + sx;
              const py = y + row * scale + sy;
              if (px < 0 || px >= buffer.width || py < 0 || py >= buffer.height) continue;
              const offset = (py * buffer.width + px) * 4;
              buffer.pixels[offset] = color[0];
              buffer.pixels[offset + 1] = color[1];
              buffer.pixels[offset + 2] = color[2];
              buffer.pixels[offset + 3] = 255;
            }
          }
        }
      }
    }
    cursor += 6 * scale; // 5 Spalten + 1 Spalte Abstand
  }
}

/** Brot die ersten Zeilen des Headlines (max. 3 Zeilen, je nach Breite umbrechen). */
export function wrapHeadline(headline: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = headline.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  // Verlustfrei (Sprint 367): Ueberlauf wird in die letzte Zeile gemergt,
  // statt Woerter still zu verwerfen — der Renderer schneidet nur Pixel ab.
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    kept.push(lines.slice(maxLines - 1).join(" "));
    return kept;
  }
  return lines;
}

/** Rendert die Publishing-Karte als PNG-Buffer (deterministisch, gleiche Eingabe -> gleiche Bytes). */
export function buildPublishingCardPng(input: CardInput): Buffer {
  const ratioKey = input.ratio ?? "square";
  const { width, height } = IG_RATIOS[ratioKey];
  const colors = personaColors(input.personaId);
  const persona = INFLUENCER_PERSONAS.find((entry) => entry.id === input.personaId);

  const image = { width, height, pixels: Buffer.alloc(width * height * 4) };
  // Vertikaler Farbverlauf: primary oben -> accent-angesprochenes Dunkel unten.
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const r = Math.round(colors.primary[0] * (1 - t * 0.55) + colors.accent[0] * t * 0.55);
    const g = Math.round(colors.primary[1] * (1 - t * 0.55) + colors.accent[1] * t * 0.55);
    const b = Math.round(colors.primary[2] * (1 - t * 0.55) + colors.accent[2] * t * 0.55);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      image.pixels[offset] = r;
      image.pixels[offset + 1] = g;
      image.pixels[offset + 2] = b;
      image.pixels[offset + 3] = 255;
    }
  }

  // Persona-Zeile oben (Accent), Akzentbalken, Produkt (weiss) und Headline (weiss).
  drawText(image, normalizeCardText(persona ? `${persona.name} | ${persona.niche}` : "CyberSarah", 34), 60, 70, 6, colors.accent);
  // Akzentbalken
  for (let x = 60; x < 420; x += 1) {
    for (let y = 160; y < 176; y += 1) {
      const offset = (y * width + x) * 4;
      image.pixels[offset] = colors.accent[0];
      image.pixels[offset + 1] = colors.accent[1];
      image.pixels[offset + 2] = colors.accent[2];
      image.pixels[offset + 3] = 255;
    }
  }
  const white: [number, number, number] = [255, 255, 255];
  drawText(image, normalizeCardText(input.product, 26), 60, 260, 10, white);
  const headlineLines = wrapHeadline(normalizeCardText(input.headline, 200), 20, 3);
  let headlineY = 460;
  for (const line of headlineLines) {
    drawText(image, line, 60, headlineY, 8, white);
    headlineY += 90;
  }
  // Catchphrase unten (Accent)
  if (persona) {
    drawText(image, normalizeCardText(persona.catchphrases[0] ?? "", 40), 60, height - 140, 6, colors.accent);
  }
  return encodePng(image);
}

/* ==================== Asset-URLs & Validierung ==================== */

/** Oeffentliche Asset-URL einer automatisch generierten Karte (App-hosted, Sprint 367). */
export function autoCardAssetUrl(baseUrl: string, jobId: number): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/api/publishing/assets/${jobId}.png`;
}

export const IMAGE_ASSET_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const VIDEO_ASSET_EXTENSIONS = [".mp4", ".mov"] as const;

export interface AssetValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validiert eine Asset-URL vorab (Sprint 367, Optimierung 4) — ehrlich statt
 * Blind-Versuch: nur http(s), nur bekannte Erweiterungen, keine Daten-URIs.
 * Regex-Pruefung ist bewusst restriktiv; Reachability prueft der Service per HEAD.
 */
export function validateAssetUrl(url: string, expected: "image" | "video"): AssetValidationResult {
  const trimmed = url.trim();
  if (!/^https?:\/\/[^\s]+$/.test(trimmed)) {
    return { valid: false, reason: "Asset-URL muss mit http(s):// beginnen (keine relativen Pfade, keine Data-URIs)." };
  }
  const lower = trimmed.toLowerCase().split("?")[0];
  const allowed = expected === "image" ? IMAGE_ASSET_EXTENSIONS : VIDEO_ASSET_EXTENSIONS;
  if (!allowed.some((ext) => lower.endsWith(ext))) {
    return {
      valid: false,
      reason: `Asset-Endung unpassend fuer ${expected === "image" ? "Bild" : "Video"} — erlaubt: ${allowed.join(", ")}.`,
    };
  }
  return { valid: true };
}
