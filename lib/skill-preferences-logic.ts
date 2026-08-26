export type SkillId = "agent" | "diff" | "quality";
export type SkillPreferences = Record<SkillId, boolean>;

export const SKILL_PREFERENCE_STORAGE_KEY = "cybersarah.skill-preferences.v1";
export const DEFAULT_SKILL_PREFERENCES: SkillPreferences = { agent: true, diff: true, quality: true };

export function normalizeSkillPreferences(value: unknown): SkillPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_SKILL_PREFERENCES };
  const input = value as Partial<Record<SkillId, unknown>>;
  return {
    agent: input.agent !== false,
    diff: input.diff !== false,
    quality: input.quality !== false,
  };
}

export function toggleSkill(preferences: SkillPreferences, skill: SkillId): SkillPreferences {
  return { ...preferences, [skill]: !preferences[skill] };
}

export function enabledSkillCount(preferences: SkillPreferences): number {
  return Object.values(preferences).filter(Boolean).length;
}
