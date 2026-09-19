/**
 * CyberSarah Control Center — Custom-Game-Codegenerator: Logik (Sprint 166)
 *
 * Stufe 2 der autonomen Entwicklung: STATT nur Personalisierung fester
 * Templates erzeugt ein FREIES LLM (Managed-Kaskade oder lokales Ollama)
 * ein vollstaendiges, eigenes HTML5-Spiel aus einer Idee. Die Logik hier
 * ist rein (testbar, ohne IO):
 *
 *   - buildCustomGamePrompt() : harte Generierungs-Vorgaben (Single-File,
 *     Canvas, keine externen Ressourcen, nur freie Mittel, 0 EUR).
 *   - extractGeneratedGame()  : HTML aus der LLM-Antwort schneiden
 *     (Fenced-Block oder rohes Dokument).
 *   - sanitizeGeneratedGame()  : externe Ressourcen entfernen, gefaehrliche
 *     Muster ablehnen (eval/Function/fetch/XMLHttpRequest) — generierter
 *     Code laeuft NUR sandboxed im eigenen Artefakt.
 *   - validateGeneratedGame() : Strukturpruefung mit ehrlicher Issue-Liste.
 *   - matchTemplateForIdea()  : Offline-Fallback — die Idee wird per
 *     Schluesselwort auf das naechste deterministische Spiel-Template
 *     gemappt, damit die Kette auch OHNE jeden API-Key lieferfaehig bleibt.
 *   - buildCustomSlug()       : stabiler Artefakt-Slug.
 */

import { slugify } from "./autonomous-dev-logic";

export const CUSTOM_GAME_KIND = "custom" as const;

export interface CustomGameIdea {
  idea: string;
}

/** Vorlagen-Fallback-Matrix (Schluesselwort -> deterministisches Template). */
const TEMPLATE_KEYWORDS: { template: "pong" | "snake" | "breakout" | "flappy"; pattern: RegExp; label: string }[] = [
  { template: "snake", pattern: /snake|schlange|wurm|worm|zelle|grid/i, label: "Snake" },
  { template: "pong", pattern: /pong|tennis|paddel|paddle|schlaeger|air.?hockey|2 ?spieler/i, label: "Pong" },
  { template: "breakout", pattern: /breakout|arkanoid|block|stein|brick|ziegel/i, label: "Breakout" },
  { template: "flappy", pattern: /flappy|vogel|bird|fliegen|flap|jump|springen|doodle/i, label: "Flappy" },
];

/** Maximal zulaessige Groesse des generierten Spiels (Defensive, 256 KB). */
export const MAX_CUSTOM_GAME_BYTES = 256 * 1024;

/**
 * Baut den Generierungs-Prompt. Bewusst hart formuliert: Single-File,
 * keine externen Ressourcen, keine Netzwerk- oder Eval-Muster — alles,
 * was sanitizeGeneratedGame() ohnehin ablehnt, wird vorab verboten.
 */
export function buildCustomGamePrompt(idea: string): string {
  return [
    "Du bist ein Spiele-Entwickler. Erzeuge aus der folgenden Idee ein VOLLSTAENDIGES, sofort spielbares HTML5-Spiel.",
    "",
    `IDEE: ${idea.trim().slice(0, 500)}`,
    "",
    "HARTE VORGABEN (alle Pflicht):",
    "1. EINE einzige HTML-Datei: DOCTYPE, <html>, <head> mit Inline-<style>, <body> mit <canvas> und Inline-<script>.",
    "2. KEINE externen Ressourcen: kein <script src>, kein <link href>, kein CDN, kein fetch/XHR, kein eval, kein new Function.",
    "3. Canvas-Rendering mit requestAnimationFrame; Spiellogik, Kollisionen, Score und Game-Over/Neustart (Taste oder Klick).",
    "4. Steuerung: Pfeiltasten/WASD oder Maus/Touch — mit Hinweis im Spiel.",
    "5. Lesbarer, moderater Stil; Titel der Idee im <title> und als Ueberschrift.",
    "6. Halte den Code unter 400 Zeilen und robust (kein Absturz bei schnellen Inputs).",
    "",
    "ANTWORTFORMAT: NUR der vollstaendige HTML-Quellcode in einem einzigen ```html-Codeblock. Keine Erklaerung davor oder danach.",
  ].join("\n");
}

