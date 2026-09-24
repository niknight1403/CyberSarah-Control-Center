/**
 * Sprint 312 — Tests fuer den Ergebnis-Verlauf.
 */
import { describe, it, expect } from "vitest";
import {
  startEntry,
  recordSuccess,
  recordFailure,
  filterHistory,
  paginateHistory,
  formatSizeLabel,
  formatStateLine,
} from "@/lib/media-history-logic";

const e = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  userId: "u1",
  projectId: "p1",
  kind: "video" as const,
  title: "Mein Video",
  state: "rendering" as const,
  createdAt: 1000,
  sizeBytes: null,
  ...overrides,
});

describe("Sprint 312 — Media History Logic", () => {
  it("startEntry beginnt ohne Groesse (ehrlich unbekannt)", () => {
    const entry = startEntry("m1", "u1", "p1", "video", "V", 1000);
    expect(entry.state).toBe("rendering");
    expect(entry.sizeBytes).toBeNull();
  });

  it("Erfolg setzt Status und Groesse, spaetere Updates sind No-Ops", () => {
    let entry = startEntry("m1", "u1", "p1", "video", "V", 1000);
    entry = recordSuccess(entry, 2 * 1024 * 1024);
    expect(entry.state).toBe("done");
    expect(entry.sizeBytes).toBe(2 * 1024 * 1024);
    expect(recordSuccess(entry, 999).sizeBytes).toBe(2 * 1024 * 1024);
  });

  it("Fehlschlag bleibt mit Grund im Verlauf sichtbar", () => {
    const entry = recordFailure(startEntry("m1", "u1", "p1", "video", "V", 1000), "Timeout");
    expect(entry.state).toBe("failed");
    expect(entry.errorReason).toBe("Timeout");
    expect(formatStateLine(entry)).toContain("Timeout");
  });

  it("filterHistory trennt Nutzer und filtert Status/Art, neueste zuerst", () => {
    const entries = [
      e({ id: "a", createdAt: 100 }),
      e({ id: "b", userId: "u2" }),
      e({ id: "c", state: "done", sizeBytes: 5, createdAt: 300 }),
      e({ id: "d", kind: "audio", createdAt: 50 }),
    ];
    const own = filterHistory(entries, { userId: "u1" });
    expect(own.map((x) => x.id)).toEqual(["c", "a", "d"]);
    expect(filterHistory(entries, { userId: "u1", state: "done" }).map((x) => x.id)).toEqual(["c"]);
    expect(filterHistory(entries, { userId: "u1", kind: "audio" }).map((x) => x.id)).toEqual(["d"]);
  });

  it("paginateHistory clamped Seiten und hasMore", () => {
    const entries = [e({ id: "1" }), e({ id: "2" }), e({ id: "3" })];
    const p = paginateHistory(entries, 1, 2);
    expect(p.items.map((x) => x.id)).toEqual(["3"]);
    expect(p.totalPages).toBe(2);
    expect(p.hasMore).toBe(false);
    const p0 = paginateHistory(entries, 0, 2);
    expect(p0.hasMore).toBe(true);
    expect(paginateHistory(entries, 99, 2).page).toBe(1);
  });

  it("formatSizeLabel bleibt ehrlich: unbekannt != 0 KB", () => {
    expect(formatSizeLabel(e())).toContain("unbekannt");
    expect(formatSizeLabel(e({ state: "done", sizeBytes: 2048 }))).toBe("2 KB");
    expect(formatSizeLabel(e({ state: "done", sizeBytes: 3 * 1024 * 1024 }))).toBe("3.0 MB");
  });

  it("formatStateLine nennt Fortschritt und Ergebnis", () => {
    expect(formatStateLine(e())).toContain("Rendert");
    expect(formatStateLine(e({ state: "done", sizeBytes: 1024 }))).toContain("Fertig");
  });
});
