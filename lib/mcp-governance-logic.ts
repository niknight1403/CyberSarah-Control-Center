/**
 * CyberSarah Control Center — MCP-Governance-Logik (Sprint 3)
 *
 * Reine, testbare Logik des Governance-Gateways (Mission Punkt 3 und 5):
 *
 *   - Fähigkeitsprofil je Werkzeug (`deriveCapabilities`) aus Name,
 *     Beschreibung und Eingabe-Schema — konservativ, nachvollziehbar.
 *   - Semantische Suche (`searchTools`): IDF-gewichtet über die Deskriptoren,
 *     damit Agenten "Tool zum Lesen von PDFs" fragen können statt IDs zu kennen.
 *   - Risikoklassifizierung (`classifyRisk`): destruktive Aktionen, Schreib-,
 *     Ausführungs- und Zahlungsmuster werden erkannt, nicht geraten.
 *   - Policy-Entscheidung (`evaluateToolPolicy`): block / Freigabe / erlaubt,
 *     inklusive Least-Privilege-Abgleich gegen die Server-Berechtigungen.
 *   - Argument-Sanitizing (`sanitizeToolArguments`): Tiefe, Größe, verbotene
 *     Schlüssel, Pfad-Traversal und Shell-Metazeichen.
 *   - Fingerprint (`buildToolSignature`): erkennt geänderte Tool-Schemas, damit
 *     eine frühere Freigabe nicht stillschweigend weiter gilt.
 *
 * Kein IO, keine Zeitabhängigkeit außer übergebener Werte.
 */
import { createHash } from "crypto";

export type CapabilityTag =
  | "filesystem"
  | "database"
  | "web"
  | "search"
  | "code-execution"
  | "communication"
  | "payments"
  | "crm"
  | "media"
  | "devops"
  | "calendar"
  | "analytics"
  | "other";

export const CAPABILITY_TAGS: readonly CapabilityTag[] = [
  "filesystem",
  "database",
  "web",
  "search",
  "code-execution",
  "communication",
  "payments",
  "crm",
  "media",
  "devops",
  "calendar",
  "analytics",
  "other",
];

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type GovernanceMode = "manual" | "assisted" | "autonomous";
export type PolicyDecision = "allow" | "approval_required" | "block";

/** Fähigkeit → Berechtigung, die ein Server dafür besitzen muss. */
const CAPABILITY_PERMISSION: Record<CapabilityTag, readonly string[]> = {
  filesystem: ["filesystem"],
  database: ["read"],
  web: ["network"],
  search: ["read"],
  "code-execution": ["shell"],
  communication: ["write"],
  payments: ["write"],
  crm: ["read"],
  media: ["read"],
  devops: ["write"],
  calendar: ["read"],
  analytics: ["read"],
  other: ["read"],
};

/** Schlüsselwörter je Fähigkeit — Deutsch und Englisch, klein geschrieben. */
const CAPABILITY_KEYWORDS: Record<CapabilityTag, readonly string[]> = {
  filesystem: ["file", "files", "datei", "dateien", "verzeichnis", "directory", "folder", "path", "pfad", "pdf", "upload", "download"],
  database: ["sql", "database", "datenbank", "query", "table", "tabelle", "postgres", "sqlite", "mysql", "mongo", "record", "datensatz"],
  web: ["http", "url", "fetch", "website", "webseite", "scrape", "crawl", "api request", "browser", "internet", "weather", "wetter", "forecast"],
  search: ["search", "suche", "find", "lookup", "query index", "grep", "semantic"],
  "code-execution": ["shell", "bash", "exec", "execute", "command", "befehl", "terminal", "script", "code run", "python", "node"],
  communication: ["email", "e-mail", "mail", "send", "senden", "message", "nachricht", "slack", "telegram", "whatsapp", "sms", "discord"],
  payments: ["payment", "pay", "charge", "refund", "invoice", "rechnung", "stripe", "payout", "preis", "price", "checkout"],
  crm: ["crm", "contact", "kontakt", "lead", "deal", "pipeline", "customer", "kunde", "hubspot", "salesforce"],
  media: ["image", "bild", "video", "audio", "voice", "stimme", "thumbnail", "render", "transcribe", "tts"],
  devops: ["deploy", "docker", "kubernetes", "container", "ci", "pipeline", "github", "git", "release", "server", "infrastructure"],
  calendar: ["calendar", "kalender", "event", "termin", "meeting", "schedule"],
  analytics: ["analytics", "metrics", "kpi", "report", "bericht", "statistics", "statistik", "traffic", "conversion"],
  other: [],
};

