import { describe, it, expect } from "vitest";
import {
  activeRecord,
  scheduleCancellation,
  revertCancellation,
  finalizeIfPeriodEnded,
  buildConsequenceList,
  confirmationQuestion,
  formatStateLine,
} from "@/lib/cancellation-flow-logic";

const DAY = 86_400_000;

describe("Sprint 320 — Kuendigungs-Flow", () => {
  it("Kuendigung merkt vor und wirkt erst am Periodenende", () => {
    const rec = activeRecord("pro", 30 * DAY);
    const marked = scheduleCancellation(rec, 10 * DAY, "zu teuer");
    expect(marked.state).toBe("kuendigung-vorgemerkt");
    expect(marked.requestedAt).toBe(10 * DAY);
    expect(finalizeIfPeriodEnded(marked, 20 * DAY).state).toBe("kuendigung-vorgemerkt");
    expect(finalizeIfPeriodEnded(marked, 30 * DAY).state).toBe("gekuendet");
  });

  it("Ruecknahme nur vor Periodenende aus der Vormerkung", () => {
    const rec = activeRecord("pro", 30 * DAY);
    const marked = scheduleCancellation(rec, 10 * DAY, "x");
    expect(revertCancellation(marked, 20 * DAY).state).toBe("aktiv");
    expect(revertCancellation(marked, 30 * DAY).state).toBe("kuendigung-vorgemerkt");
    expect(revertCancellation(rec, 10 * DAY).state).toBe("aktiv");
  });

  it("Kuendigung nach Periodenende oder ohne Grund-Text ist No-Op", () => {
    const rec = activeRecord("pro", 30 * DAY);
    expect(scheduleCancellation(rec, 30 * DAY, "x").state).toBe("aktiv");
    const empty = scheduleCancellation(rec, 10 * DAY, "   ");
    expect(empty.state).toBe("kuendigung-vorgemerkt");
    expect(empty.reason).toBe("Keine Angabe");
  });

  it("Konsequenz-Liste nennt Verluste und Restlaufzeit ehrlich", () => {
    const rec = activeRecord("pro", 30 * DAY);
    expect(buildConsequenceList(rec, "01.10.2026")).toEqual([]);
    const marked = scheduleCancellation(rec, 10 * DAY, "x");
    const lines = buildConsequenceList(marked, "01.10.2026");
    expect(lines[0]).toContain("01.10.2026");
    expect(lines[1]).toContain("Free-Stufe");
    expect(lines.some((l) => l.startsWith("Verlust:"))).toBe(true);
  });

  it("Bestaetigungsfrage ist ruhig und klar", () => {
    const marked = scheduleCancellation(activeRecord("pro", 30 * DAY), 1, "x");
    expect(confirmationQuestion(marked, "01.10.2026")).toContain("wirklich");
    expect(confirmationQuestion(marked, "01.10.2026")).toContain("behaeltst");
  });

  it("Statuszeilen je Zustand", () => {
    const rec = activeRecord("lite", 30 * DAY);
    expect(formatStateLine(rec, "01.10.2026")).toContain("Aktiv");
    const marked = scheduleCancellation(rec, 1, "x");
    expect(formatStateLine(marked, "01.10.2026")).toContain("vorgemerkt");
    expect(formatStateLine(finalizeIfPeriodEnded(marked, 30 * DAY), "01.10.2026")).toContain("Gekuendet");
  });
});
