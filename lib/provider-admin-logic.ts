/**
 * Sprint 154 — Provider-Admin-Logik (rein, testbar).
 *
 * Sichere Verwaltung von LLM-Provider-Keys aus Admin-Sicht:
 *  - Praezise Fehlerklassifikation (fehlend / unguelig / abgelaufen /
 *    widerrufen / Rate-Limit / Quota / Timeout / Ausfall / Netzwerk)
 *  - Maskierte Key-Fingerprints ("sk-proj-…A91F") — niemals Voll-Keys
 *  - Ablaufwarnungen (14 d / 7 d / 24 h / abgelaufen), expiresAt darf
 *    unbekannt sein
 *  - Active/Standby-Rotation als deterministische Zustandsmaschine:
 *    Promotion nur nach erfolgreichem Health-Check; Misserfolg laesst
 *    den aktiven Key unangetastet
 *  - Verschluesselung ruhender Keys (AES-256-GCM, Schluessel abgeleitet
 *    aus JWT_SECRET oder PROVIDER_KEY_ENCRYPTION_SECRET)
 *  - Secret-freie Audit-Events
 *
 * Sicherheitsregeln: Diese Logik beschafft niemals Keys, nimmt niemals
 * erfundene Werte und gibt niemals Voll-Keys zurueck.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";

// ---------------------------------------------------------------------------
// Provider-Metadaten (Matrix, Phase 1)
// ---------------------------------------------------------------------------

export type ProviderAdminId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "openrouter"
  | "groq"
  | "together"
  | "huggingface"
  | "ollama"
  | "lmstudio"
  | "custom"
  | "managed";

export type ProviderAdminMeta = {
  id: ProviderAdminId;
  label: string;
  /** Bevorzugte ENV-Variable, Fallback dahinter. */
  envKeys: readonly string[];
  /** Default-Modell der Chat-Runtime (Anzeige). */
  defaultModelEnv: string | null;
  local: boolean;
  /**
   * Health-Check-Methode: offizieller, kostenloser Modell-/Account-Endpunkt
   * (kein Chat-Token-Verbrauch).
   */
  healthCheck: { url: string; auth: "bearer" | "x-api-key" | "query-key" | "none"; provider: "openai" | "google" | "anthropic" | "openrouter" | "huggingface" | "local" } | null;
};

