/**
 * Designer-Logik (rein, testbar) — AI App Grafik-Designer-Agent.
 *
 * Reine Funktionen fuer den Grafik-Designer-Agenten: Prompt-Bau je Asset-Typ,
 * Validierung der LLM-Ergebnisse (SVG, Design-Tokens) und Datei-/Namens-
 * normalisierung. Server (server/design/design-agent.ts) und Tests teilen
 * sich dieses Modul; die UI liest die Konstanten fuer Auswahllisten.
 */

export type DesignAssetType =
  | "icon"
  | "logo"
  | "splash"
  | "banner"
  | "theme"
  | "illustration";

export const DESIGN_ASSET_TYPES: readonly DesignAssetType[] = [
  "icon",
  "logo",
  "splash",
  "banner",
  "theme",
  "illustration",
] as const;

export const DESIGN_ASSET_TYPE_META: Record<
  DesignAssetType,
  { label: string; format: "svg" | "json"; beschreibung: string }
> = {
  icon: { label: "App-Icon", format: "svg", beschreibung: "Quadratisches Launcher-Icon, 512×512, flach und skalierbar" },
  logo: { label: "Logo", format: "svg", beschreibung: "Wort-/Bildmarke horizontal, dunkler Hintergrund" },
  splash: { label: "Splash-Screen", format: "svg", beschreibung: "Hochformat 1080×1920, Logo mittig, Cyber-Neon-Hintergrund" },
  banner: { label: "Marketing-Banner", format: "svg", beschreibung: "Wide-Banner 1200×630 mit Claim" },
  theme: { label: "Design-Tokens", format: "json", beschreibung: "Farb-/Typografie-Tokens im Cyber-Design-System" },
  illustration: { label: "Illustration", format: "svg", beschreibung: "Freie Vektor-Illustration zum Beschreibungstext" },
};

/** Maximal zulaessige Groesse eines generierten Assets (Zeichen) — KV-freundlich. */
export const MAX_ASSET_CONTENT_CHARS = 60_000;

/** Normalisiert den Asset-Typ mit toleranter Groess-/Umlautschreibweise. */
export function normalizeDesignAssetType(raw: string): DesignAssetType | null {
  const cleaned = (raw ?? "").trim().toLowerCase();
  const aliase: Record<string, DesignAssetType> = {
    icon: "icon",
    appicon: "icon",
    "app-icon": "icon",
    logo: "logo",
    splash: "splash",
    "splash-screen": "splash",
    banner: "banner",
    theme: "theme",
    tokens: "theme",
    "design-tokens": "theme",
    illustration: "illustration",
    illustrierung: "illustration",
  };
  return aliase[cleaned] ?? null;
}

/**
 * Dateiname fuer ein Asset: slugifiziert, typo-sicher mit Id, keine
 * Pfad-Traversal-Zeichen. Reine Normalisierung ohne FS-Zugriff.
 */
