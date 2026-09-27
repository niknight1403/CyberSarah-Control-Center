/**
 * Sprint 370 — Qualitäts-Tore: Akzeptanzkriterien vor Ausführung, Prüfung danach
 *
 * Stellt sicher, dass vor der Ausführung eines Agenten-Schritts die Voraussetzungen
 * (Eingabedaten, Werkzeuge, Kontextgrößen) geprüft werden (Pre-Execution Gate)
 * und nach der Ausführung das Ergebnis auf Richtigkeit und Vollständigkeit
 * verifiziert wird (Post-Execution Gate).
 */

export type QualityGateStage = "pre_execution" | "post_execution";
export type QualityGateSeverity = "fatal" | "warning";

export type QualityGateRuleResult = {
  ruleId: string;
  ruleName: string;
  stage: QualityGateStage;
  passed: boolean;
  severity: QualityGateSeverity;
  message: string;
};

export type QualityGateContext = {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  availableTools?: string[];
  contextTokenCount?: number;
  maxContextTokenLimit?: number;
  errors?: string[];
  executionTimeMs?: number;
};

export type QualityGateRule = {
  id: string;
  name: string;
  stage: QualityGateStage;
  severity: QualityGateSeverity;
  check: (context: QualityGateContext) => { passed: boolean; message: string };
};

export type QualityGateEvaluation = {
  gateName: string;
  stage: QualityGateStage;
  passed: boolean;
  mandatoryPassed: boolean;
  ruleResults: QualityGateRuleResult[];
  fatalErrors: string[];
  warnings: string[];
  summary: string;
};

/**
 * Standard-Regeln für Pre-Execution Quality Gates.
 */
export const StandardPreExecutionRules = {
  requireInputFields: (requiredKeys: string[]): QualityGateRule => ({
    id: "pre-require-inputs",
    name: "Pflicht-Eingabefelder vorhanden",
    stage: "pre_execution",
    severity: "fatal",
    check: (ctx) => {
      const inputs = ctx.inputs ?? {};
      const missing = requiredKeys.filter((key) => inputs[key] === undefined || inputs[key] === null);
      if (missing.length > 0) {
        return {
          passed: false,
          message: `Fehlende Pflicht-Eingaben: ${missing.join(", ")}`,
        };
      }
      return { passed: true, message: "Alle Pflicht-Eingaben sind vorhanden." };
    },
  }),

  requireToolsAvailable: (requiredTools: string[]): QualityGateRule => ({
    id: "pre-require-tools",
    name: "Erforderliche Werkzeuge vorhanden",
    stage: "pre_execution",
    severity: "fatal",
    check: (ctx) => {
      const available = ctx.availableTools ?? [];
      const missing = requiredTools.filter((tool) => !available.includes(tool));
      if (missing.length > 0) {
        return {
          passed: false,
          message: `Fehlende Werkzeuge im System: ${missing.join(", ")}`,
        };
      }
      return { passed: true, message: "Alle geforderten Werkzeuge stehen bereit." };
    },
  }),

  checkContextTokenLimit: (warningThresholdRatio = 0.85): QualityGateRule => ({
    id: "pre-context-limit-check",
    name: "Kontext-Kapazität prüfen",
    stage: "pre_execution",
    severity: "warning",
    check: (ctx) => {
      if (!ctx.contextTokenCount || !ctx.maxContextTokenLimit) {
        return { passed: true, message: "Kontextgrenzen nicht definiert, Prüfung übersprungen." };
      }
      const ratio = ctx.contextTokenCount / ctx.maxContextTokenLimit;
      if (ratio >= 1.0) {
        return {
          passed: false,
          message: `Kontextfenster überschritten: ${ctx.contextTokenCount}/${ctx.maxContextTokenLimit} Tokens (${Math.round(ratio * 100)}%)`,
        };
      }
      if (ratio >= warningThresholdRatio) {
        return {
          passed: false,
          message: `Kontextfenster zu ${Math.round(ratio * 100)}% ausgelastet (Warnung).`,
        };
      }
      return { passed: true, message: `Kontextauslastung im grünen Bereich (${Math.round(ratio * 100)}%).` };
    },
  }),
};

