import { describe, expect, it } from "vitest";
import {
  countVillasByStatus,
  formatFleetHeadline,
  isSnapshotFresh,
  summarizeFleet,
  type VillaForgeFleetSnapshot,
} from "../lib/villaforge-logic";

const NOW = 1_700_000_000_000;

function snapshot(overrides: Partial<VillaForgeFleetSnapshot> = {}): VillaForgeFleetSnapshot {
  return {
    villas: [
      { status: "RUNNING", c: 5 },
      { status: "PAUSED", c: 10 },
    ],
    scheduler: { slots: 5, active: [1, 2, 3, 4, 5], queued: 0 },
    scores: [
      { villaId: 12, name: "Revenue Engine", score: 58, doneLastHour: 2, open: 3, avgTaskScore: 61 },
      { villaId: 5, name: "Filmstudio", score: 57, doneLastHour: 1, open: 4, avgTaskScore: 59 },
    ],
    scoredTasks: { c: 240, avg: 60.6 },
    localFirst: { localSharePct: 49 },
    messenger: { enabled: false, allowedChats: 0, running: false },
    ts: NOW - 60_000,
    ...overrides,
  };
}

describe("countVillasByStatus", () => {
  it("zaehlt RUNNING und PAUSED separat und alles in total", () => {
    const result = countVillasByStatus(snapshot().villas);
    expect(result).toEqual({ running: 5, paused: 10, total: 15 });
  });

  it("behandelt leere und unvollstaendige Eingaben defensiv", () => {
    expect(countVillasByStatus([])).toEqual({ running: 0, paused: 0, total: 0 });
    expect(countVillasByStatus(undefined as unknown as never[])).toEqual({ running: 0, paused: 0, total: 0 });
  });

  it("ignoriert unbekannte Status in running/paused, aber nicht in total", () => {
    const result = countVillasByStatus([{ status: "ARCHIVED", c: 3 }]);
    expect(result.running).toBe(0);
    expect(result.paused).toBe(0);
    expect(result.total).toBe(3);
  });
});

describe("isSnapshotFresh", () => {
  it("akzeptiert Snapshots juenger als 10 Minuten", () => {
    expect(isSnapshotFresh(snapshot({ ts: NOW - 9 * 60_000 }), NOW)).toBe(true);
  });

  it("lehnt veraltete und ungueltige Zeitstempel ab", () => {
    expect(isSnapshotFresh(snapshot({ ts: NOW - 11 * 60_000 }), NOW)).toBe(false);
    expect(isSnapshotFresh(snapshot({ ts: 0 }), NOW)).toBe(false);
  });
});

describe("summarizeFleet", () => {
  it("verdichtet den Snapshot mit Scores und Messenger-Status", () => {
    const summary = summarizeFleet(snapshot(), NOW);
    expect(summary).toMatchObject({
      running: 5,
      paused: 10,
      total: 15,
      slotsActive: 5,
      slotsTotal: 5,
      avgTaskScore: 60.6,
      scoredTasks: 240,
      localSharePct: 49,
      topVilla: { villaId: 12, score: 58, name: "Revenue Engine" },
      messengerEnabled: false,
      fresh: true,
      fleetHealthy: true,
    });
  });

  it("ist gesund nur mit laufenden Villen UND frischem Snapshot", () => {
    const noRunning = summarizeFleet(snapshot({ villas: [{ status: "PAUSED", c: 15 }] }), NOW);
    expect(noRunning.fleetHealthy).toBe(false);
    const stale = summarizeFleet(snapshot({ ts: NOW - 30 * 60_000 }), NOW);
    expect(stale.fleetHealthy).toBe(false);
  });

  it("uebersteht fehlende Scheduler- und Score-Daten ohne Absturz", () => {
    const broken = summarizeFleet({} as VillaForgeFleetSnapshot, NOW);
    expect(broken.running).toBe(0);
    expect(broken.slotsTotal).toBe(0);
    expect(broken.topVilla).toBeNull();
    expect(broken.avgTaskScore).toBeNull();
    expect(broken.fleetHealthy).toBe(false);
  });
});

describe("formatFleetHeadline", () => {
  it("baucht eine kompakte Kopfzeile mit allen Kernwerten", () => {
    const headline = formatFleetHeadline(summarizeFleet(snapshot(), NOW));
    expect(headline).toBe("5/5 Slots · 5 RUNNING · 10 PAUSED · Ø Task 60.6 · 49% lokal");
  });

  it("markiert veraltete Snapshots", () => {
    const headline = formatFleetHeadline(summarizeFleet(snapshot({ ts: NOW - 30 * 60_000 }), NOW));
    expect(headline.endsWith("veraltet")).toBe(true);
  });

  it("laesst den Task-Score weg, wenn er fehlt", () => {
    const headline = formatFleetHeadline(
      summarizeFleet(snapshot({ scoredTasks: { c: 0, avg: null } }), NOW),
    );
    expect(headline).not.toContain("Ø Task");
  });
});