export function designAssetFileName(type: DesignAssetType, name: string, id: string): string {
  const ext = DESIGN_ASSET_TYPE_META[type].format;
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const safeId = (id ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  const base = slug || "asset";
  return `${type}-${base}-${safeId || "ohne-id"}.${ext}`;
}

/**
 * Baut den LLM-Prompt fuer die Asset-Generierung (deterministisch, rein).
 * Brand-Kontext und Design-Regeln sind fest eingebrannt, damit die Ergebnisse
 * zum Cyber-Design-System passen (Indigo-Schwarz + Neon-Spektrum).
 */
export function buildDesignPrompt(input: {
  type: DesignAssetType;
  description: string;
  brandName?: string;
}): string {
  const { type, description } = input;
  const brandName = (input.brandName ?? "CyberSarah Control Center").trim();
  const meta = DESIGN_ASSET_TYPE_META[type];
  const formatSpec =
    meta.format === "svg"
      ? `Liefere ausschliesslich valides, vollstaendiges SVG (Root-Element <svg xmlns="http://www.w3.org/2000/svg" ...>).`
      : `Liefere ausschliesslich ein JSON-Objekt mit den Schluesseln "colors" (primary, secondary, background, surface, text, accent, danger) als Hex-Werte und "typography" (heading, body, mono) mit fontFamily/size/weight.`;

  return [
    `Du bist der AI-Grafik-Designer-Agent der App "${brandName}".`,
    `Aufgabe: Erstelle einen hochwertigen Entwurf vom Typ "${meta.label}" (${meta.beschreibung}).`,
    ``,
    `Kundenwunsch / Beschreibung:`,
    (description ?? "").trim() || "(keine zusaetzliche Beschreibung — nutze dein bestes Urteil)",
    ``,
    `Design-Regeln (Cyber-Design-System):`,
    `- Farbwelt: tiefes Indigo-Schwarz (#0A0A14) als Basis, Neon-Akzente in Cyan (#22D3EE), Violett (#A78BFA), Pink (#F472B6), Gruen (#34D399).`,
    `- Stil: flach, geometrisch, hohe Kantigkeit; Verlaeufe subtil; keine fotorealistischen Elemente.`,
    `- Barrierefreiheit: ausreichender Kontrast der Kernfarben zueinander.`,
    `- Technik: keine externen Ressourcen (Bilder, Fonts, URLs), keine <script>- oder <foreignObject>-Elemente, ausschliesslich Inline-SVG-Formen und -Verlaeufe.`,
    ``,
    formatSpec,
    `Antworte NUR mit dem Asset-Inhalt (SVG bzw. JSON) — keine Erklaerung, keine Markdown-Code-Fences.`,
  ].join("\n");
}

/** Toleranter JSON-Extraktor: findet das erste vollstaendige JSON-Objekt im Text. */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = (raw ?? "").trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Validiert ein generiertes SVG: entfernt Code-Fences, prueft Grundform,
 * blockiert aktive Inhalte (script/foreignObject/external href) und
 * Groessenlimits. Gibt das bereinigte SVG oder null zurueck (rein).
 */
export function validateSvg(raw: string): string | null {
  let svg = (raw ?? "").trim();
  // Markdown-Code-Fences tolerieren (LLM-Artefakt).
  svg = svg.replace(/^```(?:svg|xml|html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return null;
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"') && !svg.includes("xmlns='http://www.w3.org/2000/svg'")) return null;
  const lower = svg.toLowerCase();
  if (lower.includes("<script") || lower.includes("<foreignobject") || lower.includes("javascript:")) return null;
  // Externe Referenzen blockieren (href/xlink:href zu http/https/data).
  if (/\b(href|xlink:href)\s*=\s*["']\s*(https?:|data:)/i.test(svg)) return null;
  if (svg.length < 64 || svg.length > MAX_ASSET_CONTENT_CHARS) return null;
  return svg;
}

/** Validiert Design-Token-Struktur (Farben als Hex, Typografie vorhanden). */
export function validateThemeTokens(raw: string | Record<string, unknown>): Record<string, unknown> | null {
  const obj = typeof raw === "string" ? extractJsonObject(raw) : raw ?? null;
  if (!obj || typeof obj !== "object") return null;
  const colors = obj.colors;
  if (!colors || typeof colors !== "object") return null;
  const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const required = ["background", "surface", "text", "accent"];
  for (const key of required) {
    const value = (colors as Record<string, unknown>)[key];
    if (typeof value !== "string" || !hexPattern.test(value)) return null;
  }
  return obj;
}

/** Validiert und bereinigt das LLM-Ergebnis je Asset-Typ. */
export function validateDesignAsset(
  type: DesignAssetType,
  content: string,
): { ok: true; content: string } | { ok: false; error: string } {
  if (DESIGN_ASSET_TYPE_META[type].format === "svg") {
    const svg = validateSvg(content);
    return svg ? { ok: true, content: svg } : { ok: false, error: "Ungueltiges SVG (Form, Aktiv-Inhalt oder Groesse)" };
  }
  const theme = validateThemeTokens(content);
  if (!theme) return { ok: false, error: "Ungueltige Design-Token-Struktur (colors/typography fehlen oder Hex-Form falsch)" };
  return { ok: true, content: JSON.stringify(theme, null, 2) };
}
