import { decideAdmission, evaluateUsageBudget, type BudgetConfig, type BudgetLevel, type BudgetResult, type UsageEntry } from "./usage-budget-logic";

export type { BudgetConfig, BudgetLevel, BudgetResult, UsageEntry } from "./usage-budget-logic";

export const USAGE_ENTRIES_STORAGE_KEY = "custom-ai-studio.usage-entries.v1";
export const USAGE_ENTRIES_LIMIT = 500;

export type UsageBudgetViewTone = "ready" | "warning" | "neutral";

export type UsageBudgetView = {
  level: BudgetLevel;
  tone: UsageBudgetViewTone;
  badgeLabel: string;
  usagePercent: number;
  usedCostUnits: number;
  remainingCostUnits: number;
  windowStartMs: number;
  windowEndMs: number;
  summary: string;
  admissionReason: string;
};

const badgeLabels: Record<BudgetLevel, string> = {
  ok: "Budget ok",
  warning: "Budget-Warnung",
  exhausted: "Budget erschöpft",
};

const levelTones: Record<BudgetLevel, UsageBudgetViewTone> = {
  ok: "ready",
  warning: "warning",
  exhausted: "warning",
};

/**
 * Erzeugt die Konfiguration eines rollierenden Nutzungsbudgetfensters.
 * Standard: 30 Tage Fenster, 1000 Kosten­einheiten Limit, 80 Prozent
 * Warnschwelle. Alle Parameter sind über Optionen übersteuerbar; ungültige
 * Werte werden deterministisch abgelehnt.
 */
export function getUsageBudgetConfig(nowMs: number, options?: { windowMs?: number; limitCostUnits?: number; warnThresholdPercent?: number }): BudgetConfig {
  const windowMs = options?.windowMs ?? 30 * 24 * 60 * 60 * 1000;
  const limitCostUnits = options?.limitCostUnits ?? 1_000;
  const warnThresholdPercent = options?.warnThresholdPercent ?? 80;
  if (!Number.isFinite(nowMs)) {
    throw new Error("Ein endlicher Zeitpunkt ist erforderlich.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Das Fenster muss positiv sein.");
  }
  if (!Number.isFinite(limitCostUnits) || limitCostUnits <= 0) {
    throw new Error("Das Budgetlimit muss positiv sein.");
  }
  return {
    windowStartMs: Math.floor(nowMs - windowMs),
    windowEndMs: Math.floor(nowMs),
    limitCostUnits,
    warnThresholdPercent,
  };
}

function isUsageEntry(value: unknown): value is UsageEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { timestampMs?: unknown; costUnits?: unknown };
  return Number.isFinite(candidate.timestampMs) && Number.isFinite(candidate.costUnits);
}

/**
 * Liest persistierte Nutzungseinträge sicher ein: Ungültige Einträge werden
 * verworfen, die Liste deterministisch nach Zeitstempel sortiert und auf das
 * Speicherlimit gekappt. Der Rückgabewert enthält niemals Secrets, Tokens
 * oder Endpoints.
 */
export function parsePersistedUsageEntries(raw: string | null): UsageEntry[] {
  if (!raw) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const entries = parsed
    .filter(isUsageEntry)
    .map((entry) => ({ timestampMs: Number(entry.timestampMs), costUnits: Number(entry.costUnits) }))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  return entries.slice(Math.max(0, entries.length - USAGE_ENTRIES_LIMIT));
}

/**
 * Serialisiert Nutzungseinträge für die Persistenz. Die Serialisierung ist
 * die JSON-Darstellung der gefilterten, sortierten und gekappten Liste.
 */
export function serializeUsageEntries(entries: UsageEntry[]): string {
  const sanitized = parsePersistedUsageEntries(JSON.stringify(entries));
  return JSON.stringify(sanitized);
}

/**
 * Fügt einen neuen Nutzungseintrag deterministisch in eine bestehende Liste
 * ein: sortiert nach Zeitstempel, gekappt auf das Speicherlimit. Ungültige
 * Einträge werden verworfen.
 */
export function appendUsageEntry(existing: UsageEntry[], entry: UsageEntry): UsageEntry[] {
  if (!isUsageEntry(entry)) {
    return parsePersistedUsageEntries(JSON.stringify(existing));
  }
  return parsePersistedUsageEntries(JSON.stringify([...existing, entry]));
}

/**
 * Baut das tokenfreie Ansichtsmodell des Nutzungsbudgets für die
 * Qualitätstafel: bewerteter Zustand, Badge-Text, Ton, Verbrauch und
 * Zulassungsentscheidung mit begründeter Zusammenfassung.
 */
export function buildUsageBudgetView(entries: UsageEntry[], config: BudgetConfig): UsageBudgetView {
  const budget: BudgetResult = evaluateUsageBudget(entries, config);
  const admission = decideAdmission(budget);
  return {
    level: budget.level,
    tone: levelTones[budget.level],
    badgeLabel: badgeLabels[budget.level],
    usagePercent: budget.usagePercent,
    usedCostUnits: budget.usedCostUnits,
    remainingCostUnits: budget.remainingCostUnits,
    windowStartMs: config.windowStartMs,
    windowEndMs: config.windowEndMs,
    summary: budget.summary,
    admissionReason: admission.reason,
  };
}