export const PROVIDER_ADMIN_META: readonly ProviderAdminMeta[] = [
  {
    id: "openai",
    label: "OpenAI",
    envKeys: ["AI_OPENAI_API_KEY", "OPENAI_API_KEY"],
    defaultModelEnv: "AI_OPENAI_MODEL",
    local: false,
    healthCheck: { url: "https://api.openai.com/v1/models", auth: "bearer", provider: "openai" },
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envKeys: ["AI_GEMINI_API_KEY", "GEMINI_API_KEY"],
    defaultModelEnv: "AI_GEMINI_MODEL",
    local: false,
    healthCheck: { url: "https://generativelanguage.googleapis.com/v1beta/models", auth: "query-key", provider: "google" },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envKeys: ["AI_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"],
    defaultModelEnv: "AI_ANTHROPIC_MODEL",
    local: false,
    healthCheck: { url: "https://api.anthropic.com/v1/models", auth: "x-api-key", provider: "anthropic" },
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKeys: ["AI_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
    defaultModelEnv: "AI_OPENROUTER_MODEL",
    local: false,
    healthCheck: { url: "https://openrouter.ai/api/v1/auth/key", auth: "bearer", provider: "openrouter" },
  },
  {
    id: "groq",
    label: "Groq",
    envKeys: ["AI_GROQ_API_KEY", "GROQ_API_KEY"],
    defaultModelEnv: "AI_GROQ_MODEL",
    local: false,
    healthCheck: { url: "https://api.groq.com/openai/v1/models", auth: "bearer", provider: "openai" },
  },
  {
    id: "together",
    label: "Together AI",
    envKeys: ["AI_TOGETHER_API_KEY", "TOGETHER_API_KEY"],
    defaultModelEnv: "AI_TOGETHER_MODEL",
    local: false,
    healthCheck: { url: "https://api.together.xyz/v1/models", auth: "bearer", provider: "openai" },
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    envKeys: ["AI_HUGGINGFACE_API_KEY", "HF_TOKEN"],
    defaultModelEnv: null,
    local: false,
    healthCheck: { url: "https://huggingface.co/api/whoami-v2", auth: "bearer", provider: "huggingface" },
  },
  {
    id: "ollama",
    label: "Ollama (lokal)",
    envKeys: [],
    defaultModelEnv: "AI_OLLAMA_MODEL",
    local: true,
    healthCheck: { url: "http://127.0.0.1:11434/api/tags", auth: "none", provider: "local" },
  },
  {
    id: "lmstudio",
    label: "LM Studio (lokal)",
    envKeys: [],
    defaultModelEnv: "AI_LMSTUDIO_MODEL",
    local: true,
    healthCheck: { url: "http://127.0.0.1:1234/v1/models", auth: "none", provider: "local" },
  },
  {
    id: "managed",
    label: "Managed/Forge (Built-in)",
    envKeys: ["BUILT_IN_FORGE_API_KEY"],
    defaultModelEnv: "BUILT_IN_FORGE_MODEL",
    local: false,
    // Der Managed-Pool wird in server/_core/llm.ts eigenstaendig verwaltet
    // (BUILT_IN_FORGE_API_URL); hier nur Monitoring/Stati.
    healthCheck: null,
  },
  {
    id: "custom",
    label: "Eigener Endpoint (OpenAI-kompatibel)",
    envKeys: ["AI_CUSTOM_API_KEY", "CUSTOM_OPENAI_API_KEY"],
    defaultModelEnv: "AI_CUSTOM_MODEL",
    local: false,
    // Health-Check nur gegen den konfigurierten ENV-Base-URL (SSRF-Schutz:
    // keine frei waehlbaren URLs).
    healthCheck: null,
  },
];

export function providerAdminMeta(id: ProviderAdminId): ProviderAdminMeta {
  const meta = PROVIDER_ADMIN_META.find((entry) => entry.id === id);
  if (!meta) throw new Error(`Unbekannter Provider: ${id}`);
  return meta;
}

// ---------------------------------------------------------------------------
// Status-Modell (Phase 2)
// ---------------------------------------------------------------------------

export type ProviderKeyDiagnosis =
  | "configured"
  | "healthy"
  | "invalid"
  | "expired"
  | "revoked"
  | "permission_denied"
  | "rate_limited"
  | "quota"
  | "timeout"
  | "unavailable"
  | "network_error"
  | "missing_key"
  | "disabled"
  | "unknown";

export const DIAGNOSIS_LABELS: Record<ProviderKeyDiagnosis, string> = {
  configured: "Konfiguriert",
  healthy: "Gesund",
  invalid: "Ungültiger Key",
  expired: "Key abgelaufen",
  revoked: "Key widerrufen",
  permission_denied: "Keine Berechtigung",
  rate_limited: "Rate-Limit erreicht",
  quota: "Billing-/Quota-Problem",
  timeout: "Timeout",
  unavailable: "Provider nicht verfügbar",
  network_error: "Netzwerkfehler",
  missing_key: "Key fehlt",
  disabled: "Deaktiviert",
  unknown: "Unbekannt",
};

/**
 * Klassifiziert einen Health-Check-/Aufruffehler praezise und sicher.
 * Die Fehlermeldung wird gekuerzt und von Key-Resten befreit — niemals
 * rohe Provider-Antworten oder Authorization-Header durchreichen.
 */
export function classifyProviderFailure(input: {
  status?: number;
  bodyText?: string | null;
  timeoutMs?: number;
  errorText?: string | null;
}): { diagnosis: ProviderKeyDiagnosis; safeMessage: string } {
  const { status, bodyText, errorText } = input;
  const body = (bodyText ?? "").slice(0, 300);
  const err = (errorText ?? "").slice(0, 300);

  if (status === 401) return { diagnosis: "invalid", safeMessage: "HTTP 401 — Key ungültig oder abgelaufen." };
  if (status === 403) {
    if (/expir|abgelauf/i.test(body)) return { diagnosis: "expired", safeMessage: "HTTP 403 — Key abgelaufen." };
    if (/revok|widerruf|suspend|blocked|disabled/i.test(body)) return { diagnosis: "revoked", safeMessage: "HTTP 403 — Key widerrufen oder gesperrt." };
    return { diagnosis: "permission_denied", safeMessage: "HTTP 403 — unzureichende Berechtigungen." };
  }
  if (status === 402) return { diagnosis: "quota", safeMessage: "HTTP 402 — Billing-/Quota-Problem." };
  if (status === 429) return { diagnosis: "rate_limited", safeMessage: "HTTP 429 — Rate-Limit erreicht." };
  if (status === 408) return { diagnosis: "timeout", safeMessage: "HTTP 408 — Timeout." };
  if (status !== undefined && status >= 500) return { diagnosis: "unavailable", safeMessage: `HTTP ${status} — Provider nicht verfügbar.` };
  if (/abort|timeout|ETIMEDOUT/i.test(err)) return { diagnosis: "timeout", safeMessage: "Zeitüberschreitung beim Health-Check." };
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed|ECONNRESET/i.test(err)) {
    return { diagnosis: "network_error", safeMessage: "Netzwerkfehler — Provider nicht erreichbar." };
  }
  if (/insufficient|billing|quota|credit/i.test(body)) return { diagnosis: "quota", safeMessage: "Provider meldet ein Billing-/Quota-Problem." };
  return { diagnosis: "unknown", safeMessage: "Unbestimmter Fehler beim Health-Check." };
}

