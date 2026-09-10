import { describe, expect, it } from "vitest";
import {
  buildOpsOverview,
  evaluateOverall,
  summarizeOpsOverview,
  type OpsCheckInput,
} from "../lib/ops-overview-logic";

describe("ops-overview-logic", () => {
  it("bewertet den Gesamtzustand prioritaetsbasiert", () => {
    expect(evaluateOverall(["ok", "ok"])).toBe("ok");
    expect(evaluateOverall(["ok", "degraded"])).toBe("degraded");
    expect(evaluateOverall(["degraded", "down"])).toBe("down");
    expect(evaluateOverall(["unknown", "unknown"])).toBe("unknown");
    expect(evaluateOverall([])).toBe("unknown");
  });

  it("liefert fuer jeden Pruefpfad eine handlungsfaehige Meldung", () => {
    const overview = buildOpsOverview([
      { kind: "apiHealth", state: "down" },
      { kind: "database", state: "ok" },
      { kind: "workspace", state: "degraded" },
    ]);
    const api = overview.checks.find((c) => c.kind === "apiHealth");
    expect(api?.message).toContain("Render-Dashboard");
    const ws = overview.checks.find((c) => c.kind === "workspace");
    expect(ws?.message).toContain("SERVICE_ACCESS_TOKEN");
    expect(overview.overall).toBe("down");
  });

  it("setzt den Fokus auf den kritischsten Pruefpfad in Prioritaetsreihenfolge", () => {
    const overview = buildOpsOverview([
      { kind: "database", state: "down" },
      { kind: "apiHealth", state: "down" },
    ]);
    expect(overview.focus).toContain("Kritisch: /api/health");
  });

  it("markiert veraltete Messwerte als Einschraenkung statt stummem Weiterlaufen", () => {
    const overview = buildOpsOverview([
      { kind: "database", state: "ok", ageMs: 5000 },
      { kind: "workspace", state: "ok", ageMs: 500_000, staleAfterMs: 120_000 },
    ]);
    const fresh = overview.checks.find((c) => c.kind === "database");
    const stale = overview.checks.find((c) => c.kind === "workspace");
    expect(fresh?.stale).toBe(false);
    expect(stale?.stale).toBe(true);
    expect(stale?.state).toBe("degraded");
    expect(overview.overall).toBe("degraded");
    expect(overview.recommendations).toHaveLength(1);
  });

  it("bleibt bei vollem Gruen ohne Empfehlungen und mit Ruhe-Fokus", () => {
    const overview = buildOpsOverview([
      { kind: "apiHealth", state: "ok" },
      { kind: "database", state: "ok" },
      { kind: "chat", state: "ok" },
    ]);
    expect(overview.overall).toBe("ok");
    expect(overview.focus).toBe("Alle Betriebspfade gruen.");
    expect(overview.recommendations).toEqual([]);
  });

  it("vergibt Standard-Labels und fasst tokenfrei zusammen", () => {
    const overview = buildOpsOverview([
      { kind: "metrics", state: "ok" },
      { kind: "chat", state: "unknown" },
    ]);
    expect(overview.checks[0].label).toBe("Metriken");
    expect(overview.checks[1].label).toBe("KI-Chat");
    const summary = summarizeOpsOverview(overview);
    expect(summary).toContain("Betriebsstatus GRUEN");
    expect(summary).toContain("warnung:0");
    expect(summary).toContain("unbekannt:1");
  });

  it("uebernimmt individuelle Labels, ohne Standard zu veraendern", () => {
    const overview = buildOpsOverview([
      { kind: "apiReady", state: "degraded", label: "/api/ready (Stage)" },
    ]);
    expect(overview.checks[0].label).toBe("/api/ready (Stage)");
    expect(overview.focus).toContain("Eingeschraenkt: /api/ready (Stage)");
  });
});
