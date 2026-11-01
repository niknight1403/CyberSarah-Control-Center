import { describe, it, expect } from "vitest";
import {
  initialQuotaModeState,
  switchQuotaMode,
  shouldBlockOnQuota,
  describeQuotaOutcome,
  recentAuditEntries,
  formatAuditEntry,
  canSwitchQuotaMode,
} from "@/lib/quota-mode-logic";

describe("Sprint 314 — Quota-Mode-Schalter", () => {
  it("startet im Modus monitor und blockiert nie", () => {
    const s = initialQuotaModeState(0);
    expect(s.mode).toBe("monitor");
    expect(shouldBlockOnQuota(s, true)).toBe(false);
  });

  it("Wechsel auf enforce mit Audit-Eintrag; kein Grund = No-Op", () => {
    const s = initialQuotaModeState(0);
    const switched = switchQuotaMode(s, "enforce", "admin1", "Go-Live", 100, "a1");
    expect(switched.mode).toBe("enforce");
    expect(switched.auditLog).toHaveLength(2);
    expect(switched.auditLog[1].reason).toBe("Go-Live");
    expect(switchQuotaMode(s, "enforce", "admin1", "  ", 100, "a2")).toBe(s);
  });

  it("Gleich-Modus-Wechsel wird abgelehnt", () => {
    const s = initialQuotaModeState(0);
    const r = canSwitchQuotaMode(s, "monitor");
    expect(r.allowed).toBe(false);
  });

  it("enforce blockiert nur bei Ueberschreitung, monitor zaehlt ehrlich", () => {
    const enforce = { mode: "enforce" as const, auditLog: [] };
    expect(shouldBlockOnQuota(enforce, false)).toBe(false);
    expect(describeQuotaOutcome(enforce, true).message).toContain("blockiert");

    const monitor = initialQuotaModeState(0);
    const out = describeQuotaOutcome(monitor, true);
    expect(out.blocked).toBe(false);
    expect(out.message).toContain("gezaehlt");
  });

  it("Audit-Log: neueste zuerst, formatiert lesbar", () => {
    let s = initialQuotaModeState(0);
    s = switchQuotaMode(s, "enforce", "admin", "Eins", 100, "a1");
    s = switchQuotaMode(s, "monitor", "admin", "Zwei", 200, "a2");
    const recent = recentAuditEntries(s, 1);
    expect(recent[0].id).toBe("a2");
    expect(formatAuditEntry(recent[0], "2026-09-24")).toContain("enforce -> monitor");
  });
});
