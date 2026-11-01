import { describe, it, expect } from "vitest";
import {
  CAPABILITY_CATALOG,
  verdict,
  parityVerdict,
  buildParityReport,
} from "@/lib/superagent-capability-registry-logic";
import type { CapabilityEntry } from "@/lib/superagent-capability-registry-logic";

const entry = (over: Partial<CapabilityEntry> = {}): CapabilityEntry => ({
  id: "chat",
  base44Reference: "Chat",
  evidenceModules: ["lib/x.ts"],
  limitation: null,
  ...over,
});

describe("Paritaet 6/6 — Capability-Registry", () => {
  it("Urteil: ohne Evidenz rot, mit Einschraenkung grau, sonst gruen", () => {
    expect(verdict(entry())).toBe("gruen");
    expect(verdict(entry({ limitation: "noch nicht fertig" }))).toBe("grau");
    expect(verdict(entry({ evidenceModules: [] }))).toBe("rot");
  });

  it("Katalog deckt alle 10 Base44-Faehigkeiten ab", () => {
    expect(CAPABILITY_CATALOG).toHaveLength(10);
    const ids = CAPABILITY_CATALOG.map((c) => c.id);
    for (const expected of ["chat", "gedaechtnis", "skills", "workflows", "sub-agenten", "tools", "entities", "connectors", "kanaele", "ziele"]) {
      expect(ids).toContain(expected);
    }
  });

  it("Gesamturteil ist nur mit null rot gruen — Standard-Katalog hat kein rot", () => {
    expect(parityVerdict([entry({ evidenceModules: [] })]).verdict).toBe("rot");
    expect(parityVerdict([entry({ limitation: "x" })]).verdict).toBe("grau");
    expect(parityVerdict([entry()]).verdict).toBe("gruen");
    const { verdict: v, counts } = parityVerdict();
    expect(v).not.toBe("rot");
    expect(counts.rot).toBe(0);
    expect(counts.gruen + counts.grau).toBe(10);
  });

  it("Bericht nennt je Faehigkeit Beleg und Einschraenkung", () => {
    const report = buildParityReport();
    expect(report).toContain("Faehigkeitsparitaet gegen den Base44-Superagenten");
    expect(report).toContain("[GRUEN] chat");
    expect(report).toContain("Beleg: lib/agent-skill-registry-logic.ts");
    expect(report).toContain("Einschraenkung:");
    expect(report).toContain("Gratis-Spitze");
  });
});
