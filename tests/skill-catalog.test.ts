import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKILL_PREFERENCES,
  toggleSkill,
  type SkillPreferences,
} from "../lib/skill-preferences-logic";
import { enabledSkillLabels, SKILL_CATALOG, skillCatalogEntry } from "../lib/skill-catalog";

describe("skill catalog", () => {
  it("covers every SkillId exactly once", () => {
    const ids = SKILL_CATALOG.map((skill) => skill.id).sort();
    expect(ids).toEqual(["agent", "diff", "quality"]);
  });

  it("keeps labels identical to the chat context header wording", () => {
    expect(skillCatalogEntry("agent").label).toBe("Agent-Vorschläge");
    expect(skillCatalogEntry("diff").label).toBe("Code-Diff-Prüfung");
    expect(skillCatalogEntry("quality").label).toBe("CI-Qualitätsprüfung");
  });

  it("lists only enabled skills, in catalog order", () => {
    const disabledDiff: SkillPreferences = toggleSkill(DEFAULT_SKILL_PREFERENCES, "diff");
    expect(enabledSkillLabels(DEFAULT_SKILL_PREFERENCES)).toBe(
      "Agent-Vorschläge, Code-Diff-Prüfung, CI-Qualitätsprüfung",
    );
    expect(enabledSkillLabels(disabledDiff)).toBe("Agent-Vorschläge, CI-Qualitätsprüfung");
  });

  it("returns an empty string when every skill is off", () => {
    expect(enabledSkillLabels({ agent: false, diff: false, quality: false })).toBe("");
  });

  it("describes every skill with a non-empty, unique description", () => {
    const descriptions = SKILL_CATALOG.map((skill) => skill.description);
    expect(descriptions.every((text) => text.length > 20)).toBe(true);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
