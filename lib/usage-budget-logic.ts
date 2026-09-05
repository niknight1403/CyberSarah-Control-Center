export type BudgetLevel = "ok" | "warning" | "exhausted";

export type UsageEntry = {
  timestampMs: number;
  costUnits: number;
};

export type BudgetConfig = {
  windowStartMs: number;
  windowEndMs: number;
  limitCostUnits: number;
  warnThresholdPercent: number;
};

export type BudgetResult = {
  level: BudgetLevel;
  usedCostUnits: number;
  usagePercent: number;
  remainingCostUnits: number;
  summary: string;
};

/**
 * Summiert Nutzungseinträge innerhalb des Budgetfensters und bewertet den
 * Verbrauch deterministisch. Einträge außerhalb des Fensters werden ignoriert.
 * Negative oder nicht-endliche Kostenwerte werden verworfen. Die Ausgabe
 * enthält niemals Secrets, Tokens oder Endpoints.
 */
export function evaluateUsageBudget(entries: UsageEntry[], config: BudgetConfig): BudgetResult {
  const { windowStartMs, windowEndMs, limitCostUnits, warnThresholdPercent } = config;

  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
    throw new Error("Ungültiges Budgetfenster.");
  }
  if (!Number.isFinite(limitCostUnits) || limitCostUnits <= 0) {
    throw new Error("Das Budgetlimit muss positiv sein.");
  }

  const usedCostUnits = entries
    .filter((entry) => {
      const inWindow =
        Number.isFinite(entry.timestampMs) &&
        entry.timestampMs >= windowStartMs &&
        entry.timestampMs < windowEndMs;
      const validCost = Number.isFinite(entry.costUnits) && entry.costUnits > 0;
      return inWindow && validCost;
    })
    .reduce((sum, entry) => sum + entry.costUnits, 0);

  const usagePercent = Math.min(100, Math.round((usedCostUnits / limitCostUnits) * 100));
  const remainingCostUnits = Math.max(0, limitCostUnits - usedCostUnits);
  const warnPercent = Number.isFinite(warnThresholdPercent)
    ? Math.min(100, Math.max(0, warnThresholdPercent))
    : 80;

  const level: BudgetLevel =
    usedCostUnits >= limitCostUnits ? "exhausted" : usagePercent >= warnPercent ? "warning" : "ok";

  const summary =
    level === "exhausted"
      ? "Nutzungsbudget für das Fenster ist erschöpft; Anfragen werden gedrosselt."
      : level === "warning"
        ? `Nutzungsbudget erreicht ${usagePercent} Prozent; Drosselung naht.`
        : `Nutzungsbudget bei ${usagePercent} Prozent.`;

  return { level, usedCostUnits, usagePercent, remainingCostUnits, summary };
}

export type AdmissionDecision = {
  allowed: boolean;
  reason: string;
};

/**
 * Entscheidet, ob eine neue Anfrage im aktuellen Budgetzustand zugelassen wird.
 * Bei erschöpftem Budget wird die Anfrage deterministisch abgelehnt.
 */
export function decideAdmission(budget: BudgetResult): AdmissionDecision {
  if (budget.level === "exhausted") {
    return { allowed: false, reason: "Budget erschöpft. Anfrage wird bis zum nächsten Fenster abgelehnt." };
  }
  return { allowed: true, reason: budget.summary };
}
