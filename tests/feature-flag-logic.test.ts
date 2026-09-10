import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_REGISTRY,
  defaultFeatureFlags,
  describeFeatureFlags,
  isFeatureEnabled,
  parseFeatureFlagOverrides,
  resolveFeatureFlags,
  toClientFeatureFlags,
} from "../lib/feature-flag-logic";

describe("feature-flag-logic", () => {
  it("deckt die Sprints 56-60 in der Registry ab", () => {
    const keys = FEATURE_FLAG_REGISTRY.map((flag) => flag.key);
    expect(keys).toContain("opsOverview");
    expect(keys).toContain("chatSessions");
    expect(keys).toContain("chatExport");
    expect(keys).toContain("chatQuota");
    expect(keys).toContain("backupManifest");
  });

  it("liefert Registry-Defaults, die alle standardmaessig an sind", () => {
    const defaults = defaultFeatureFlags();
    expect(Object.keys(defaults)).toHaveLength(FEATURE_FLAG_REGISTRY.length);
    for (const value of Object.values(defaults)) expect(value).toBe(true);
  });

  it("parst ENV-Overrides tolerante und ignoriert Muell/Unbekanntes", () => {
    expect(
      parseFeatureFlagOverrides("chatExport=off, chatQuota=on"),
    ).toEqual({ chatExport: false, chatQuota: true });
    expect(parseFeatureFlagOverrides("  chatExport=OFF ")).toEqual({ chatExport: false });
    expect(parseFeatureFlagOverrides("chatExport=1")).toEqual({ chatExport: true });
    expect(parseFeatureFlagOverrides("chatExport=0")).toEqual({ chatExport: false });
    expect(parseFeatureFlagOverrides("unbekanntesFlag=on")).toEqual({});
    expect(parseFeatureFlagOverrides("ohneGleichzeichen, , =")).toEqual({});
    expect(parseFeatureFlagOverrides("chatExport=vieleWorte")).toEqual({});
    expect(parseFeatureFlagOverrides("")).toEqual({});
  });

  it("laesst ENV-Overrides gewinnen, ohne unbekannte Keys einzuschleppen", () => {
    const resolved = resolveFeatureFlags({ chatExport: false, boese: true });
    expect(resolved.chatExport).toBe(false);
    expect(resolved.chatSessions).toBe(true);
    expect("boese" in resolved).toBe(false);
  });

  it("behandelt unbekannte Flags als aus und Client-Sicht ohne Beschreibungen", () => {
    expect(isFeatureEnabled(defaultFeatureFlags(), "gibtEsNicht")).toBe(false);
    const client = toClientFeatureFlags({ ...defaultFeatureFlags(), chatQuota: false });
    expect(client.chatQuota).toBe(false);
    expect(client.chatExport).toBe(true);
    expect(Object.keys(client).sort()).toEqual(
      FEATURE_FLAG_REGISTRY.map((flag) => flag.key).sort(),
    );
  });

  it("erzeugt eine humanlesbare, tokenfreie Uebersicht", () => {
    const line = describeFeatureFlags({ ...defaultFeatureFlags(), chatExport: false });
    expect(line).toBe(
      "opsOverview=on, chatSessions=on, chatExport=off, chatQuota=on, backupManifest=on",
    );
  });
});