/** Maskierter Key-Fingerprint — niemals der Voll-Key. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "(leer)";
  const prefix = trimmed.slice(0, Math.min(7, Math.max(trimmed.length - 4, 0)));
  const suffix = trimmed.slice(-4);
  return `${prefix}…${suffix}`;
}

// ---------------------------------------------------------------------------
// Ablaufueberwachung (Phase 6)
// ---------------------------------------------------------------------------

export type ExpiryWarningLevel = "ok" | "warn_14d" | "warn_7d" | "warn_24h" | "expired" | "unknown";

export const EXPIRY_WARNING_LABELS: Record<ExpiryWarningLevel, string> = {
  ok: "Läuft nicht bald ab",
  warn_14d: "Läuft in ≤ 14 Tagen ab",
  warn_7d: "Läuft in ≤ 7 Tagen ab",
  warn_24h: "Läuft in ≤ 24 Stunden ab",
  expired: "Abgelaufen",
  unknown: "Ablaufdatum unbekannt",
};

export function expiryWarningLevel(expiresAt: string | null | undefined, now: number = Date.now()): ExpiryWarningLevel {
  if (!expiresAt) return "unknown";
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return "unknown";
  const diff = ts - now;
  if (diff <= 0) return "expired";
  const DAY = 86_400_000;
  if (diff <= DAY) return "warn_24h";
  if (diff <= 7 * DAY) return "warn_7d";
  if (diff <= 14 * DAY) return "warn_14d";
  return "ok";
}

// ---------------------------------------------------------------------------
// Active/Standby-Rotation (Phase 5)
// ---------------------------------------------------------------------------

export type RotationStage = "idle" | "standby_staged" | "verifying" | "promoted" | "failed";

export type RotationDecision =
  | { action: "promote"; reason: string }
  | { action: "keep_active"; reason: string; diagnosis: ProviderKeyDiagnosis };

/**
 * Rotationsentscheidung: Der Standby-Key wird NUR nach erfolgreichem
 * Health-Check aktiviert. Bei jedem Misserfolg bleibt der aktive Key
 * unveraendert (keine Aktivierung, keine Loeschung).
 */
