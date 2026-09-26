/**
 * Sprint 366 — Werkzeug-Auswahlstatistik: Nutzung messen, Nie-Nutzung ehrlich räumen
 *
 * Erfasst Aufrufe, Erfolgsraten und Inaktivitätszeiten von Agenten-Werkzeugen.
 * Identifiziert ungenutzte Werkzeuge ("Nie-Nutzung") und bietet eine sichere
 * Bereinigungslogik, um Prompt-Kontext einzusparen, ohne geschützte Kern-Werkzeuge zu entfernen.
 */

export type ToolDefinition = {
  id: string;
  name: string;
  category?: string;
  isCore: boolean; // geschützte Werkzeuge (z. B. bash, write_file) dürfen nie entfernt werden
  enabled: boolean;
  tokenCostEstimate: number; // Geschätzte Tokens für Tool-Definition im System-Prompt
};

export type ToolUsageRecord = {
  toolId: string;
  invocationCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt?: string;
  totalExecutionTimeMs: number;
};

export type ToolUsageStats = {
  toolId: string;
  name: string;
  isCore: boolean;
  enabled: boolean;
  invocationCount: number;
  successRate: number; // 0..100 (%)
  avgTimeMs: number;
  daysUnused: number;
  deprecationCandidate: boolean;
};

export type PruningRecommendation = {
  prunableToolIds: string[];
  prunableToolNames: string[];
  estimatedTokenSavings: number;
  reason: string;
};

/**
 * Erfasst eine Werkzeug-Ausführung und aktualisiert den Nutzungsdatensatz.
 */
export function recordToolInvocation(
  existingRecords: ToolUsageRecord[],
  toolId: string,
  success: boolean,
  executionTimeMs: number,
  nowIso: string = new Date().toISOString()
): ToolUsageRecord[] {
  const existing = existingRecords.find((r) => r.toolId === toolId);

  if (existing) {
    return existingRecords.map((r) => {
      if (r.toolId !== toolId) return r;
      return {
        ...r,
        invocationCount: r.invocationCount + 1,
        successCount: r.successCount + (success ? 1 : 0),
        failureCount: r.failureCount + (success ? 0 : 1),
        lastUsedAt: nowIso,
        totalExecutionTimeMs: r.totalExecutionTimeMs + executionTimeMs,
      };
    });
  }

  return [
    ...existingRecords,
    {
      toolId,
      invocationCount: 1,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      lastUsedAt: nowIso,
      totalExecutionTimeMs: executionTimeMs,
    },
  ];
}

/**
 * Analysiert die Werkzeugnutzung und ermittelt Deprecation-Kandidaten.
 */
export function analyzeToolUsage(
  tools: ToolDefinition[],
  records: ToolUsageRecord[],
  inactivityDaysThreshold: number = 30,
  nowIso: string = new Date().toISOString()
): ToolUsageStats[] {
  const nowMs = new Date(nowIso).getTime();

  return tools.map((tool) => {
    const record = records.find((r) => r.toolId === tool.id);

    if (!record || record.invocationCount === 0) {
      return {
        toolId: tool.id,
        name: tool.name,
        isCore: tool.isCore,
        enabled: tool.enabled,
        invocationCount: 0,
        successRate: 0,
        avgTimeMs: 0,
        daysUnused: 999, // Noch nie genutzt
        deprecationCandidate: tool.enabled && !tool.isCore,
      };
    }

    const lastUsedMs = record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : 0;
    const daysUnused = record.lastUsedAt
      ? Math.floor((nowMs - lastUsedMs) / (1000 * 60 * 60 * 24))
      : 999;

    const successRate =
      record.invocationCount > 0
        ? Math.round((record.successCount / record.invocationCount) * 1000) / 10
        : 0;

    const avgTimeMs =
      record.invocationCount > 0
        ? Math.round(record.totalExecutionTimeMs / record.invocationCount)
        : 0;

    const deprecationCandidate =
      tool.enabled &&
      !tool.isCore &&
      (record.invocationCount === 0 || daysUnused >= inactivityDaysThreshold);

    return {
      toolId: tool.id,
      name: tool.name,
      isCore: tool.isCore,
      enabled: tool.enabled,
      invocationCount: record.invocationCount,
      successRate,
      avgTimeMs,
      daysUnused,
      deprecationCandidate,
    };
  });
}

/**
 * Generiert einen ehrlichen Bereinigungsplan für ungenutzte Nicht-Kern-Werkzeuge.
 */
export function generatePruningPlan(
  tools: ToolDefinition[],
  records: ToolUsageRecord[],
  inactivityDaysThreshold: number = 30,
  nowIso: string = new Date().toISOString()
): PruningRecommendation {
  const stats = analyzeToolUsage(tools, records, inactivityDaysThreshold, nowIso);
  const prunableStats = stats.filter((s) => s.deprecationCandidate);

  const prunableToolIds = prunableStats.map((s) => s.toolId);
  const prunableToolNames = prunableStats.map((s) => s.name);

  const estimatedTokenSavings = prunableToolIds.reduce((sum, id) => {
    const tool = tools.find((t) => t.id === id);
    return sum + (tool?.tokenCostEstimate || 150);
  }, 0);

  return {
    prunableToolIds,
    prunableToolNames,
    estimatedTokenSavings,
    reason:
      prunableToolIds.length > 0
        ? `${prunableToolIds.length} Werkzeuge wurden seit mindestens ${inactivityDaysThreshold} Tagen oder noch nie verwendet und können deaktiviert werden (~${estimatedTokenSavings} Tokens Ersparnis).`
        : "Alle aktiven Werkzeuge werden regelmäßig genutzt oder sind geschützte Kern-Werkzeuge.",
  };
}

/**
 * Führt die Deaktivierung ungenutzter Werkzeuge gemäß Bereinigungsplan durch.
 */
export function pruneUnusedTools(
  tools: ToolDefinition[],
  plan: PruningRecommendation
): { updatedTools: ToolDefinition[]; prunedCount: number } {
  let prunedCount = 0;

  const updatedTools = tools.map((tool) => {
    if (plan.prunableToolIds.includes(tool.id) && !tool.isCore) {
      prunedCount++;
      return { ...tool, enabled: false };
    }
    return tool;
  });

  return { updatedTools, prunedCount };
}
