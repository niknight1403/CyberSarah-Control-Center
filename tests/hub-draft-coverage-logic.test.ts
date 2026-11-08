import { describe, expect, it } from "vitest";

import {
  buildCoverage,
  buildHubContentDraft,
  buildHubLoopDraft,
  countCoverage,
  DRAFT_HUB_IDS,
  getHubDefinition,
  HUB_DEFINITIONS,
  isDraftHubId,
  isLoopStage,
  LOOP_STAGES,
  planHubDrafts,
  readDraftTags,
  stageCoverageKey,
  weekKeyFrom,
} from "../lib/hub-draft-coverage-logic";

const NOW = Date.UTC(2026, 10, 9, 9, 0, 0);

describe("Hub-Katalog", () => {
  it("deckt jeden Bereich mit Zweck, Metrik und vier Stufen ab", () => {
    expect(HUB_DEFINITIONS).toHaveLength(DRAFT_HUB_IDS.length);
    for (const hub of HUB_DEFINITIONS) {
      expect(hub.purpose.length).toBeGreaterThan(10);
      expect(hub.metric.length).toBeGreaterThan(5);
      expect(hub.measurementGap.length).toBeGreaterThan(5);
      expect(hub.personas.length).toBeGreaterThan(0);
      expect(hub.platforms.length).toBeGreaterThan(0);
      for (const stageName of LOOP_STAGES) {
        expect(hub.stages[stageName].intent.length).toBeGreaterThan(10);
        expect(hub.stages[stageName].cta.length).toBeGreaterThan(5);
        expect(hub.stages[stageName].formats.length).toBeGreaterThan(0);
      }
    }
  });

  it("erkennt gueltige Hub- und Stufen-Kennungen", () => {
    expect(isDraftHubId("hara")).toBe(true);
    expect(isDraftHubId("unbekannt")).toBe(false);
    expect(isLoopStage("offer")).toBe(true);
    expect(isLoopStage("kauf")).toBe(false);
  });
});

describe("Soll-Plan", () => {
  it("plant bei leerem Ist genau eine Stufe je Hub", () => {
    const jobs = planHubDrafts({ nowMs: NOW });
    expect(jobs).toHaveLength(DRAFT_HUB_IDS.length);
    expect(new Set(jobs.map((job) => job.hub)).size).toBe(DRAFT_HUB_IDS.length);
  });

  it("ist deterministisch fuer denselben Zeitpunkt", () => {
    const first = planHubDrafts({ nowMs: NOW });
    const second = planHubDrafts({ nowMs: NOW });
    expect(second).toEqual(first);
  });

  it("rotiert die Stufe mit dem Tag, damit ueber die Woche alles drankommt", () => {
    const today = planHubDrafts({ nowMs: NOW }).find((job) => job.hub === "hara");
    const tomorrow = planHubDrafts({ nowMs: NOW + 86_400_000 }).find((job) => job.hub === "hara");
    expect(today?.stage).not.toBe(tomorrow?.stage);
  });

  it("ueberspringt bereits besetzte Stufen", () => {
    const covered = Object.fromEntries(
      LOOP_STAGES.map((stageName) => [stageCoverageKey("hara", stageName), 1]),
    );
    const jobs = planHubDrafts({ nowMs: NOW, covered, hubs: ["hara", "saas"] });
    expect(jobs.every((job) => job.hub !== "hara")).toBe(true);
    expect(jobs).toHaveLength(1);
  });

  it("kann mehrere Stufen je Lauf planen, hoechstens aber vier", () => {
    const two = planHubDrafts({ nowMs: NOW, stagesPerHub: 2, hubs: ["saas"] });
    expect(two).toHaveLength(2);
    expect(new Set(two.map((job) => job.stage)).size).toBe(2);
    const ten = planHubDrafts({ nowMs: NOW, stagesPerHub: 10, hubs: ["saas"] });
    expect(ten).toHaveLength(LOOP_STAGES.length);
  });

  it("baut den Dedupe-Schluessel mit Kalenderwoche", () => {
    const job = planHubDrafts({ nowMs: NOW, hubs: ["loop"] })[0];
    expect(job.dedupeKey).toBe(`hub-draft:loop:${job.stage}:${weekKeyFrom(NOW)}`);
    expect(weekKeyFrom(NOW)).toMatch(/^2026-W\d{2}$/);
  });

  it("besetzt jede Stufe mit einer Persona, die den Hub fuehrt", () => {
    const jobs = planHubDrafts({ nowMs: NOW, stagesPerHub: 4, hubs: ["trading", "b2b"] });
    for (const job of jobs) {
      const hub = getHubDefinition(job.hub);
      expect(hub?.personas).toContain(job.personaId);
      expect(hub?.platforms).toContain(job.platform);
    }
  });
});