export function decideRotation(healthResult: {
  ok: boolean;
  diagnosis?: ProviderKeyDiagnosis;
}): RotationDecision {
  if (healthResult.ok) {
    return { action: "promote", reason: "Standby-Key hat den Health-Check bestanden und wird aktiviert." };
  }
  return {
    action: "keep_active",
    reason: `Rotation abgebrochen — aktiver Key bleibt unverändert. Grund: ${
      healthResult.diagnosis ? DIAGNOSIS_LABELS[healthResult.diagnosis] : "Health-Check fehlgeschlagen"
    }`,
    diagnosis: healthResult.diagnosis ?? "unknown",
  };
}

// ---------------------------------------------------------------------------
// Verschluesselung ruhender Keys (Phase 11)
// ---------------------------------------------------------------------------

const ENCRYPTION_INFO = "cybersarah-provider-key-v1";

function deriveEncryptionKey(secret: string): Buffer {
  // Deterministisch aus dem Server-Secret (stabil ueber Neustarts), 32 Bytes
  // fuer AES-256. scrypt mit festem Salt = Info-String (das Secret selbst ist
  // geheim; der Salt muss nur stabil sein).
  return scryptSync(secret, ENCRYPTION_INFO, 32);
}

/** AES-256-GCM: Gibt iv:tag:ciphertext (jeweils hex) zurueck. */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Verschlüsselter Key-Datensatz ist beschädigt.");
  const key = deriveEncryptionKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Stabiler, nicht-geheimer Hash zur Integritaetspruefung (kein Secret). */
