/**
 * Optimizer-Logik (rein, testbar) — Autonomer Engineering-Optimizer-Loop.
 *
 * Reine Funktionen fuer den kontinuierlichen Optimierungs-Agenten:
 * Cadence-Entscheidung (laeuft/nicht laeuft), Snapshots → priorisierte
 * Ziel-Formulierung fuer den Orchestrator und Prompt-Bau. Der Loop-Service
 * (server/orchestrator/optimizer-loop.ts) nutzt dieses Modul; Tests decken
 * die Entscheidungslogik ohne Node-Timer ab.
 */

export interface OptimizerFinding {
  /** Kurz-ID, z. B. "db_down", "runtime_errors", "uptime_ok". */
  key: string;
  /** informationsklasse: error > warning > info */
  severity: "error" | "warning" | "info";
  /** Praegnante Beschreibung (Deutsch) mit den wichtigsten Zahlen. */
  detail: string;
}

export interface OptimizerSnapshot {
  /** ISO-Zeit der Erhebung. */
  collectedAt: string;
  /** Datenbank erreichbar? */
  dbHealthy: boolean;
  /** Fehler-/Warnmeldungen der letzten Stunden (Runtime-Logger). */
  runtimeErrors: number;
  runtimeWarnings: number;
  /** Beispiele fuer Fehlermeldungen (max. 5, gekuerzt). */
  errorSamples: string[];
  /** Uptime des Prozesses in Minuten. */
  uptimeMinutes: number;
  /** Letzte erfolgreiche Optimierungs-Zyklen (Objekte mit statusAt/title). */
  lastCycles: { status: string; finishedAt: string; title: string }[];
}

export const OPTIMIZER_SYSTEM_PROMPT = `Du bist der autonome Engineering-Optimizer des "CyberSarah Control Centers".

Zweck: Du analysiert den Systemzustand kontinuierlich und stellst sicher, dass die App und alles was dazugehoert stets auf dem neuesten und maechtigsten Zustand ist.

Arbeitsweise:
1. ANALYSE: Bewerte den uebermittelten System-Snapshot priorisiert — Fehler vor Warnungen, Warnungen vor Hinweisen.
2. OPTIMIERUNGSPLAN: Leite konkrete, umsetzbare Optimierungen ab (Performance, Stabilitaet, Sicherheit, Datenmodell, API-Design, UI-Konsistenz).
3. EHRLICHKEIT: Wenn der Zustand gesund ist, sage das klar — erfinde keine Arbeit. Vermeinde Schein-Optimierungen mit null Impact.
4. PRIORITAET: Maximal 5 Empfehlungen, sortiert nach Impact (hoch zuerst).

Antworte ausschliesslich mit einem JSON-Objekt:
{"status":"healthy"|"needs_action","summary":"Ein-Satz-Bewertung","findings":[{"key":"...","severity":"error|warning|info","detail":"..."}],"recommendations":[{"title":"...","impact":"hoch|mittel|gering","objective":"Vollstaendige, fuer den Orchestrator ausfuehrbare Aufgabenformulierung"}]}`;

/** Prioritaet einer Finding-Severity fuer Sortierung (hoeher = dringender). */
const SEVERITY_RANK: Record<OptimizerFinding["severity"], number> = { error: 3, warning: 2, info: 1 };

/** Sortiert Findings nach Severity (stabil, neueste Information zuerst bleibt gleiche Rangfolge). */
export function sortFindingsBySeverity(findings: OptimizerFinding[]): OptimizerFinding[] {
  return [...findings].sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
}

/**
 * Cadence-Entscheidung (rein): Soll ein Zyklus jetzt starten?
 * - nicht, wenn bereits einer laeuft
 * - nicht vor Ablauf des Intervalls (letzte Aktivitaet + intervalMin)
 * - min. 5 Minuten nach Prozessstart (Boot-Stabilitaet)
 */
export function shouldRunCycle(state: {
  running: boolean;
  lastCycleAtMs: number | null;
  nowMs: number;
  bootedAtMs: number;
  intervalMinutes: number;
}): boolean {
  if (state.running) return false;
  const bootGraceMs = 5 * 60 * 1000;
  if (state.nowMs - state.bootedAtMs < bootGraceMs) return false;
  if (state.lastCycleAtMs == null) return true;
  return state.nowMs - state.lastCycleAtMs >= state.intervalMinutes * 60 * 1000;
}

