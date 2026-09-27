/**
 * Sprint 365 — Selbst-Kritik-Schritt: Lösung gegen Akzeptanzkriterien prüfen
 *
 * Prüft eine vorgeschlagene Agenten-Lösung vor dem Abschluss eines Tasks
 * deterministisch gegen eine Liste von Akzeptanzkriterien. Erzeugt detailliertes
 * Feedback und eine Nachbesserungs-Instruktion bei Verfehlungen.
 */

export type AcceptanceCriterion = {
  id: string;
  description: string;
  required: boolean;
  keywords?: string[];
  pattern?: string; // Regex-Muster
  minWordCount?: number;
};

export type CriterionEvaluation = {
  criterionId: string;
  description: string;
  required: boolean;
  satisfied: boolean;
  confidence: number; // 0..100
  missingAspects: string[];
  feedback: string;
};

export type SelfCritiqueResult = {
  isPassed: boolean;
  overallScore: number; // 0..100
  criteriaEvaluations: CriterionEvaluation[];
  mandatoryPassed: boolean;
  retryRecommended: boolean;
  refinedPromptInstruction?: string;
  summary: string;
};

/**
 * Prüft ein einzelnes Akzeptanzkriterium gegen den Lösungs-Text.
 */
export function evaluateCriterion(
  criterion: AcceptanceCriterion,
  solutionText: string
): CriterionEvaluation {
  const missingAspects: string[] = [];
  const textLower = solutionText.toLowerCase();

  // 1. Schlüsselwort-Prüfung
  if (criterion.keywords && criterion.keywords.length > 0) {
    const missingKw = criterion.keywords.filter(
      (kw) => !textLower.includes(kw.toLowerCase())
    );
    if (missingKw.length > 0) {
      missingAspects.push(`Fehlende Schlüsselwörter: ${missingKw.join(", ")}`);
    }
  }

  // 2. Regex-Muster-Prüfung
  if (criterion.pattern) {
    try {
      const regex = new RegExp(criterion.pattern, "i");
      if (!regex.test(solutionText)) {
        missingAspects.push(`Muster '${criterion.pattern}' nicht im Text gefunden`);
      }
    } catch {
      // Ignoriere ungültige Regex-Muster sicher
    }
  }

  // 3. Mindestwortanzahl
  if (criterion.minWordCount && criterion.minWordCount > 0) {
    const wordCount = solutionText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < criterion.minWordCount) {
      missingAspects.push(
        `Wortanzahl zu gering: ${wordCount} Wörter (Mindestens ${criterion.minWordCount} erforderlich)`
      );
    }
  }

  const satisfied = missingAspects.length === 0;
  const confidence = satisfied ? 100 : Math.max(0, 100 - missingAspects.length * 30);

  return {
    criterionId: criterion.id,
    description: criterion.description,
    required: criterion.required,
    satisfied,
    confidence,
    missingAspects,
    feedback: satisfied
      ? `Kriterium '${criterion.description}' erfüllt.`
      : `Kriterium '${criterion.description}' verfehlt: ${missingAspects.join("; ")}`,
  };
}

/**
 * Bewertet eine Gesamtlösung gegen eine Reihe von Akzeptanzkriterien.
 */
export function evaluateSolutionAgainstCriteria(
  taskGoal: string,
  solutionText: string,
  criteria: AcceptanceCriterion[]
): SelfCritiqueResult {
  if (!solutionText || solutionText.trim().length === 0) {
    return {
      isPassed: false,
      overallScore: 0,
      criteriaEvaluations: [],
      mandatoryPassed: false,
      retryRecommended: true,
      refinedPromptInstruction: `Die vorgeschlagene Lösung für '${taskGoal}' ist leer. Bitte erstelle eine vollständige Antwort.`,
      summary: "Keine Lösung bereitgestellt.",
    };
  }

  if (!criteria || criteria.length === 0) {
    // Wenn keine Kriterien vorgegeben sind, nutze Mindestprüfung
    const wordCount = solutionText.trim().split(/\s+/).filter(Boolean).length;
    const isPassed = wordCount >= 5;
    return {
      isPassed,
      overallScore: isPassed ? 100 : 50,
      criteriaEvaluations: [],
      mandatoryPassed: isPassed,
      retryRecommended: !isPassed,
      refinedPromptInstruction: isPassed
        ? undefined
        : `Bitte erstelle eine ausführlichere Antwort auf das Ziel '${taskGoal}'.`,
      summary: isPassed
        ? "Keine expliziten Kriterien angegeben. Standardprüfung bestanden."
        : "Standardprüfung verfehlt: Text ist zu kurz.",
    };
  }

  const evaluations = criteria.map((c) => evaluateCriterion(c, solutionText));
  const satisfiedCount = evaluations.filter((e) => e.satisfied).length;

  const mandatoryEvaluations = evaluations.filter((e) => e.required);
  const mandatoryPassed = mandatoryEvaluations.every((e) => e.satisfied);

  const overallScore = Math.round((satisfiedCount / criteria.length) * 100);
  const isPassed = mandatoryPassed && overallScore >= 70;
  const retryRecommended = !isPassed;

  let refinedPromptInstruction: string | undefined;
  if (!isPassed) {
    const failedDescriptions = evaluations
      .filter((e) => !e.satisfied)
      .map((e) => `- ${e.description}: ${e.missingAspects.join(", ")}`)
      .join("\n");

    refinedPromptInstruction = `Deine bisherige Lösung für das Ziel '${taskGoal}' erfüllt nicht alle erforderlichen Kriterien.\nBitte überarbeite die Lösung gezielt für folgende Punkte:\n${failedDescriptions}`;
  }

  return {
    isPassed,
    overallScore,
    criteriaEvaluations: evaluations,
    mandatoryPassed,
    retryRecommended,
    refinedPromptInstruction,
    summary: isPassed
      ? `Selbstkritik erfolgreich: ${satisfiedCount}/${criteria.length} Kriterien erfüllt (${overallScore}%).`
      : `Selbstkritik verfehlt: ${criteria.length - satisfiedCount} Kriterien offen (${overallScore}% erfüllt). Nachbesserung empfohlen.`,
  };
}