export function secretIntegrityHash(value: string): string {
  return createHash("sha256").update(`${ENCRYPTION_INFO}:${value}`).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Secret-freie Audit-Events (Phase 8)
// ---------------------------------------------------------------------------

export type ProviderAuditEventKind =
  | "key_staged"
  | "rotation_started"
  | "rotation_succeeded"
  | "rotation_failed"
  | "provider_disabled"
  | "provider_enabled"
  | "health_check_run";

export type ProviderAuditEvent = {
  id: string;
  kind: ProviderAuditEventKind;
  provider: ProviderAdminId;
  at: string;
  /** Nur sichere Diagnose — niemals Keys, Header oder Prompts. */
  detail: string;
};

/**
 * Entfernt jede Form von Geheimnis aus einem Audit-Detail: Bearer-Header,
 * langes Key-artiges Material (sk-…, AIza…, ghp_…, hex Blobs).
 */
export function sanitizeAuditDetail(detail: string): string {
  return detail
    .replace(/(bearer|authorization|x-api-key|api[-_]?key)\s*[:=]?\s*\S+/gi, "$1: [REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{8,}|[a-f0-9]{32,})\b/g, "[REDACTED]")
    .slice(0, 280);
}

export function buildAuditEvent(input: {
  kind: ProviderAuditEventKind;
  provider: ProviderAdminId;
  detail: string;
  id?: string;
  at?: string;
}): ProviderAuditEvent {
  return {
    id: input.id ?? randomBytes(8).toString("hex"),
    kind: input.kind,
    provider: input.provider,
    at: input.at ?? new Date().toISOString(),
    detail: sanitizeAuditDetail(input.detail),
  };
}

/** Praefix fuer die Admin-Meldung, wenn ein Key fehlt (kein erfundener Key). */
export function missingKeyGuidance(meta: ProviderAdminMeta): {
  envVar: string;
  guidance: string;
} {
  const envVar = meta.envKeys[0] ?? "(kein Key nötig — lokaler Provider)";
  return {
    envVar,
    guidance:
      `Kein API-Key für ${meta.label} konfiguriert. Hinterlege den Key sicher über ` +
      `die Server-Umgebungsvariable ${envVar} (Render-Umgebung oder .env am Server) ` +
      `oder über diesen Admin-Bereich (verschlüsselte Hinterlegung mit Health-Check). ` +
      `Das System verwendet KEINEN erfundenen Key und lässt den Provider im Routing deaktiviert, bis ein gültiger Key hinterlegt ist.`,
  };
}

// ---------------------------------------------------------------------------
// Matrix-Zeilen (Phase 1 Provider-Matrix + Phase 6 Anzeige)
// ---------------------------------------------------------------------------

export type ProviderMatrixRow = {
  id: ProviderAdminId;
  label: string;
  model: string | null;
  envVar: string | null;
  local: boolean;
  keySource: "env" | "admin_store" | "none";
  maskedKey: string | null;
  diagnosis: ProviderKeyDiagnosis;
  diagnosisLabel: string;
  lastCheckedAt: string | null;
  lastSafeError: string | null;
  expiresAt: string | null;
  expiryWarning: ExpiryWarningLevel;
  expiryLabel: string;
  disabled: boolean;
  nextCheckAt: string | null;
  standbyStaged: boolean;
  fallbackRank: number | null;
  requests24h: number | null;
  failures24h: number | null;
  avgLatencyMs: number | null;
};

// ---------------------------------------------------------------------------
// Key-Pools & autonome Rotation (Sprint 155)
// ---------------------------------------------------------------------------

/**
 * ENV-Keys duerfen kommagetrennte Pools enthalten ("key1,key2,key3").
 * Leere Segmente und Whitespace werden ignoriert; niemals werden Keys
 * geloggt oder zurueckgegeben — nur die Pool-Groesse ist interessant.
 */
export function parseKeyPool(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Diagnosen, die die autonome Rotations-Pipeline ausloesen. */
export function shouldTriggerAutonomousRotation(diagnosis: ProviderKeyDiagnosis): boolean {
  return diagnosis === "invalid" || diagnosis === "expired" || diagnosis === "revoked" || diagnosis === "rate_limited" || diagnosis === "quota";
}

/**
 * Naechster Pool-Index: sequenziell durch den Pool, danach vorne wieder
 * anfangen (Ring). Ein Pool der Groesse 1 hat keinen zweiten Key.
 */
export function nextPoolIndex(currentIndex: number, poolSize: number): number {
  if (poolSize <= 1) return 0;
  return (currentIndex + 1) % poolSize;
}

/** Mindestabstand zwischen zwei autonomen Rotationen je Provider (Drossel). */
export const AUTONOMOUS_ROTATION_MIN_INTERVAL_MS = 5 * 60 * 1000;

export type SecretManagerConfig =
  | { type: "render"; token: string; serviceRef: string }
  | { type: "vault" | "aws" | "gcp"; token: string; serviceRef: string | null }
  | null;

/**
 * Autorisierte Secret-Manager-Konfiguration — nur wenn Admin sie explizit
 * hinterlegt hat, darf das System Keys automatisch beziehen. Ohne Token
 * gilt: keine Beschaffung, ehrlicher Status "kein autorisierter
 * Secret-Manager konfiguriert".
 */
export function parseSecretManagerConfig(env: Record<string, string | undefined>): SecretManagerConfig {
  const type = (env.SECRET_MANAGER_TYPE ?? "").trim().toLowerCase();
  const token = (env.SECRET_MANAGER_API_TOKEN ?? env.RENDER_API_KEY ?? "").trim();
  const serviceRef = (env.SECRET_MANAGER_RENDER_SERVICE ?? env.RENDER_SERVICE_ID ?? "").trim();
  if (!type || !token) return null;
  if (type === "render") {
    if (!serviceRef) return null;
    return { type: "render", token, serviceRef };
  }
  if (type === "vault" || type === "aws" || type === "gcp") {
    return { type, token, serviceRef: serviceRef || null };
  }
  return null;
}

/** Timing-sicherer Vergleich fuer Webhook-Auth (kein early-exit Leak). */
export function webhookSecretMatches(provided: string | undefined, expected: string | undefined): boolean {
  const a = (provided ?? "").trim();
  const b = (expected ?? "").trim();
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
