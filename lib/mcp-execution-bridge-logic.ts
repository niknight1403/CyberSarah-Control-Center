/**
 * Sprint 9 — Execution Bridge: aus einer Team-Aufgabe einen konkreten
 * Werkzeugaufruf machen, ohne zu raten.
 *
 * Reine Logik. Drei Entscheidungen werden hier getroffen:
 *
 *   1. WELCHES Werkzeug (nur aus den Rechten des Agenten, nie global),
 *   2. ob die Argumente ueberhaupt reichen (fehlende Pflichtfelder blocken),
 *   3. wie ein Ergebnis einzuordnen ist (Erfolg, Freigabe, Retry, Fehlschlag).
 *
 * Argumente werden NICHT erfunden. Fehlt ein Pflichtfeld, bricht der Aufruf
 * ab — eine erfundene ID ist schlimmer als ein ehrlicher Fehlschlag.
 */
import { createHash } from "crypto";

import {
  classifyRisk,
  evaluateToolPolicy,
  searchTools,
  type CapabilityTag,
  type GovernanceMode,
  type PolicyDecision,
  type RiskLevel,
  type ToolDescriptorLike,
  type ToolProfile,
} from "./mcp-governance-logic";

export type BridgeTool = {
  serverKey: string;
  tool: ToolDescriptorLike;
  profile: ToolProfile;
};

export type ToolChoice =
  | { ok: true; serverKey: string; toolName: string; riskLevel: RiskLevel; matched: string[] }
  | { ok: false; code: "no_granted_tools" | "no_match"; reason: string };

/**
 * Waehlt das passendste Werkzeug, aber ausschliesslich aus den Grants des
 * Agenten. Der Katalog wird vorher gefiltert, nicht nachtraeglich.
 */
export function selectToolForTask(input: {
  taskText: string;
  grants: { serverKey: string; toolName: string }[];
  catalog: BridgeTool[];
}): ToolChoice {
  const granted = new Set(input.grants.map((grant) => `${grant.serverKey}\u0000${grant.toolName}`));
  const allowed = input.catalog.filter((entry) => granted.has(`${entry.serverKey}\u0000${entry.tool.name}`));
  if (allowed.length === 0) {
    return {
      ok: false,
      code: "no_granted_tools",
      reason: "Kein Werkzeug des Agenten ist im Katalog vorhanden (Server deaktiviert oder Tool entfernt).",
    };
  }

  const ranked = searchTools(
    input.taskText,
    allowed.map((entry) => entry.profile),
    { limit: allowed.length },
  );
  const best = ranked[0];
  if (!best) {
    return { ok: false, code: "no_match", reason: "Kein zugewiesenes Werkzeug passt zur Aufgabe." };
  }
  const entry = allowed.find((candidate) => candidate.serverKey === best.serverKey && candidate.tool.name === best.name);
  if (!entry) {
    return { ok: false, code: "no_match", reason: "Treffer liess sich keinem Werkzeug zuordnen." };
  }
  return {
    ok: true,
    serverKey: best.serverKey,
    toolName: best.name,
    riskLevel: classifyRisk(entry.tool, entry.profile).level,
    matched: best.matchedTerms,
  };
}

/** Pflichtfelder aus einem JSON-Schema lesen, fehlertolerant. */
export function requiredArguments(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const required = record.required;
  if (!Array.isArray(required)) return [];
  return required.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export type ArgumentCheck =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; missing: string[]; reason: string };

/**
 * Prueft Pflichtfelder. `null`/`undefined`/leerer String zaehlen als fehlend,
 * `0` und `false` nicht — die sind gueltige Werte.
 */
export function checkArguments(input: {
  required: string[];
  provided: Record<string, unknown> | undefined;
}): ArgumentCheck {
  const provided = input.provided ?? {};
  const missing = input.required.filter((key) => {
    const value = provided[key];
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  });
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason: `Pflichtfelder fehlen: ${missing.join(", ")}. Es werden keine Werte erfunden.`,
    };
  }
  return { ok: true, args: provided };
}

export type PolicyGateInput = {
  serverKey: string;
  tool: ToolDescriptorLike;
  profile: Pick<ToolProfile, "capabilities">;
  permissions: readonly string[];
  mode: GovernanceMode;
};

/** Policy-Gate mit den Agenten-Rechten; nutzt die Regeln aus Sprint 3. */
export function gateCall(input: PolicyGateInput): {
  decision: PolicyDecision;
  riskLevel: RiskLevel;
  reasons: string[];
} {
  const evaluation = evaluateToolPolicy({
    serverKey: input.serverKey,
    tool: input.tool,
    profile: input.profile,
    permissions: input.permissions,
    policy: { mode: input.mode },
  });
  return { decision: evaluation.decision, riskLevel: evaluation.riskLevel, reasons: evaluation.reasons };
}