/**
 * Standard-Regeln für Post-Execution Quality Gates.
 */
export const StandardPostExecutionRules = {
  requireOutputFields: (requiredKeys: string[]): QualityGateRule => ({
    id: "post-require-outputs",
    name: "Pflicht-Ausgabefelder vorhanden",
    stage: "post_execution",
    severity: "fatal",
    check: (ctx) => {
      const outputs = ctx.outputs ?? {};
      const missing = requiredKeys.filter((key) => outputs[key] === undefined || outputs[key] === null);
      if (missing.length > 0) {
        return {
          passed: false,
          message: `Fehlende Pflicht-Ausgabefelder: ${missing.join(", ")}`,
        };
      }
      return { passed: true, message: "Alle Pflicht-Ausgaben sind vorhanden." };
    },
  }),

  requireNoExecutionErrors: (): QualityGateRule => ({
    id: "post-no-errors",
    name: "Keine Laufzeitfehler aufgetreten",
    stage: "post_execution",
    severity: "fatal",
    check: (ctx) => {
      const errors = ctx.errors ?? [];
      if (errors.length > 0) {
        return {
          passed: false,
          message: `Es sind ${errors.length} Fehler bei der Ausführung aufgetreten: ${errors.join("; ")}`,
        };
      }
      return { passed: true, message: "Ausführung verlief ohne berichtete Fehler." };
    },
  }),

  maxExecutionTime: (maxTimeMs: number): QualityGateRule => ({
    id: "post-max-time",
    name: "Laufzeit-Obergrenze einhalten",
    stage: "post_execution",
    severity: "warning",
    check: (ctx) => {
      const time = ctx.executionTimeMs ?? 0;
      if (time > maxTimeMs) {
        return {
          passed: false,
          message: `Laufzeit ${time}ms überschreitet Zielwert von ${maxTimeMs}ms.`,
        };
      }
      return { passed: true, message: `Laufzeit ${time}ms liegt innerhalb des Limits.` };
    },
  }),
};

/**
 * Führt ein Quality-Gate für eine Phase (pre_execution oder post_execution) aus.
 */
export function evaluateQualityGate(
  gateName: string,
  stage: QualityGateStage,
  context: QualityGateContext,
  rules: QualityGateRule[]
): QualityGateEvaluation {
  const filteredRules = rules.filter((r) => r.stage === stage);

  if (filteredRules.length === 0) {
    return {
      gateName,
      stage,
      passed: true,
      mandatoryPassed: true,
      ruleResults: [],
      fatalErrors: [],
      warnings: [],
      summary: `Qualitäts-Tor '${gateName}' (${stage}) ohne definierte Regeln automatisch bestanden.`,
    };
  }

  const ruleResults: QualityGateRuleResult[] = [];
  const fatalErrors: string[] = [];
  const warnings: string[] = [];

  for (const rule of filteredRules) {
    const res = rule.check(context);
    const ruleResult: QualityGateRuleResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      stage: rule.stage,
      passed: res.passed,
      severity: rule.severity,
      message: res.message,
    };

    ruleResults.push(ruleResult);

    if (!res.passed) {
      if (rule.severity === "fatal") {
        fatalErrors.push(`[${rule.name}] ${res.message}`);
      } else {
        warnings.push(`[${rule.name}] ${res.message}`);
      }
    }
  }

  const mandatoryPassed = fatalErrors.length === 0;
  const passed = mandatoryPassed && warnings.length === 0;

  let summary = `Qualitäts-Tor '${gateName}' (${stage}): `;
  if (mandatoryPassed && warnings.length === 0) {
    summary += `Erfolgreich bestanden (${ruleResults.length}/${ruleResults.length} Regeln grün).`;
  } else if (mandatoryPassed) {
    summary += `Bedingt bestanden mit ${warnings.length} Warnung(en).`;
  } else {
    summary += `Blockiert! ${fatalErrors.length} kritische Regel(n) verfehlt.`;
  }

  return {
    gateName,
    stage,
    passed,
    mandatoryPassed,
    ruleResults,
    fatalErrors,
    warnings,
    summary,
  };
}