/** Extrahiert das generierte HTML aus der LLM-Rohantwort (Fenced-Block bevorzugt). */
export function extractGeneratedGame(raw: string): string | null {
  if (!raw) return null;
  const fenced = raw.match(/```html\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const html = (fenced ? fenced[1] : raw).trim();
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) return null;
  return html;
}

/** Gefaehrliche/verbotene Muster in generiertem Spiel-Code. */
const FORBIDDEN_GAME_PATTERNS: { pattern: RegExp; issue: string }[] = [
  { pattern: /\beval\s*\(/, issue: "eval() ist verboten" },
  { pattern: /new\s+Function\s*\(/, issue: "new Function() ist verboten" },
  { pattern: /\bfetch\s*\(/, issue: "fetch() ist verboten (kein Netzwerk)" },
  { pattern: /new\s+XMLHttpRequest/, issue: "XMLHttpRequest ist verboten (kein Netzwerk)" },
  { pattern: /import\s*\(/, issue: "dynamischer import() ist verboten" },
  { pattern: /<script[^>]+src\s*=/i, issue: "externes <script src> ist verboten" },
  { pattern: /<link[^>]+href\s*=\s*["']?(https?:|\/\/)/i, issue: "externes Stylesheet ist verboten" },
];

/**
 * Entfernt verfuegbare externe Ressourcen und meldet unloeschbare
 * Verstoesse als Issues. Gibt nie null zurueck — die Pipeline entscheidet.
 */
export function sanitizeGeneratedGame(html: string): { html: string; issues: string[] } {
  let sanitized = html;
  const issues: string[] = [];
  for (const { pattern, issue } of FORBIDDEN_GAME_PATTERNS) {
    if (pattern.test(sanitized)) issues.push(issue);
  }
  // Externe Script-/Link-Tags strippen (freiwillig entfernbar), Netzwerk-Muster sind Issues.
  sanitized = sanitized.replace(/<script[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi, "");
  sanitized = sanitized.replace(/<link[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\/[^>]*>/gi, "");
  if (sanitized.length > MAX_CUSTOM_GAME_BYTES) {
    issues.push(`Artefakt zu gross (${sanitized.length} Bytes > ${MAX_CUSTOM_GAME_BYTES})`);
  }
  return { html: sanitized, issues };
}

export interface CustomGameValidation {
  ok: boolean;
  issues: string[];
}

/** Strukturpruefung des generierten Spiels (ehrlich, erweiterbar). */
export function validateGeneratedGame(html: string, scriptSyntaxOk: boolean, sanitizeIssues: string[]): CustomGameValidation {
  const issues = [...sanitizeIssues];
  if (!/<canvas[\s>]/i.test(html)) issues.push("kein <canvas> gefunden");
  if (!/<script[\s>]/i.test(html)) issues.push("kein Inline-<script> gefunden");
  if (!/<title>[^<]{1,120}<\/title>/i.test(html)) issues.push("kein gueltiger <title>");
  if (!/requestAnimationFrame/.test(html)) issues.push("keine requestAnimationFrame-Spiellogik");
  if (!scriptSyntaxOk) issues.push("Inline-Script besteht node --check nicht");
  return { ok: issues.length === 0, issues };
}

/**
 * Offline-Fallback: mappt die Idee per Schluesselwort auf das naechste
 * deterministische Spiel-Template — die Kette bleibt ohne jeden API-Key
 * lieferfaehig (ehrlich: Fallback, kein eigenes Spiel).
 */
export function matchTemplateForIdea(idea: string): { template: "pong" | "snake" | "breakout" | "flappy"; label: string } | null {
  const text = (idea ?? "").slice(0, 500);
  for (const entry of TEMPLATE_KEYWORDS) {
    if (entry.pattern.test(text)) return { template: entry.template, label: entry.label };
  }
  return null;
}

/** Stabiler Slug fuer das Custom-Artefakt. */
export function buildCustomSlug(idea: string): string {
  const slug = slugify(idea).slice(0, 48);
  return `custom-${slug || "spiel"}`;
}

/** Menschenlesbares Label fuer das Run-Ledger. */
export function buildCustomLabel(idea: string): string {
  const clean = idea.trim().replace(/\s+/g, " ").slice(0, 60);
  return clean ? `Custom-Spiel: ${clean}` : "Custom-Spiel";
}
