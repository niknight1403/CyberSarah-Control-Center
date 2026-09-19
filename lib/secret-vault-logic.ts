/**
 * CyberSarah Control Center — Secret-Vault-Logik (Sprint 167)
 *
 * Der Superagent (und der Repo-/Entwicklungs-Chat) soll Secrets — API-Keys,
 * Tokens, Passworte — VERARBEITEN und SICHER ABSPEICHERN koennen, genauso
 * wie der Base44-Superagent-Chat: Klartext landet NIE im Chatverlauf oder
 * in Loggs, Werte werden verschluesselt im Vault abgelegt.
 *
 * Diese Datei ist die reine, testbare Logik (kein IO):
 *
 *   - normalizeSecretName / isValidSecretName : stabile Namen
 *     (SCREAMING_SNAKE_CASE, 3-40 Zeichen, [A-Z0-9_]).
 *   - maskSecretValue                        : harmlose Vorschau
 *     (erste 3 + Punkte + letzte 2 Zeichen, kuerzere Werte nie offenbar).
 *   - detectSecretCandidates                 : Muster-Erkennung fuer
 *     gaengige Key-Formate (OpenAI, Groq, Anthropic, Google, GitHub,
 *     OpenRouter, Slack, AWS, generische Bearer/Hex-Tokens).
 *   - maskSecretsInText                      : ersetzt ALLE erkannten
 *     Kandidaten durch Masken — die persistierte Chat-Nachricht enthaelt
 *     danach keinen Klartext mehr.
 *   - buildSecretStoredNotice                : ehrlicher Chat-Hinweis,
 *     was gespeichert wurde (ohne Klartext).
 *
 * Bewusst konservativ: Nur hohesignalige Muster zaehlen (Falsch-Positive
 * waeren aerglicher als eine sorgfaeltige Erkennung). Alles unterhalb der
 * Mindestlaenge wird ignoriert.
 */

export const SECRET_NAME_MIN = 3;
export const SECRET_NAME_MAX = 40;
export const SECRET_VALUE_MIN = 8;
export const SECRET_VALUE_MAX = 4096;

export type SecretKind =
  | "openai"
  | "groq"
  | "anthropic"
  | "google"
  | "github"
  | "openrouter"
  | "slack"
  | "aws"
  | "bearer"
  | "hex_token"
  | "custom";

/** Ein erkannter Secret-Kandidat in einem Text. */
export interface SecretCandidate {
  value: string;
  kind: SecretKind;
  /** Empfohlener Vault-Name (z. B. DETECTED_GROQ_KEY_1). */
  suggestedName: string;
}

const SECRET_PATTERNS: Array<{ kind: SecretKind; name: string; pattern: RegExp }> = [
  { kind: "groq", name: "GROQ_API_KEY", pattern: /\bgsk_[A-Za-z0-9]{28,}\b/g },
  { kind: "anthropic", name: "ANTHROPIC_API_KEY", pattern: /\bsk-ant-[A-Za-z0-9-]{32,}\b/g },
  { kind: "openai", name: "OPENAI_API_KEY", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { kind: "openrouter", name: "OPENROUTER_API_KEY", pattern: /\bsk-or-[A-Za-z0-9-]{32,}\b/g },
  { kind: "google", name: "GEMINI_API_KEY", pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g },
  { kind: "github", name: "GITHUB_TOKEN", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { kind: "slack", name: "SLACK_TOKEN", pattern: /\bxox[bpars]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "aws", name: "AWS_ACCESS_KEY_ID", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "bearer", name: "BEARER_TOKEN", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{32,}\b/g },
  { kind: "hex_token", name: "HEX_TOKEN", pattern: /\b[A-Fa-f0-9]{40,64}\b/g },
];

/** Erlaubte Zeichen fuer Vault-Namen: Grossbuchstaben, Ziffern, Unterstrich. */
export function normalizeSecretName(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SECRET_NAME_MAX);
}

export function isValidSecretName(name: string): boolean {
  const normalized = normalizeSecretName(name);
  return normalized.length >= SECRET_NAME_MIN && normalized === name.trim().toUpperCase();
}

export function isValidSecretValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= SECRET_VALUE_MIN && trimmed.length <= SECRET_VALUE_MAX;
}

/**
 * Harmlose Vorschau fuer Listen-UIs: zeigt maximal 3 Anfangs- und 2
 * Endzeichen — kuerzere Werte werden komplett maskiert. Kein Klartext.
 */
export function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 10) return "••••••";
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-2)}`;
}

/**
 * Erkennt Secret-Kandidaten in einem Text. Dedupliziert nach Wert;
 * mehrere Funde desselben Musters erhalten nummerierte Namen.
 */
export function detectSecretCandidates(text: string): SecretCandidate[] {
  const found = new Map<string, SecretCandidate>();
  const counters = new Map<string, number>();

  for (const { kind, name, pattern } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text ?? "")) !== null) {
      const value = match[0].trim();
      if (value.length < SECRET_VALUE_MIN) continue; // zu kurz = zu unsicher zu raten
      if (found.has(value)) continue;
      const index = (counters.get(name) ?? 0) + 1;
      counters.set(name, index);
      const suggestedName = index === 1 ? name : `DETECTED_${name}_${index}`;
      found.set(value, { value, kind, suggestedName });
      if (match[0].length === 0) regex.lastIndex += 1; // Sicherheitsnetz gegen leere Treffer
    }
  }
  return [...found.values()];
}

/**
 * Ersetzt ALLE erkannten Kandidaten durch Masken mit Vault-Namen — die
 * zurueckgegebene Nachricht ist sicher persistierbar (kein Klartext).
 */
export function maskSecretsInText(text: string): { maskedText: string; candidates: SecretCandidate[] } {
  let maskedText = text ?? "";
  const candidates = detectSecretCandidates(maskedText);
  for (const candidate of candidates) {
    maskedText = maskedText.split(candidate.value).join(`[${candidate.suggestedName}_GESPEICHERT]`);
  }
  return { maskedText, candidates };
}

/** Ehrlicher, klartextfreier Hinweis fuer den Chatverlauf. */
export function buildSecretStoredNotice(storedNames: string[]): string | null {
  if (storedNames.length === 0) return null;
  const list = storedNames.map((name) => `• ${name}`).join("\n");
  return [
    "",
    "──────────────────────────────",
    `🔐 ${storedNames.length} Secret${storedNames.length === 1 ? "" : "s"} sicher im Vault gespeichert:`,
    list,
    "Klartext wurde aus dem Verlauf entfernt (AES-256-GCM verschlüsselt abgelegt).",
    "Verwaltung: Secrets-Bereich in diesem Chat.",
    "──────────────────────────────",
  ].join("\n");
}

/** Vault-Eintrag (Metadaten — nie der Klartext-Wert). */
export interface SecretVaultEntryMeta {
  name: string;
  kind: SecretKind;
  /** Maskierte Vorschau (z. B. gsk••••ab). */
  hint: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