describe("Entwuerfe bauen", () => {
  const job = planHubDrafts({ nowMs: NOW, hubs: ["hara"] })[0];

  it("erzeugt einen inhaltlich vollstaendigen Entwurf mit Transparenzhinweis", () => {
    const draft = buildHubContentDraft(job);
    expect(draft.hub).toBe("hara");
    expect(draft.loopStage).toBe(job.stage);
    expect(draft.content).toContain("Handlungsaufruf");
    expect(draft.content).toContain("Transparenz:");
    expect(draft.content.length).toBeGreaterThan(200);
    expect(draft.title.length).toBeLessThanOrEqual(200);
  });

  it("erfindet keine Umsatz- oder Reichweitenergebnisse", () => {
    const draft = buildHubContentDraft(job);
    expect(draft.content).not.toMatch(/€|EUR\b/);
    expect(draft.content).not.toMatch(/\b\d+\s?%\s?(mehr|Umsatz|Reichweite)/i);
    expect(draft.content).toContain("kein geschaetzter Wert");
  });

  it("baut je Hub einen Loop-Entwurf ohne erfundene Zielzahl", () => {
    const loop = buildHubLoopDraft("saas");
    expect(loop.hub).toBe("saas");
    expect(loop.stages).toHaveLength(LOOP_STAGES.length);
    expect(loop.baseline).toBe("keine Messdaten vorhanden");
    expect(loop.autopilotKey).toBe("hub-loop:saas:v1");
    expect(Number.isFinite(loop.hypothesis as unknown as number)).toBe(false);
  });
});

describe("Ist-Abgleich", () => {
  it("liest Hub und Stufe aus dem Payload", () => {
    expect(readDraftTags({ payload: { hub: "b2b", loopStage: "trust" } })).toEqual({ hub: "b2b", stage: "trust" });
    expect(readDraftTags({ payload: { hub: "unbekannt" } })).toEqual({ hub: null, stage: null });
    expect(readDraftTags({ payload: null })).toEqual({ hub: null, stage: null });
  });

  it("zaehlt nur offene, getaggte Entwuerfe", () => {
    const counts = countCoverage([
      { payload: { hub: "hara", loopStage: "attention" }, status: "pending" },
      { payload: { hub: "hara", loopStage: "attention" }, status: "pending" },
      { payload: { hub: "hara", loopStage: "attention" }, status: "approved" },
      { payload: { topic: "ohne Hub" }, status: "pending" },
    ]);
    expect(counts[stageCoverageKey("hara", "attention")]).toBe(2);
    expect(Object.keys(counts)).toHaveLength(1);
  });

  it("rechnet Abdeckung in Stufen, nicht in Entwurfsmenge", () => {
    const summary = buildCoverage(
      Array.from({ length: 6 }, () => ({ payload: { hub: "loop", loopStage: "attention" }, status: "pending" })),
      ["loop", "hara"],
    );
    const loop = summary.hubs.find((hub) => hub.hub === "loop");
    expect(loop?.coveredStages).toBe(1);
    expect(loop?.coveragePct).toBe(25);
    expect(summary.coveragePct).toBe(13);
    expect(summary.completeHubs).toEqual([]);
    expect(summary.emptyHubs).toEqual(["hara"]);
    expect(loop?.nextStep).toContain("fehlt");
  });

  it("meldet vollstaendige Hubs als abgeschlossen", () => {
    const rows = LOOP_STAGES.map((stageName) => ({
      payload: { hub: "trading", loopStage: stageName },
      status: "pending",
    }));
    const summary = buildCoverage(rows, ["trading"]);
    expect(summary.coveragePct).toBe(100);
    expect(summary.completeHubs).toEqual(["trading"]);
    expect(summary.hubs[0].nextStep).toContain("Verteilung");
  });
});
