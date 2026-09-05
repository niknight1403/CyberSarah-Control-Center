import { describe, expect, it } from "vitest";
import {
  appendUsageEntry,
  buildUsageBudgetView,
  getUsageBudgetConfig,
  parsePersistedUsageEntries,
  serializeUsageEntries,
  USAGE_ENTRIES_LIMIT,
} from "../lib/usage-budget-view-logic";

describe("usage budget view logic", () => {
  it("builds a rolling 30-day window config deterministically", () => {
    const now = 1_000_000_000_000;
    const config = getUsageBudgetConfig(now);
    expect(config.windowEndMs).toBe(now);
    expect(config.windowStartMs).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(config.limitCostUnits).toBe(1_000);
    expect(config.warnThresholdPercent).toBe(80);
  });

  it("supports overrides and rejects invalid parameters", () => {
    const config = getUsageBudgetConfig(1_000, { windowMs: 100, limitCostUnits: 10, warnThresholdPercent: 50 });
    expect(config).toMatchObject({ windowStartMs: 900, windowEndMs: 1_000, limitCostUnits: 10, warnThresholdPercent: 50 });
    expect(() => getUsageBudgetConfig(Number.NaN)).toThrow();
    expect(() => getUsageBudgetConfig(1_000, { windowMs: 0 })).toThrow();
    expect(() => getUsageBudgetConfig(1_000, { limitCostUnits: -1 })).toThrow();
  });

  it("sanitizes persisted entries: drops invalid, sorts, caps at the limit", () => {
    const flood = Array.from({ length: USAGE_ENTRIES_LIMIT + 10 }, (_, index) => ({
      timestampMs: index,
      costUnits: 1,
    }));
    const reversed = [...flood].reverse();
    const parsed = parsePersistedUsageEntries(JSON.stringify(reversed));
    expect(parsed).toHaveLength(USAGE_ENTRIES_LIMIT);
    expect(parsed[0].timestampMs).toBe(10);
    expect(parsed.at(-1)?.timestampMs).toBe(USAGE_ENTRIES_LIMIT + 9);
  });

  it("returns an empty list for missing or corrupted payloads", () => {
    expect(parsePersistedUsageEntries(null)).toEqual([]);
    expect(parsePersistedUsageEntries("not json")).toEqual([]);
    expect(parsePersistedUsageEntries('{"entries":[]}')).toEqual([]);
    expect(parsePersistedUsageEntries('[{"timestampMs":"x","costUnits":1}]')).toEqual([]);
  });

  it("appends deterministically and keeps the oldest entries dropping overflow", () => {
    const many = Array.from({ length: USAGE_ENTRIES_LIMIT }, (_, index) => ({ timestampMs: index, costUnits: 1 }));
    const next = appendUsageEntry(many, { timestampMs: 5_000, costUnits: 2 });
    expect(next).toHaveLength(USAGE_ENTRIES_LIMIT);
    expect(next.at(-1)).toEqual({ timestampMs: 5_000, costUnits: 2 });
    expect(next[0].timestampMs).toBe(1);
    expect(appendUsageEntry(many, { timestampMs: Number.NaN, costUnits: 1 })).toHaveLength(USAGE_ENTRIES_LIMIT);
  });

  it("serializes sanitized entries and survives a round trip", () => {
    const entries = [{ timestampMs: 20, costUnits: 1 }, { timestampMs: 10, costUnits: 2 }];
    const serialized = serializeUsageEntries(entries);
    expect(parsePersistedUsageEntries(serialized)).toEqual([{ timestampMs: 10, costUnits: 2 }, { timestampMs: 20, costUnits: 1 }]);
  });

  it("builds a token-free ready view for low usage", () => {
    const now = 10_000;
    const view = buildUsageBudgetView([{ timestampMs: now - 1, costUnits: 100 }], getUsageBudgetConfig(now, { limitCostUnits: 1_000 }));
    expect(view.level).toBe("ok");
    expect(view.tone).toBe("ready");
    expect(view.badgeLabel).toBe("Budget ok");
    expect(view.usagePercent).toBe(10);
    expect(view.remainingCostUnits).toBe(900);
    expect(view.summary).toContain("10 Prozent");
    expect(view.admissionReason).not.toContain("abgelehnt");
  });

  it("warns at the threshold and refuses admission when exhausted", () => {
    const now = 10_000;
    const config = getUsageBudgetConfig(now, { limitCostUnits: 100 });
    const warning = buildUsageBudgetView([{ timestampMs: now - 1, costUnits: 85 }], config);
    expect(warning.level).toBe("warning");
    expect(warning.badgeLabel).toBe("Budget-Warnung");
    expect(warning.summary).toContain("85 Prozent");

    const exhausted = buildUsageBudgetView([{ timestampMs: now - 1, costUnits: 120 }], config);
    expect(exhausted.level).toBe("exhausted");
    expect(exhausted.tone).toBe("warning");
    expect(exhausted.usagePercent).toBe(100);
    expect(exhausted.admissionReason).toContain("abgelehnt");
  });

  it("contains no secret-shaped values in any view output", () => {
    const now = 10_000;
    const view = buildUsageBudgetView([{ timestampMs: now - 1, costUnits: 5 }], getUsageBudgetConfig(now));
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/token|secret|password|api[-_]?key|https?:\/\//i);
  });
});