export type CallResultLike = {
  ok: boolean;
  reason?: string;
  retryAfterMs?: number;
  approvalRequired?: { approvalId: number; riskLevel: string; reasons: string[] };
};

export type CallClassification = {
  kind: "success" | "approval_required" | "blocked" | "retryable_failure" | "failure";
  reason: string;
  retryable: boolean;
};

const RETRY_PATTERN = /(timeout|timed out|zeitueberschreitung|econn|enotfound|eai_again|socket|429|rate limit|502|503|504|temporaer)/i;
const BLOCK_PATTERN = /(governance|berechtigung|permission|unbekannter mcp-server|zugangsdaten|deny|blockiert)/i;

/**
 * Ordnet das Ergebnis eines `callTool` ein. Vorsicht bei Retries: nur echte
 * Netzwerk-/Rate-Limit-Fehler gelten als wiederholbar, alles andere nicht.
 */
export function classifyCallResult(result: CallResultLike): CallClassification {
  if (result.ok) return { kind: "success", reason: "Werkzeugaufruf erfolgreich.", retryable: false };

  const reason = (result.reason ?? "Unbekannter Fehler").slice(0, 300);
  if (result.approvalRequired) {
    return { kind: "approval_required", reason: `Freigabe erforderlich: ${reason}`, retryable: false };
  }
  if (BLOCK_PATTERN.test(reason)) {
    return { kind: "blocked", reason, retryable: false };
  }
  if (reason.startsWith("Freigabe erforderlich")) {
    return { kind: "approval_required", reason, retryable: false };
  }
  if (typeof result.retryAfterMs === "number" || RETRY_PATTERN.test(reason)) {
    return { kind: "retryable_failure", reason, retryable: true };
  }
  return { kind: "failure", reason, retryable: false };
}

/** Kanonischer Hash der Argumente — Audit ohne Klartext. */
export function hashArguments(args: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortDeep(args));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep(record[key]);
        return acc;
      }, {});
  }
  return value;
}

/** Nur Schluessel und Typen — niemals Werte. */
export function summarizeArguments(args: Record<string, unknown> | undefined): Record<string, string> {
  if (!args) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null) result[key] = "null";
    else if (Array.isArray(value)) result[key] = `array(${value.length})`;
    else result[key] = typeof value;
  }
  return result;
}

export type AuditDecision = "succeeded" | "approval_required" | "blocked" | "failed";

export type AuditEntryInput = {
  runId: number | null;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  decision: AuditDecision;
  riskLevel: RiskLevel;
  args: Record<string, unknown> | undefined;
  costCents: number;
  durationMs: number;
  note: string;
  attempt: number;
  createdAtMs: number;
};

export type AuditEntry = {
  runId: number | null;
  taskId: string;
  agentKey: string;
  serverKey: string;
  toolName: string;
  decision: AuditDecision;
  riskLevel: RiskLevel;
  argKeys: Record<string, string>;
  argsHash: string;
  costCents: number;
  durationMs: number;
  note: string;
  attempt: number;
  createdAtMs: number;
};

/** Audit-Eintrag ohne Geheimnisse und ohne Argumentwerte. */
export function buildAuditEntry(input: AuditEntryInput): AuditEntry {
  return {
    runId: input.runId,
    taskId: input.taskId,
    agentKey: input.agentKey,
    serverKey: input.serverKey,
    toolName: input.toolName,
    decision: input.decision,
    riskLevel: input.riskLevel,
    argKeys: summarizeArguments(input.args),
    argsHash: hashArguments(input.args ?? {}),
    costCents: Math.max(0, input.costCents),
    durationMs: Math.max(0, input.durationMs),
    note: input.note.slice(0, 300),
    attempt: Math.max(1, input.attempt),
    createdAtMs: input.createdAtMs,
  };
}

/** Kosten je Aufruf: bewusst konservativ und dokumentiert, keine Messung. */
export const DEFAULT_CALL_COST_CENTS = 5;

/** Kurztext fuer Logs. */
export function describeCall(entry: Pick<AuditEntry, "serverKey" | "toolName" | "decision" | "riskLevel">): string {
  return `${entry.serverKey}/${entry.toolName} (${entry.riskLevel}): ${entry.decision}`;
}

/** Faehigkeiten einer Aufgabe fuer die Protokollierung. */
export function capabilitiesOf(profile: Pick<ToolProfile, "capabilities">): CapabilityTag[] {
  return [...profile.capabilities];
}
