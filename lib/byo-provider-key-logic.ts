/**
 * Sprint 304 — Video BYO-Key: reine, deterministische Logik fuer die
 * Verwaltung eigener Anbieter-Keys (Bring Your Own) in den Settings.
 *
 * Datenfluss:
 *   Die UI uebergibt rohe Key-Eingaben; die Logik validiert NUR das
 *   Format, maskiert fuer die Anzeige und verwaltet Eintrags-Metadaten.
 *   Speicherung/Rotation laeuft ausserhalb (Settings-Persistenz).
 *
 * Ehrlichkeits-Grenze: Ein formatgueltiger Key ist NICHT verifiziert.
 *   Gueltigkeit und Funktionsfaehigkeit klärt erst ein echter Test-Call —
 *   die UI muss "format ok" niemals als "funktioniert" darstellen.
 */

export type ByoProviderId =
  | "huggingface"
  | "groq"
  | "openrouter"
  | "gemini"
  | "openai";

/** Format-Regeln je Anbieter (nur Praefix/Struktur, keine Live-Pruefung). */
export const BYO_KEY_FORMATS: Record<
  ByoProviderId,
  { pattern: RegExp; label: string; example: string }
> = {
  huggingface: {
    pattern: /^hf_[A-Za-z0-9]{20,}$/,
    label: "Hugging Face",
    example: "hf_…",
  },
  groq: {
    pattern: /^gsk_[A-Za-z0-9]{20,}$/,
    label: "Groq",
    example: "gsk_…",
  },
  openrouter: {
    pattern: /^sk-or-[A-Za-z0-9-]{20,}$/,
    label: "OpenRouter",
    example: "sk-or-…",
  },
  gemini: {
    pattern: /^AIza[A-Za-z0-9_-]{20,}$/,
    label: "Google Gemini",
    example: "AIza…",
  },
  openai: {
    pattern: /^sk-[A-Za-z0-9-_]{20,}$/,
    label: "OpenAI",
    example: "sk-…",
  },
};

export type KeyValidation =
  | { valid: true; provider: ByoProviderId }
  | { valid: false; reason: string };

/** Prueft Format und Anbieter-Zuordnung eines rohen Keys. Trimmt Whitespace. */
export function validateByoKey(provider: ByoProviderId, rawKey: string): KeyValidation {
  const key = rawKey.trim();
  if (key.length === 0) {
    return { valid: false, reason: "Leerer Key." };
  }
  if (/\s/.test(key)) {
    return { valid: false, reason: "Key enthaelt Leerzeichen." };
  }
  if (!BYO_KEY_FORMATS[provider].pattern.test(key)) {
    return {
      valid: false,
      reason: `Format passt nicht zu ${BYO_KEY_FORMATS[provider].label} (erwartet z. B. ${BYO_KEY_FORMATS[provider].example}).`,
    };
  }
  return { valid: true, provider };
}

/** Maskiert einen Key fuer die Anzeige: erste 4 + letzte 4, Rest Punkte. */
export function maskKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.length <= 8) {
    // Zu kurze Keys nicht teilweise offenlegen — ehrlich als ungueltig markieren.
    return "•".repeat(key.length);
  }
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

export type ByoKeyEntry = {
  id: string;
  provider: ByoProviderId;
  label: string;
  maskedKey: string;
  addedAt: number;
  /** Letzte bekannte Verwendbarkeit; null = noch nie getestet. */
  lastVerifiedAt: number | null;
};

/** Fuegt einen (bereits format-validierten) Key als Eintrag hinzu; nur Maske wird gespeichert. */
export function createKeyEntry(
  provider: ByoProviderId,
  rawKey: string,
  label: string,
  addedAt: number,
  id: string,
): ByoKeyEntry {
  return {
    id,
    provider,
    label: label.trim() || BYO_KEY_FORMATS[provider].label,
    maskedKey: maskKey(rawKey),
    addedAt,
    lastVerifiedAt: null,
  };
}

/** Ehrlicher Verifikations-Zustand fuer die UI. */
export function verificationState(entry: ByoKeyEntry, now: number): {
  state: "ungetestet" | "verifiziert" | "alt";
  hint: string;
} {
  if (entry.lastVerifiedAt === null) {
    return {
      state: "ungetestet",
      hint: "Key noch nie getestet — Format ok sagt nichts ueber Funktion.",
    };
  }
  const ageDays = (now - entry.lastVerifiedAt) / 86_400_000;
  if (ageDays > 30) {
    return {
      state: "alt",
      hint: `Letzte Verifikation vor ${Math.floor(ageDays)} Tagen — erneut testen empfohlen.`,
    };
  }
  return { state: "verifiziert", hint: `Letzte Verifikation vor ${Math.floor(ageDays)} Tag(en).` };
}