const STOPWORDS = new Set([
  "der", "die", "das", "und", "oder", "ein", "eine", "einen", "einem", "fuer", "für", "mit", "von", "zum", "zur",
  "the", "a", "an", "and", "or", "of", "to", "for", "with", "in", "on", "by", "is", "are", "this", "that",
  "tool", "tools", "werkzeug", "werkzeuge", "server", "mcp", "function", "funktion", "return", "returns",
  "zum", "zur", "im", "am", "den", "dem", "des", "einen", "einem", "einer", "mir", "bitte",
]);

const DESTRUCTIVE_WORDS = new Set([
  "delete", "remove", "destroy", "drop", "truncate", "purge", "wipe", "erase", "kill", "terminate",
  "shutdown", "reboot", "reset", "löschen", "loeschen", "entfernen", "zerstören",
]);
const WRITE_WORDS = new Set([
  "create", "write", "update", "patch", "insert", "upsert", "set", "put", "post", "upload", "append",
  "move", "rename", "edit", "publish", "deploy", "send", "senden", "schreiben", "schreibt", "speichern",
  "speichert", "ändern", "aendern", "ändert", "aendert",
]);
const MONEY_WORDS = new Set([
  "charge", "refund", "payout", "transfer", "invoice", "payment", "pay", "checkout", "subscribe",
  "billing", "price", "preis", "rechnung", "zahlung", "zahlen",
]);
const EXEC_WORDS = new Set(["exec", "execute", "shell", "bash", "spawn", "eval", "subprocess", "terminal", "command", "befehl"]);
const SECRET_WORDS = new Set(["secret", "credential", "credentials", "password", "passwort", "privatekey", "apikey", "token"]);

/** Zerlegt Text in Wortstämme, damit "drop_table" und "drop" gleich zählen. */
function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9äöüß]+/)
      .filter((word) => word.length > 0),
  );
}

function hits(words: Set<string>, vocabulary: ReadonlySet<string>): boolean {
  for (const word of words) if (vocabulary.has(word)) return true;
  return false;
}

