import { describe, expect, it } from "vitest";

import { deriveLoopFields, opportunityToLoopPayload } from "../lib/loop-adoption-logic";
import { createLoopDraft, LOOP_FIELD_LIMITS, validateLoopDraft } from "../lib/revenue-loop-logic";
import type { RevenueOpportunity } from "../lib/revenue-autopilot-logic";

/**
 * Sprint 350 — Regression: Umsatzmöglichkeiten liessen sich nicht als Schleife
 * übernehmen.
 *
 * Ursache: Der Fluss wurde aus allen Loop-Stufen zusammengeklebt
 * (`stages.join(" → ")`). Bei drei Stufen ist das regelmäßig länger als die
 * 60 Zeichen, die Loop Engineering erlaubt — `createLoopDraft` warf, die
 * Übernahme scheiterte.
 */

const CROSS_SELL: RevenueOpportunity = {
  key: "cross-sell.conversion",
  hub: "loop",
  title: "Cross-Sell-Loop verbessern",
  score: 72,
  evidence: "medium",
  metric: "Cross-Sell-Conversions / Empfehlungen",
  baseline: "3,1 % gemessen",
  target: "5 % internes Ziel",
  rationale: "Empfehlungen und Conversions werden gemessen; niedriger Fit kann gezielt getestet werden.",
  stages: [
    "Regeln nach Empfehlung→Conversion sortieren",
    "Schwache Regel mit besserem Produkt-Fit ersetzen",
    "Conversion nach Testfenster vergleichen",
  ],
  experiment: "Zwei Wochen: schwache Cross-Sell-Regel gegen besseren Produkt-Fit tauschen und Conversion vergleichen.",
  unit: "Conversions",
  targetValue: 5,
  currentValue: 3,
};

describe("bisheriger Uebernahmeweg scheiterte an der Flussgrenze", () => {
  it("alle Stufen zusammengeklebt sind laenger als das Fluss-Limit", () => {
    const joined = CROSS_SELL.stages.join(" → ");
    expect(joined.length).toBeGreaterThan(LOOP_FIELD_LIMITS.flow);
  });

  it("validateLoopDraft lehnt genau diesen Fluss ab", () => {
    const validation = validateLoopDraft({
      name: CROSS_SELL.title,
      flow: CROSS_SELL.stages.join(" → "),
      hypothesis: CROSS_SELL.rationale,
      experiment: CROSS_SELL.experiment,
      metric: CROSS_SELL.metric,
      unit: CROSS_SELL.unit,
      targetValue: CROSS_SELL.targetValue,
      currentValue: CROSS_SELL.currentValue,
    });
    expect(validation.valid).toBe(false);
    if (!validation.valid) expect(validation.reason).toContain("Fluss");
  });
});

describe("deriveLoopFields", () => {
  it("macht aus einer echten Chance eine gueltige Schleife", () => {
    const derived = deriveLoopFields(opportunityToLoopPayload(CROSS_SELL));
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.fields.name.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.name);
    expect(derived.fields.flow.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.flow);
    expect(derived.fields.flow).toContain("→");
    expect(derived.fields.metric.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.metric);
    expect(derived.fields.unit.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.unit);
    expect(() => createLoopDraft(derived.fields)).not.toThrow();
  });

  it("meldet ehrlich, was gekuerzt wurde", () => {
    const derived = deriveLoopFields(opportunityToLoopPayload(CROSS_SELL));
    expect(derived.ok).toBe(true);
    if (derived.ok) expect(derived.shortened).toContain("flow");
  });

  it("kuerzt auch einen ueberlangen Namen", () => {
    const derived = deriveLoopFields({ ...opportunityToLoopPayload(CROSS_SELL), name: "Sehr langer Schleifenname ".repeat(4) });
    expect(derived.ok).toBe(true);
    if (derived.ok) {
      expect(derived.fields.name.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.name);
      expect(derived.shortened).toContain("name");
    }
  });

  it("faellt ohne Stufen auf die Messgroesse zurueck", () => {
    const derived = deriveLoopFields({ ...opportunityToLoopPayload(CROSS_SELL), stages: [] });
    expect(derived.ok).toBe(true);
    if (derived.ok) {
      expect(derived.fields.flow.length).toBeGreaterThanOrEqual(3);
      expect(derived.fields.flow.length).toBeLessThanOrEqual(LOOP_FIELD_LIMITS.flow);
    }
  });

  it("lehnt einen Entwurf ohne Experimentplan ab", () => {
    const derived = deriveLoopFields({ ...opportunityToLoopPayload(CROSS_SELL), experiment: "" });
    expect(derived.ok).toBe(false);
    if (!derived.ok) expect(derived.reason).toContain("Experimentplan");
  });

  it("lehnt eine Chance ohne positives Ziel ab", () => {
    const derived = deriveLoopFields({ ...opportunityToLoopPayload(CROSS_SELL), targetValue: 0 });
    expect(derived.ok).toBe(false);
    if (!derived.ok) expect(derived.reason).toContain("Ziel");
  });

  it("lehnt eine fehlende Einheit ab", () => {
    const derived = deriveLoopFields({ ...opportunityToLoopPayload(CROSS_SELL), unit: "  " });
    expect(derived.ok).toBe(false);
    if (!derived.ok) expect(derived.reason).toContain("Einheit");
  });
});