/** Naechste geschätzte Laufzeit (fuer die Status-Anzeige, rein). */
export function estimateNextCycleAt(state: {
  running: boolean;
  lastCycleAtMs: number | null;
  bootedAtMs: number;
  nowMs: number;
  intervalMinutes: number;
}): string | null {
  if (state.running) return null;
  const base = state.lastCycleAtMs ?? state.bootedAtMs + 5 * 60 * 1000;
  const next = base + state.intervalMinutes * 60 * 1000;
  return new Date(Math.max(next, state.nowMs)).toISOString();
}

/**
 * Baut aus dem Snapshot die Findings (rein) — die analysierende Basis
 * fuer Prompt und Optimierungsziel. Bewusst konservativ: nur ehrliche,
 * messbare Signale werden zu Findings.
 */
export function buildFindingsFromSnapshot(snapshot: OptimizerSnapshot): OptimizerFinding[] {
  const findings: OptimizerFinding[] = [];
  if (!snapshot.dbHealthy) {
    findings.push({
      key: "db_down",
      severity: "error",
      detail: "Datenbank nicht erreichbar — Prio 1: Verbindung und Migrationen pruefen.",
    });
  }
  if (snapshot.runtimeErrors > 0) {
    findings.push({
      key: "runtime_errors",
      severity: snapshot.runtimeErrors > 20 ? "error" : "warning",
      detail: `${snapshot.runtimeErrors} Fehler im Runtime-Log${snapshot.errorSamples.length > 0 ? ` (Beispiel: ${snapshot.errorSamples[0]})` : ""}.`,
    });
  }
  if (snapshot.runtimeWarnings > 10) {
    findings.push({
      key: "runtime_warnings",
      severity: "warning",
      detail: `${snapshot.runtimeWarnings} Warnungen im Runtime-Log — Muster analysieren und Ursachen beheben statt zu quetschen.`,
    });
  }
  const failedCycles = snapshot.lastCycles.filter((c) => c.status === "failed" || c.status === "escalated").length;
  if (failedCycles > 0) {
    findings.push({
      key: "optimizer_backlog",
      severity: "warning",
      detail: `${failedCycles} der letzten Optimierungs-Zyklen sind fehlgeschlagen/eskaliert — Fehlerursache analysieren.`,
    });
  }
  if (findings.length === 0) {
    findings.push({
      key: "healthy",
      severity: "info",
      detail: `System gesund (Uptime ${Math.round(snapshot.uptimeMinutes)} min, keine Fehler im Log, DB erreichbar). Proaktive Verbesserungspotenziale bewerten.`,
    });
  }
  return sortFindingsBySeverity(findings);
}

/** Baut den Analyse-Prompt (rein) aus Snapshot + Findings. */
export function buildOptimizerAnalysisPrompt(snapshot: OptimizerSnapshot, findings: OptimizerFinding[]): string {
  return [
    `System-Snapshot vom ${snapshot.collectedAt}:`,
    `- Datenbank erreichbar: ${snapshot.dbHealthy ? "ja" : "NEIN"}`,
    `- Runtime-Fehler (modelliert): ${snapshot.runtimeErrors}, Warnungen: ${snapshot.runtimeWarnings}`,
    `- Uptime: ${Math.round(snapshot.uptimeMinutes)} Minuten`,
    `- Letzte Zyklen: ${snapshot.lastCycles.length > 0 ? snapshot.lastCycles.map((c) => `${c.title}=${c.status}`).join(", ") : "keine"}`,
    ``,
    `Vorbewertete Findings (nach Prioritaet):`,
    ...findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.key}: ${f.detail}`),
    snapshot.errorSamples.length > 0 ? `\nFehlerbeispiele:\n${snapshot.errorSamples.map((s) => `- ${s}`).join("\n")}` : "",
  ].join("\n");
}

/**
 * Waehlt das auszufuehrende Optimierungsziel aus einer Empfehlungsliste
 * (rein): die erste Empfehlung mit Impact "hoch", sonst "mittel", sonst null
 * (keine sinnvolle Arbeit → kein Orchestrator-Task verschwenden).
 */
export function pickObjective(
  recommendations: { title?: unknown; impact?: unknown; objective?: unknown }[],
): { title: string; objective: string } | null {
  const clean = recommendations.filter(
    (r): r is { title: string; impact: string; objective: string } =>
      typeof r.title === "string" &&
      typeof r.objective === "string" &&
      r.objective.trim().length >= 10 &&
      (r.impact === "hoch" || r.impact === "mittel" || r.impact === "gering"),
  );
  if (clean.length === 0) return null;
  const byImpact = (impact: string) => clean.find((r) => r.impact === impact);
  const chosen = byImpact("hoch") ?? byImpact("mittel") ?? null;
  return chosen ? { title: chosen.title.slice(0, 180), objective: chosen.objective.slice(0, 3800) } : null;
}
