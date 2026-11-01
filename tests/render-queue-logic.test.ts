/**
 * Sprint 306 — Tests fuer Render-Warteschlange mit ehrlichem Fortschritt.
 */
import { describe, it, expect } from "vitest";
import {
  enqueueJob,
  queuePosition,
  jobsToStart,
  honestProgress,
  estimateEtaSeconds,
  formatProgressLine,
  MAX_ACTIVE_RENDERS,
} from "@/lib/render-queue-logic";
import type { RenderJob } from "@/lib/render-queue-logic";

const job = (overrides: Partial<RenderJob> = {}): RenderJob => ({
  id: "j1",
  projectId: "p1",
  totalScenes: 4,
  completedScenes: 0,
  state: "queued",
  priority: 0,
  enqueuedAt: 1,
  ...overrides,
});

describe("Sprint 306 — Render Queue Logic", () => {
  it("ordnet hoehere Prioritaet zuerst, FIFO bei Gleichstand", () => {
    let q = { jobs: [] as RenderJob[] };
    q = enqueueJob(q, job({ id: "low", priority: 0, enqueuedAt: 1 }));
    q = enqueueJob(q, job({ id: "high", priority: 5, enqueuedAt: 2 }));
    q = enqueueJob(q, job({ id: "low2", priority: 0, enqueuedAt: 3 }));
    expect(q.jobs.map((j) => j.id)).toEqual(["high", "low", "low2"]);
  });

  it("queuePosition zaehlt nur wartende Jobs (1-basiert)", () => {
    let q = { jobs: [] as RenderJob[] };
    q = enqueueJob(q, job({ id: "a" }));
    q = enqueueJob(q, job({ id: "b" }));
    expect(queuePosition(q, "b")).toBe(2);
    expect(queuePosition(q, "a")).toBe(1);
  });

  it("jobsToStart respektiert MAX_ACTIVE_RENDERS", () => {
    let q = { jobs: [] as RenderJob[] };
    for (let i = 0; i < 4; i++) q = enqueueJob(q, job({ id: `j${i}` }));
    expect(jobsToStart(q)).toHaveLength(MAX_ACTIVE_RENDERS);
    // Ein Slot belegt: genau ein weiterer Job startet, nicht zwei.
    let partial = { jobs: [job({ id: "x", state: "rendering" })] };
    partial = enqueueJob(partial, job({ id: "y1" }));
    partial = enqueueJob(partial, job({ id: "y2" }));
    expect(jobsToStart(partial).map((j) => j.id)).toEqual(["y1"]);
  });

  it("honestProgress bleibt in 0..1 und ohne Szenen bei 0", () => {
    expect(honestProgress(job({ completedScenes: 2, totalScenes: 4 }))).toBe(0.5);
    expect(honestProgress(job({ completedScenes: 9, totalScenes: 4 }))).toBe(1);
    expect(honestProgress(job({ totalScenes: 0 }))).toBe(0);
  });

  it("ETA bleibt ohne Messwerte ehrlich unbekannt", () => {
    expect(estimateEtaSeconds(job(), null)).toBeNull();
    expect(estimateEtaSeconds(job(), 0)).toBeNull();
    expect(estimateEtaSeconds(job({ completedScenes: 1 }), 10)).toBe(30);
  });

  it("formatProgressLine nennt Szenenfortschritt und ETA-Status", () => {
    expect(formatProgressLine(job({ completedScenes: 1 }), 5)).toContain("1/4");
    expect(formatProgressLine(job(), null)).toContain("ETA unbekannt");
    expect(formatProgressLine(job({ completedScenes: 1 }), 5)).toContain("ETA ~15s");
  });
});
