import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFLINE_RETRY_POLICY,
  advanceOfflineQueue,
  enqueueOfflineAction,
  planOfflineQueueRetries,
  recordOfflineActionAttempt,
  type OfflineAction,
} from "../lib/offline-action-logic";

function makeAction(overrides: Partial<OfflineAction> = {}): OfflineAction {
  return {
    ...enqueueOfflineAction({
      id: overrides.id ?? "action-1",
      repositoryId: "repo-1",
      kind: "push",
      summary: "Push reviewed workspace changes",
      createdAt: "2026-09-11T00:00:00.000Z",
      hasConflictRisk: false,
    }),
    ...overrides,
  };
}

describe("offline queue backoff integration (sprint 48)", () => {
  it("plant offene Aktionen mit exponentiell wachsenden Abständen", () => {
    const first = recordOfflineActionAttempt(makeAction({ id: "a-1", attempts: 0 }), 1_000, false);
    const second = recordOfflineActionAttempt(makeAction({ id: "a-2", attempts: 2 }), 5_000, false);
    const plan = planOfflineQueueRetries([first, second], 10_000);
    // recordOfflineActionAttempt zählt den Versuch: 1 -> 60s, 3 -> 240s Abstand
    expect(plan.scheduled).toEqual([
      { id: "a-1", nextAttemptAtMs: 61_000 },
      { id: "a-2", nextAttemptAtMs: 245_000 },
    ]);
    expect(plan.blocked).toEqual([]);
    expect(plan.exhausted).toEqual([]);
  });

  it("blockiert konfliktierende Aktionen sichtbar und plant sie nicht", () => {
    const conflicted = recordOfflineActionAttempt(makeAction({ hasConflictRisk: true }), 1_000, true);
    const plan = planOfflineQueueRetries([conflicted], 10_000);
    expect(plan.scheduled).toEqual([]);
    expect(plan.blocked).toEqual([
      { id: "action-1", reason: "Die Aktion steht im Konflikt und muss manuell entschieden werden." },
    ]);
  });

  it("lehnt erschöpfte Versuche final ab", () => {
    const exhausted = makeAction({ attempts: DEFAULT_OFFLINE_RETRY_POLICY.maxAttempts, status: "retrying" });
    const plan = planOfflineQueueRetries([exhausted], 10_000);
    expect(plan.scheduled).toEqual([]);
    expect(plan.exhausted).toEqual([
      { id: "action-1", reason: "Maximalversuche (5) erreicht. Die Aktion wird endgültig abgelehnt." },
    ]);
  });

  it("plant abgeschlossene und bereits abgelehnte Aktionen nicht", () => {
    const done = makeAction({ status: "completed" });
    const failed = makeAction({ status: "failed" });
    expect(planOfflineQueueRetries([done, failed], 10_000)).toEqual({ scheduled: [], blocked: [], exhausted: [] });
  });

  it("klemmt die Verzögerung auf das Maximum", () => {
    const veteran = makeAction({ attempts: 3, lastAttemptAtMs: 1_000, status: "retrying" });
    const policy = { baseDelayMs: 1_000, maxDelayMs: 1_500, maxAttempts: 10 };
    expect(planOfflineQueueRetries([veteran], 2_000, policy)).toEqual({
      scheduled: [{ id: "action-1", nextAttemptAtMs: 2_500 }],
      blocked: [],
      exhausted: [],
    });
  });

  it("advanceOfflineQueue markiert nur erschöpfte Aktionen final als abgelehnt", () => {
    const exhausted = makeAction({ id: "a-out", attempts: 5, status: "retrying" });
    const scheduled = recordOfflineActionAttempt(makeAction({ id: "a-in", attempts: 0 }), 1_000, false);
    const conflicted = recordOfflineActionAttempt(makeAction({ id: "a-block", hasConflictRisk: true }), 1_000, true);
    const { actions, plan } = advanceOfflineQueue([exhausted, scheduled, conflicted], 10_000);
    expect(actions.find((action) => action.id === "a-out")).toMatchObject({ status: "failed" });
    expect(actions.find((action) => action.id === "a-in")).toMatchObject({ status: "retrying", attempts: 1 });
    expect(actions.find((action) => action.id === "a-block")).toMatchObject({ status: "retrying", hasConflictRisk: true });
    expect(plan.exhausted.map((entry) => entry.id)).toEqual(["a-out"]);
    expect(plan.scheduled.map((entry) => entry.id)).toEqual(["a-in"]);
    expect(plan.blocked.map((entry) => entry.id)).toEqual(["a-block"]);
  });

  it("erlaubt eine eigene Richtlinie und bleibt deterministisch", () => {
    const action = recordOfflineActionAttempt(makeAction({ attempts: 1 }), 2_000, false);
    const policy = { baseDelayMs: 1_000, maxDelayMs: 60_000, maxAttempts: 3 };
    const first = planOfflineQueueRetries([action], 0, policy);
    const second = planOfflineQueueRetries([action], 0, policy);
    expect(first).toEqual(second);
    // Versuch 2: 1_000 * 2^2 = 4_000 ms nach dem letzten Versuch
    expect(first.scheduled).toEqual([{ id: "action-1", nextAttemptAtMs: 6_000 }]);
  });

  it("verwirft endlose Zeitpunkte und schützt abgeschlossene Aktionen", () => {
    expect(() => planOfflineQueueRetries([], Number.NaN)).toThrow("Ein endlicher Planungszeitpunkt ist erforderlich.");
    expect(() => recordOfflineActionAttempt(makeAction(), Number.NaN, false)).toThrow(
      "Ein endlicher Versuchszeitpunkt ist erforderlich."
    );
    const completed = makeAction({ status: "completed" });
    expect(recordOfflineActionAttempt(completed, 10_000, true)).toEqual(completed);
  });
});
