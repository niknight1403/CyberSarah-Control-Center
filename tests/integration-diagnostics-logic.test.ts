import { describe, it, expect } from "vitest";
import {
  evaluateProbe,
  overallVerdict,
  buildDiagnosticReport,
  verdictColor,
  PROBE_SPECS,
} from "@/lib/integration-diagnostics-logic";
import type { ProbeResult } from "@/lib/integration-diagnostics-logic";

const probe = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  integration: "email",
  ran: true,
  ok: true,
  latencyMs: 100,
  detail: "",
  ...over,
});

describe("Sprint 342 — Integrations-Diagnose", () => {
  it("nicht gelaufener Probe ist 'nicht-geprueft', nie gruen", () => {
    const r = evaluateProbe(PROBE_SPECS.email, probe({ ran: false, detail: "nicht konfiguriert" }));
    expect(r.verdict).toBe("nicht-geprueft");
    expect(r.note).toContain("NICHT geprueft");
  });

  it("Fehler und Langsamkeit bleiben getrennt", () => {
    expect(evaluateProbe(PROBE_SPECS.email, probe({ ok: false, detail: "SMTP refused" })).verdict).toBe("rot");
    expect(evaluateProbe(PROBE_SPECS.stripe, probe({ integration: "stripe", latencyMs: 7000 })).verdict).toBe("langsam");
    expect(evaluateProbe(PROBE_SPECS.slack, probe({ integration: "slack", latencyMs: 50 })).verdict).toBe("gruen");
  });

  it("Gesamturteil: rot > nicht-geprueft > langsam > gruen", () => {
    expect(overallVerdict(["gruen", "rot"])).toBe("rot");
    expect(overallVerdict(["gruen", "nicht-geprueft"])).toBe("nicht-geprueft");
    expect(overallVerdict(["gruen", "langsam"])).toBe("langsam");
    expect(overallVerdict(["gruen"])).toBe("gruen");
  });

  it("Bericht nennt je Integration eine Zeile, Farbe fuer nicht geprueft ist grau", () => {
    const report = buildDiagnosticReport([
      probe(),
      probe({ integration: "stripe", ran: false, detail: "kein Key" }),
    ]);
    expect(report).toContain("NICHT-GEPRUEFT");
    expect(report).toContain("email: ok");
    expect(verdictColor("nicht-geprueft")).toBe("#666666");
    expect(verdictColor("gruen")).toBe("#00F2FE");
  });
});
