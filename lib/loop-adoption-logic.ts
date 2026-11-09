/**
 * Sprint 350 — Von einer Umsatzmöglichkeit zur Schleife.
 *
 * Der Revenue-Autopilot liefert Chancen bewusst knapp: Titel, Stufen, Metrik,
 * Baseline und Ziel. Loop Engineering hat aber harte Feldgrenzen
 * (Name 60, Fluss 60, Hypothese 300, Experiment 300, Messgröße 60, Einheit 20).
 *
 * Frühere Fassung reichte `stages.join(" → ")` roh als Fluss durch. Bei drei
 * Stufen ist das regelmäßig länger als 60 Zeichen, `createLoopDraft` warf, und
 * die Übernahme scheiterte. Hier wird ehrlich abgeleitet und gekürzt; was
 * gekürzt wurde, steht danach als Hinweis in der Oberfläche — keine stille
 * Kürzung, keine erfundene Zahl.
 */
import type { RevenueLoopDraftPayload } from "./draft-engine-logic";
import { LOOP_FIELD_LIMITS } from "./revenue-loop-logic";
import type { RevenueOpportunity } from "./revenue-autopilot-logic";

export type LoopFieldKey = "name" | "flow" | "hypothesis" | "experiment" | "metric" | "unit";

export type DerivedLoopFields = {
  name: string;
  flow: string;
  hypothesis: string;
  experiment: string;
  metric: string;
  unit: string;
  targetValue: number;
  currentValue: number;
};

export type LoopDerivation =
  | { ok: true; fields: DerivedLoopFields; shortened: LoopFieldKey[] }
  | { ok: false; reason: string };

/** Kürzt hart auf das Limit und bleibt lesbar: Wortgrenze + Auslassungszeichen. */
function clampToLimit(text: string, max: number): string {
  if (text.length <= max) return text;
  const hard = text.slice(0, max - 1);
  const soft = hard.replace(/\s+\S*$/, "");
  const base = soft.length >= Math.floor(max / 2) ? soft : hard;
  return `${base.trimEnd()}\u2026`;
}

/**
 * Fluss aus den Loop-Stufen: erste und letzte Stufe, damit der Kreislauf
 * sichtbar bleibt. Passen beide zusammen nicht in das Limit, werden sie
 * gleichmäßig gekürzt statt den Pfeil abzuschneiden.
 */
function buildFlow(stages: readonly string[], fallback: string, max: number): { flow: string; shortened: boolean } {
  const clean = stages.map((stage) => stage.trim()).filter((stage) => stage.length >= 2);
  const joinedRaw = clean.length === 0
    ? fallback.trim()
    : clean.length === 1
      ? clean[0]!
      : `${clean[0]!} \u2192 ${clean[clean.length - 1]!}`;
  if (joinedRaw.length <= max) return { flow: joinedRaw, shortened: false };
  if (clean.length <= 1) return { flow: clampToLimit(joinedRaw, max), shortened: true };
  const budget = Math.max(6, max - 3);
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  return { flow: `${clampToLimit(clean[0]!, head)} \u2192 ${clampToLimit(clean[clean.length - 1]!, tail)}`, shortened: true };
}

/** Leitet aus einem Entwurf/einer Chance die Loop-Felder ab, die die Grenzen einhalten. */
export function deriveLoopFields(input: {
  name?: string;
  hypothesis?: string;
  stages?: readonly string[];
  metric?: string;
  experiment?: string;
  unit?: string;
  targetValue?: number;
  currentValue?: number;
}): LoopDerivation {
  const experiment = (input.experiment ?? "").trim();
  if (experiment.length < 10) {
    return { ok: false, reason: "Dieser Entwurf enthält noch keinen vollständigen Experimentplan (min. 10 Zeichen). Bitte neu erzeugen." };
  }
  const unit = (input.unit ?? "").trim();
  if (unit.length === 0) {
    return { ok: false, reason: "Diesem Entwurf fehlt die Einheit der Messgröße — ohne Einheit ist kein Fortschritt messbar." };
  }
  const targetValue = input.targetValue;
  if (typeof targetValue !== "number" || !Number.isFinite(targetValue) || targetValue <= 0) {
    return { ok: false, reason: "Diesem Entwurf fehlt ein positives Ziel — ohne Ziel ist der Loop nicht prüfbar." };
  }
  const hypothesis = (input.hypothesis ?? "").trim();
  if (hypothesis.length < 10) {
    return { ok: false, reason: "Die Hypothese ist zu kurz für eine prüfbare Annahme (min. 10 Zeichen)." };
  }
  const metric = (input.metric ?? "").trim();
  if (metric.length < 3) {
    return { ok: false, reason: "Die Messgröße fehlt — ohne Messgröße ist der Loop nicht messbar." };
  }
  const name = (input.name ?? "").trim();
  if (name.length < 3) {
    return { ok: false, reason: "Der Name der Schleife fehlt (min. 3 Zeichen)." };
  }

  const shortened: LoopFieldKey[] = [];
  const keep = (key: LoopFieldKey, value: string, max: number): string => {
    const clamped = clampToLimit(value, max);
    if (clamped !== value) shortened.push(key);
    return clamped;
  };

  const flow = buildFlow(input.stages ?? [], metric, LOOP_FIELD_LIMITS.flow);
  if (flow.shortened) shortened.push("flow");

  const fields: DerivedLoopFields = {
    name: keep("name", name, LOOP_FIELD_LIMITS.name),
    flow: flow.flow,
    hypothesis: keep("hypothesis", hypothesis, LOOP_FIELD_LIMITS.hypothesis),
    experiment: keep("experiment", experiment, LOOP_FIELD_LIMITS.experiment),
    metric: keep("metric", metric, LOOP_FIELD_LIMITS.metric),
    unit: keep("unit", unit, LOOP_FIELD_LIMITS.unit),
    targetValue,
    currentValue: typeof input.currentValue === "number" && Number.isFinite(input.currentValue) && input.currentValue >= 0 ? input.currentValue : 0,
  };
  return { ok: true, fields, shortened };
}

/** Übersetzt eine Autopilot-Chance in die Form, die Loop Engineering übernimmt. */
export function opportunityToLoopPayload(opportunity: RevenueOpportunity): RevenueLoopDraftPayload {
  return {
    hub: opportunity.hub,
    name: opportunity.title,
    hypothesis: opportunity.rationale,
    stages: opportunity.stages,
    metric: opportunity.metric,
    experiment: opportunity.experiment,
    unit: opportunity.unit,
    targetValue: opportunity.targetValue,
    currentValue: opportunity.currentValue,
  };
}
