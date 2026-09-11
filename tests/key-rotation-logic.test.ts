import { describe, expect, it } from "vitest";

import {
  createKeyPoolEntry,
  keyHealthScore,
  KEY_ROTATION_COOLDOWN_MS,
  MODEL_TIERS,
  recordKeyObservation,
  refreshKeyPool,
  rotateOnFailure,
  selectFailoverKey,
  selectModelTier,
} from "../lib/key-rotation-logic";

function pool() {
  return [
    createKeyPoolEntry({ id: "key-a", provider: "openai", label: "…aa01", latencyMs: 300, remainingCredits: 1 }),
    createKeyPoolEntry({ id: "key-b", provider: "openai", label: "…bb02", latencyMs: 900, remainingCredits: 0.5 }),
    createKeyPoolEntry({ id: "key-c", provider: "anthropic", label: "…cc03", latencyMs: 500, remainingCredits: 0.9 }),
  ];
}

describe("key rotation logic", () => {
  it("scores key health from latency and remaining credits", () => {
    const entries = pool();
    expect(keyHealthScore(entries[0])).toBeGreaterThan(keyHealthScore(entries[1]));
    const exhausted = { ...entries[0], status: "exhausted" as const };
    expect(keyHealthScore(exhausted)).toBe(0);
  });

  it("puts keys into cooldown on HTTP 429 and clears it after the window", () => {
    const entry = pool()[0];
    const limited = recordKeyObservation(entry, { httpStatus: 429, nowMs: 1_000 });
    expect(limited.status).toBe("cooling");
    expect(limited.cooldownUntilMs).toBe(1_000 + KEY_ROTATION_COOLDOWN_MS);

    const refreshed = refreshKeyPool([limited], 1_000 + KEY_ROTATION_COOLDOWN_MS + 1);
    expect(refreshed[0].status).toBe("active");
    expect(refreshed[0].cooldownUntilMs).toBeNull();
  });

  it("marks keys exhausted on payment/auth failures and zero credits", () => {
    const entry = pool()[0];
    expect(recordKeyObservation(entry, { httpStatus: 402 }).status).toBe("exhausted");
    expect(recordKeyObservation(entry, { httpStatus: 403 }).status).toBe("exhausted");
    expect(recordKeyObservation(entry, { remainingCredits: 0 }).status).toBe("exhausted");
  });

  it("selects the healthiest available failover key deterministically", () => {
    const selection = selectFailoverKey(pool(), { excludeId: "key-a", provider: "openai" });
    expect(selection.selected?.id).toBe("key-b");
    expect(selection.reason).toContain("…bb02");

    const all = selectFailoverKey(pool());
    expect(all.selected?.id).toBe("key-a");

    const none = selectFailoverKey([
      { ...pool()[0], status: "cooling", cooldownUntilMs: 1 },
      { ...pool()[1], status: "exhausted" },
    ]);
    expect(none.selected).toBeNull();
    expect(none.reason).toContain("erschöpft");
  });

  it("rotates on failure without dropping the execution context", () => {
    const result = rotateOnFailure({
      pool: pool(),
      failedKeyId: "key-a",
      observation: { httpStatus: 429, nowMs: 5_000, latencyMs: 300 },
      carriedContext: { sessionId: "s-42", transcript: ["Frage", "Antwort"], goalId: "g-1" },
    });
    const failed = result.pool.find((entry) => entry.id === "key-a");
    expect(failed?.status).toBe("cooling");
    expect(result.report).not.toBeNull();
    expect(result.report?.fromKeyId).toBe("key-a");
    expect(result.report?.toKeyId).toBe("key-b");
    expect(result.report?.carriedContext).toEqual({ sessionId: "s-42", transcript: ["Frage", "Antwort"], goalId: "g-1" });
    expect(result.report?.atMs).toBe(5_000);
  });

  it("keeps the pool when the failed key is unknown", () => {
    const original = pool();
    const result = rotateOnFailure({
      pool: original,
      failedKeyId: "key-nix",
      observation: { httpStatus: 429 },
      carriedContext: {},
    });
    expect(result.pool).toEqual(original);
    expect(result.report).toBeNull();
  });

  it("picks the cheapest capable model tier per task class", () => {
    expect(selectModelTier("chat", "light")).toBe("mini");
    expect(selectModelTier("chat", "medium")).toBe("standard");
    expect(selectModelTier("chat", "heavy")).toBe("flagship");
    expect(selectModelTier("code", "light")).toBe("standard");
    expect(selectModelTier("code", "heavy")).toBe("flagship");
    expect(selectModelTier("reasoning", "light")).toBe("flagship");
    expect(selectModelTier("ui", "medium")).toBe("standard");
    expect(MODEL_TIERS.mini.cost).toBeLessThan(MODEL_TIERS.standard.cost);
    expect(MODEL_TIERS.standard.cost).toBeLessThan(MODEL_TIERS.flagship.cost);
  });
});
