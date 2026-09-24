/**
 * Sprint 300 (Milestone) — Startzeit-Messung: reine, deterministische Logik
 * fuer Phasen-Report und Budget-Bewertung des App-Starts.
 *
 * Datenfluss:
 *   Die App misst Phasen-Dauern (JS-Bundle, tRPC-Handshake, Erst-Render)
 *   und uebergibt sie hierher; die Logik fasst zusammen, bewertet gegen
 *   ein Budget und klassifiziert ehrlich.
 *
 * Ehrlichkeits-Grenze: Phasen <= 0 ms oder fehlende Phasen werden als
 *   "unbekannt" markiert und beeinflussen das Budget-Urteil NICHT
 *   positiv — fehlende Daten sind fehlende Daten.
 */

export type StartupPhase = {
  name: string;
  /** Gemessene Dauer in ms; negative Werte sind ungueltig. */
  durationMs: number;
};

export type StartupSummary = {
  totalMs: number;
  phases: StartupPhase[];
  budgetMs: number;
  withinBudget: boolean;
  /** Phasen ueber ihrem Einzelbudget (z. B. 50 % vom Gesamtbudget). */
  breaches: Array<{ name: string; durationMs: number; share: number }>;
  classification: "fast" | "ok" | "slow" | "unbekannt";
  slowestPhase: StartupPhase | null;
};

export const STARTUP_BUDGET_MS = 3000;
export const SLOWEST_PHASE_SHARE = 0.5;

/** Fasst Phasen zusammen; ungueltige Messwerte werden ehrlich ausgeschlossen. */
export function summarizeStartup(
  phases: StartupPhase[],
  budgetMs: number = STARTUP_BUDGET_MS,
): StartupSummary {
  const valid = phases.filter((p) => p.durationMs > 0);
  const totalMs = valid.reduce((sum, p) => sum + p.durationMs, 0);
  const measured = valid.length > 0;

  const breaches = valid
    .filter((p) => p.durationMs > budgetMs * SLOWEST_PHASE_SHARE)
    .map((p) => ({
      name: p.name,
      durationMs: p.durationMs,
      share: totalMs > 0 ? p.durationMs / totalMs : 0,
    }));

  const slowestPhase =
    valid.length > 0
      ? valid.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
      : null;

  let classification: StartupSummary["classification"] = "unbekannt";
  if (measured) {
    if (totalMs < 1500) classification = "fast";
    else if (totalMs <= budgetMs) classification = "ok";
    else classification = "slow";
  }

  return {
    totalMs,
    phases: [...phases],
    budgetMs,
    // Unbekannte Phasen duerfen das Urteil nicht beschoenigen.
    withinBudget: measured && totalMs <= budgetMs,
    breaches,
    classification,
    slowestPhase,
  };
}

/** Kompakter, ehrlicher Einzeiler fuer Logs/Analytics. */
export function formatStartupLine(summary: StartupSummary): string {
  if (summary.classification === "unbekannt") {
    return `startup: unbekannt (keine gueltigen Messwerte)`;
  }
  const parts = [
    `startup: ${summary.classification}`,
    `${summary.totalMs}ms (Budget ${summary.budgetMs}ms)`,
  ];
  if (summary.slowestPhase) {
    parts.push(`langsamste Phase: ${summary.slowestPhase.name} (${summary.slowestPhase.durationMs}ms)`);
  }
  return parts.join(" | ");
}
