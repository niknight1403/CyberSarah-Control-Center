import { describe, expect, it } from "vitest";
import {
  evaluateQualityGate,
  StandardPostExecutionRules,
  StandardPreExecutionRules,
} from "../lib/agent-quality-gate-logic";

describe("Sprint 370 — Agent Quality Gate Logic", () => {
  it("Pre-Execution Gate besteht, wenn alle Pflicht-Eingaben und Werkzeuge vorhanden sind", () => {
    const rules = [
      StandardPreExecutionRules.requireInputFields(["query", "userId"]),
      StandardPreExecutionRules.requireToolsAvailable(["bash", "read_file"]),
      StandardPreExecutionRules.checkContextTokenLimit(0.85),
    ];

    const context = {
      inputs: { query: "Filter logs", userId: "usr-1" },
      availableTools: ["bash", "read_file", "write_file"],
      contextTokenCount: 4000,
      maxContextTokenLimit: 128000,
    };

    const evalResult = evaluateQualityGate("PreCheck-Task", "pre_execution", context, rules);

    expect(evalResult.passed).toBe(true);
    expect(evalResult.mandatoryPassed).toBe(true);
    expect(evalResult.fatalErrors.length).toBe(0);
    expect(evalResult.warnings.length).toBe(0);
  });

  it("Pre-Execution Gate blockiert (mandatoryPassed = false), wenn ein Pflichtfeld fehlt", () => {
    const rules = [
      StandardPreExecutionRules.requireInputFields(["query", "userId"]),
      StandardPreExecutionRules.requireToolsAvailable(["bash"]),
    ];

    const context = {
      inputs: { query: "Filter logs" }, // userId fehlt!
      availableTools: ["bash"],
    };

    const evalResult = evaluateQualityGate("PreCheck-Task", "pre_execution", context, rules);

    expect(evalResult.mandatoryPassed).toBe(false);
    expect(evalResult.passed).toBe(false);
    expect(evalResult.fatalErrors.length).toBe(1);
    expect(evalResult.fatalErrors[0]).toContain("Fehlende Pflicht-Eingaben: userId");
  });

  it("Post-Execution Gate meldet Warnungen bei Zeitüberschreitung, lässt mandatoryPassed aber true wenn keine Fehler", () => {
    const rules = [
      StandardPostExecutionRules.requireOutputFields(["result"]),
      StandardPostExecutionRules.requireNoExecutionErrors(),
      StandardPostExecutionRules.maxExecutionTime(1000), // Max 1000ms
    ];

    const context = {
      outputs: { result: "Done successfully" },
      errors: [],
      executionTimeMs: 1500, // 1500ms > 1000ms
    };

    const evalResult = evaluateQualityGate("PostCheck-Task", "post_execution", context, rules);

    expect(evalResult.mandatoryPassed).toBe(true); // Pflichtkriterien bestanden
    expect(evalResult.passed).toBe(false); // Gesamt-Passed ist false wegen Warnung
    expect(evalResult.warnings.length).toBe(1);
    expect(evalResult.warnings[0]).toContain("Laufzeit 1500ms überschreitet Zielwert");
    expect(evalResult.summary).toContain("Bedingt bestanden");
  });

  it("Post-Execution Gate schlägt fehl bei gemeldeten Laufzeitfehlern", () => {
    const rules = [StandardPostExecutionRules.requireNoExecutionErrors()];

    const context = {
      errors: ["Timeout bei API-Aufruf"],
    };

    const evalResult = evaluateQualityGate("PostCheck-Task", "post_execution", context, rules);

    expect(evalResult.mandatoryPassed).toBe(false);
    expect(evalResult.fatalErrors[0]).toContain("Timeout bei API-Aufruf");
  });
});
