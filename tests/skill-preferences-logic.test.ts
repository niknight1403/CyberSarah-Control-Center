import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_PREFERENCES,
  enabledSkillCount,
  normalizeSkillPreferences,
  SKILL_PREFERENCE_STORAGE_KEY,
  toggleSkill,
} from "../lib/skill-preferences-logic";

describe("skill preference logic", () => {
  it("uses all skills enabled by default and preserves the storage key", () => {
    expect(DEFAULT_SKILL_PREFERENCES).toEqual({ agent: true, diff: true, quality: true });
    expect(SKILL_PREFERENCE_STORAGE_KEY).toBe("cybersarah.skill-preferences.v1");
    expect(enabledSkillCount(DEFAULT_SKILL_PREFERENCES)).toBe(3);
  });

  it("toggles one skill without changing the others", () => {
    const next = toggleSkill(DEFAULT_SKILL_PREFERENCES, "diff");
    expect(next).toEqual({ agent: true, diff: false, quality: true });
  });

  it("normalizes malformed persisted values safely", () => {
    expect(normalizeSkillPreferences({ agent: false, diff: "yes" })).toEqual({ agent: false, diff: true, quality: true });
    expect(normalizeSkillPreferences(null)).toEqual(DEFAULT_SKILL_PREFERENCES);
  });
});