export interface ToolDescriptorLike {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface ToolProfile {
  serverKey: string;
  name: string;
  description: string;
  capabilities: CapabilityTag[];
  primaryCapability: CapabilityTag;
  /** Suchterme (klein, ohne Stoppwörter, dedupliziert). */
  tokens: string[];
  signature: string;
}

export interface RankedTool {
  serverKey: string;
  name: string;
  score: number;
  capabilities: CapabilityTag[];
  matchedTerms: string[];
  description: string;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s_-]/g, " ")
    .split(/[\s_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/** Fähigkeitsprofil aus Deskriptor ableiten (Name zählt doppelt). */
export function deriveCapabilities(tool: ToolDescriptorLike): {
  capabilities: CapabilityTag[];
  primaryCapability: CapabilityTag;
  confidence: number;
} {
  const nameText = tool.name.toLowerCase();
  const descriptionText = (tool.description ?? "").toLowerCase();
  const scores = new Map<CapabilityTag, number>();

  for (const tag of CAPABILITY_TAGS) {
    if (tag === "other") continue;
    let score = 0;
    for (const keyword of CAPABILITY_KEYWORDS[tag]) {
      if (nameText.includes(keyword)) score += 2;
      if (descriptionText.includes(keyword)) score += 1;
    }
    if (score > 0) scores.set(tag, score);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return { capabilities: ["other"], primaryCapability: "other", confidence: 0 };

  const capabilities = ranked.slice(0, 3).map(([tag]) => tag);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);
  const confidence = Math.min(1, Math.round((ranked[0][1] / total) * 100) / 100);
  return { capabilities, primaryCapability: ranked[0][0], confidence };
}

/** Stabiler Fingerprint über Name, Beschreibung und Schema. */
export function buildToolSignature(tool: ToolDescriptorLike): string {
  const schema = tool.inputSchema === undefined ? "" : stableStringify(tool.inputSchema);
  return createHash("sha256")
    .update(`${tool.name}\u0000${tool.description ?? ""}\u0000${schema}`)
    .digest("hex")
    .slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Baut Profile für alle Tools eines Servers. */
export function buildToolProfiles(serverKey: string, tools: ToolDescriptorLike[]): ToolProfile[] {
  return tools.map((tool) => {
    const description = tool.description ?? "";
    const capabilities = deriveCapabilities(tool);
    return {
      serverKey,
      name: tool.name,
      description,
      capabilities: capabilities.capabilities,
      primaryCapability: capabilities.primaryCapability,
      tokens: [...new Set(tokenize(`${tool.name} ${description}`))],
      signature: buildToolSignature(tool),
    };
  });
}

/**
 * Semantische Suche über Tool-Profile: IDF-gewichtet, damit seltene,
 * aussagekräftige Begriffe ("pdf") stärker zählen als häufige ("get").
 */
export function searchTools(
  query: string,
  profiles: ToolProfile[],
  options: { limit?: number; capability?: CapabilityTag; serverKey?: string } = {},
): RankedTool[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || profiles.length === 0) return [];

  const candidates = profiles.filter(
    (profile) =>
      (!options.capability || profile.capabilities.includes(options.capability)) &&
      (!options.serverKey || profile.serverKey === options.serverKey),
  );
  if (candidates.length === 0) return [];

  const documentFrequency = new Map<string, number>();
  for (const profile of candidates) {
    for (const token of new Set(profile.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const ranked: RankedTool[] = [];
  for (const profile of candidates) {
    const tokenSet = new Set(profile.tokens);
    const nameTokens = new Set(tokenize(profile.name));
    let score = 0;
    const matchedTerms: string[] = [];
    for (const token of queryTokens) {
      if (tokenSet.has(token)) {
        const df = documentFrequency.get(token) ?? 1;
        const idf = Math.log(1 + candidates.length / df);
        score += idf + (nameTokens.has(token) ? 0.8 : 0);
        matchedTerms.push(token);
        continue;
      }
      // Wortstamm-Treffer (z. B. "pdfs" -> "pdf", "pdf" in "pdf_reader") schwächer gewichten.
      if (
        profile.tokens.some(
          (candidate) =>
            candidate.length >= 3 &&
            token.length >= 3 &&
            (candidate.startsWith(token) || token.startsWith(candidate) || (token.length >= 4 && candidate.includes(token))),
        )
      ) {
        score += 0.5;
        matchedTerms.push(`~${token}`);
      }
    }
    if (matchedTerms.length === 0) continue;
    if (options.capability && profile.primaryCapability === options.capability) score += 0.6;
    ranked.push({
      serverKey: profile.serverKey,
      name: profile.name,
      score: Math.round(score * 100) / 100,
      capabilities: profile.capabilities,
      matchedTerms: [...new Set(matchedTerms)],
      description: profile.description,
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(options.limit ?? 10, 50)));
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
}

/** Risikoklasse aus Name, Beschreibung und Fähigkeitsprofil. */
export function classifyRisk(tool: ToolDescriptorLike, profile?: Pick<ToolProfile, "capabilities">): RiskAssessment {
  const text = `${tool.name} ${tool.description ?? ""}`;
  const words = wordSet(text);
  const capabilities = profile?.capabilities ?? deriveCapabilities(tool).capabilities;
  const reasons: string[] = [];
  let level: RiskLevel = "low";

  const bump = (next: RiskLevel) => {
    const order: RiskLevel[] = ["low", "medium", "high", "critical"];
    if (order.indexOf(next) > order.indexOf(level)) level = next;
  };

  if (hits(words, MONEY_WORDS)) {
    bump("critical");
    reasons.push("Zahlungs-/Abrechnungsmuster im Werkzeugnamen");
  }
  if (hits(words, EXEC_WORDS) || capabilities.includes("code-execution")) {
    bump("critical");
    reasons.push("Code- oder Shell-Ausführung möglich");
  }
  if (hits(words, SECRET_WORDS)) {
    bump("high");
    reasons.push("Zugriff auf Zugangsdaten/Secrets möglich");
  }
  if (hits(words, DESTRUCTIVE_WORDS)) {
    bump("high");
    reasons.push("destruktive Aktion erkannt (löschen/entfernen/beenden)");
  }
  if (hits(words, WRITE_WORDS)) {
    bump("high");
    reasons.push("schreibende Aktion (erstellen/ändern/senden/veröffentlichen)");
  }
  if (capabilities.includes("filesystem")) {
    bump("medium");
    reasons.push("Dateisystemzugriff");
  }
  if (capabilities.includes("web")) {
    bump("medium");
    reasons.push("externer Netzwerkzugriff");
  }
  if (capabilities.includes("database") && hits(words, WRITE_WORDS)) {
    bump("critical");
    reasons.push("schreibender Datenbankzugriff");
  }
  if (reasons.length === 0) reasons.push("lesende Standardoperation");
  return { level, reasons };
}

export interface GovernancePolicy {
  mode: GovernanceMode;
  /** Explizit verbotene Werkzeuge ("server::tool" oder nur Toolname). */
  deny?: readonly string[];
  /** Immer erlaubte Werkzeuge, die die Risikostufe senken (nicht die Rechte). */
  allow?: readonly string[];
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  riskLevel: RiskLevel;
  reasons: string[];
  missingPermissions: string[];
  requiredPermission: string | null;
}

/**
 * Entscheidet, ob ein Werkzeug aufgerufen werden darf.
 *
 * Reihenfolge ist bewusst: Deny-Liste → Least Privilege → Risiko/Freigabemodus.
 * Ein "allow"-Eintrag kann nur die Freigabe ersetzen, niemals fehlende
 * Berechtigungen — Rechte bleiben Sache des Servers.
 */
export function evaluateToolPolicy(input: {
  serverKey: string;
  tool: ToolDescriptorLike;
  profile?: Pick<ToolProfile, "capabilities">;
  permissions: readonly string[];
  policy?: GovernancePolicy;
}): PolicyEvaluation {
  const capabilities = input.profile?.capabilities ?? deriveCapabilities(input.tool).capabilities;
  const risk = classifyRisk(input.tool, { capabilities });
  const mode = input.policy?.mode ?? "assisted";
  const reasons = [...risk.reasons];

  const identifiers = [`${input.serverKey}::${input.tool.name}`, input.tool.name];
  const denied = (input.policy?.deny ?? []).some((entry) => identifiers.includes(entry));
  const explicitlyAllowed = (input.policy?.allow ?? []).some((entry) => identifiers.includes(entry));

  // Welche Berechtigung verlangt die primäre Fähigkeit?
  const requiredFor = capabilities.flatMap((tag) => CAPABILITY_PERMISSION[tag] ?? ["read"]);
  const uniqueRequired = [...new Set(requiredFor)];
  const missingPermissions = uniqueRequired.filter((permission) => !input.permissions.includes(permission));
  const requiredPermission = uniqueRequired.length === 1 ? uniqueRequired[0] : null;

  if (denied) {
    return {
      decision: "block",
      riskLevel: risk.level,
      reasons: [...reasons, "Werkzeug steht auf der Deny-Liste"],
      missingPermissions,
      requiredPermission,
    };
  }

  if (missingPermissions.length > 0) {
    return {
      decision: "block",
      riskLevel: risk.level,
      reasons: [...reasons, `Server-Berechtigung fehlt: ${missingPermissions.join(", ")}`],
      missingPermissions,
      requiredPermission,
    };
  }

  if (explicitlyAllowed) {
    return {
      decision: "allow",
      riskLevel: risk.level,
      reasons: [...reasons, "Werkzeug ist explizit erlaubt"],
      missingPermissions,
      requiredPermission,
    };
  }

  // Kritische Aktionen brauchen immer eine menschliche Freigabe.
  if (risk.level === "critical") {
    return {
      decision: "approval_required",
      riskLevel: risk.level,
      reasons,
      missingPermissions,
      requiredPermission,
    };
  }

  const threshold: Record<GovernanceMode, readonly RiskLevel[]> = {
    manual: ["medium", "high", "critical"],
    assisted: ["high", "critical"],
    autonomous: ["critical"],
  };

  if (threshold[mode].includes(risk.level)) {
    return { decision: "approval_required", riskLevel: risk.level, reasons, missingPermissions, requiredPermission };
  }

  return { decision: "allow", riskLevel: risk.level, reasons, missingPermissions, requiredPermission };
}

export interface SanitizeResult {
  ok: boolean;
  args: Record<string, unknown>;
  issues: string[];
}

const MAX_DEPTH = 6;
const MAX_BYTES = 32_768;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SHELL_METACHARACTERS = /[;&|`$<>]|\$\(|\|\|/;
const TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;

/**
 * Prüft Argumente vor dem Aufruf. Es wird nichts umgeschrieben: entweder die
 * Argumente sind unbedenklich, oder der Aufruf wird mit Klartextgrund abgelehnt.
 */
export function sanitizeToolArguments(
  args: unknown,
  options: { capabilities?: readonly CapabilityTag[] } = {},
): SanitizeResult {
  const issues: string[] = [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { ok: false, args: {}, issues: ["Argumente müssen ein Objekt sein"] };
  }
  const record = args as Record<string, unknown>;

  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(record), "utf8");
  } catch {
    return { ok: false, args: {}, issues: ["Argumente sind nicht serialisierbar"] };
  }
  if (size > MAX_BYTES) issues.push(`Argumente zu groß (${size} > ${MAX_BYTES} Bytes)`);

  const shell = options.capabilities?.includes("code-execution") ?? false;
  const filesystem = options.capabilities?.includes("filesystem") ?? false;

  const walk = (value: unknown, depth: number, path: string) => {
    if (depth > MAX_DEPTH) {
      issues.push(`Verschachtelung zu tief bei ${path}`);
      return;
    }
    if (typeof value === "string") {
      if (value.length > 8_000) issues.push(`Wert zu lang bei ${path}`);
      // Steuerzeichen werden immer abgelehnt (Log-Injection, Terminal-Escapes).
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) issues.push(`Steuerzeichen bei ${path}`);
      if (shell && SHELL_METACHARACTERS.test(value)) issues.push(`Shell-Metazeichen bei ${path}`);
      if (filesystem && TRAVERSAL.test(value)) issues.push(`Pfad-Traversal bei ${path}`);
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 200).forEach((entry, index) => walk(entry, depth + 1, `${path}[${index}]`));
      if (value.length > 200) issues.push(`Array zu lang bei ${path}`);
      return;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) {
          issues.push(`Verbotener Schlüssel bei ${path}: ${key}`);
          continue;
        }
        walk(entry, depth + 1, path ? `${path}.${key}` : key);
      }
    }
  };

  walk(record, 0, "");
  return { ok: issues.length === 0, args: record, issues };
}

/** Ablaufzeit einer Freigabe; TTL wird auf 5 Minuten .. 7 Tage begrenzt. */
export function computeApprovalExpiry(nowMs: number, ttlMs = 24 * 60 * 60 * 1000): Date {
  const bounded = Math.min(Math.max(ttlMs, 5 * 60 * 1000), 7 * 24 * 60 * 60 * 1000);
  return new Date(nowMs + bounded);
}

export function isApprovalExpired(expiresAt: Date | null | undefined, nowMs: number): boolean {
  return expiresAt instanceof Date ? expiresAt.getTime() <= nowMs : false;
}

/** Nur genehmigte und nicht abgelaufene Freigaben zählen. */
export function isApprovalUsable(
  approval: { status: string; expiresAt?: Date | null; serverKey?: string; toolName?: string },
  target: { serverKey: string; toolName: string },
  nowMs: number,
): boolean {
  if (approval.status !== "approved") return false;
  if (approval.serverKey && approval.serverKey !== target.serverKey) return false;
  if (approval.toolName && approval.toolName !== target.toolName) return false;
  return !isApprovalExpired(approval.expiresAt, nowMs);
}
