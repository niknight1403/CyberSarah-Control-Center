/**
 * Faehigkeitsparitaet 1/6 — Skill-Registry: reine, deterministische Logik
 * fuer ausfuehrbare, wiederverwendbare Agent-Skills (Base44-Pendant:
 * .agents/skills + run_skill).
 *
 * Datenfluss:
 *   Skill-Definitionen (Name, Beschreibung, Parameter-Schema, Quelle)
 *   werden validiert; ein Ausfuehrungsplan entscheidet ehrlich, ob ein
 *   Skill mit den gegebenen Argumenten lauffaehig ist.
 *
 * Ehrlichkeits-Grenze: Ein Skill ohne validierte Definition wird NICHT
 *   ausgefuehrt ("unbekannt"), unbekannte Parameter werden beim Namen
 *   genannt statt still ignoriert, und fehlende Pflicht-Parameter
 *   blockieren den Lauf. Kostet alles nichts: Skills laufen In-Process.
 */

export type SkillParam = {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
};

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  params: SkillParam[];
  /** builtin = mitgeliefert, custom = nutzerdefiniert (In-Process, gratis). */
  source: "builtin" | "custom";
};

export type SkillInvocation = {
  skillId: string;
  args: Record<string, unknown>;
};

export type SkillLookupResult =
  | { ok: true; skill: SkillDefinition }
  | { ok: false; reason: "unbekannter skill" };

export function findSkill(skills: SkillDefinition[], skillId: string): SkillLookupResult {
  const skill = skills.find((s) => s.id === skillId || s.name === skillId);
  return skill ? { ok: true, skill } : { ok: false, reason: "unbekannter skill" };
}

/** Argumente gegen das Parameter-Schema pruefen (Typ + Pflicht). */
export function validateSkillArgs(skill: SkillDefinition, args: Record<string, unknown>): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  for (const param of skill.params) {
    const value = args[param.name];
    if (value === undefined || value === null || (param.type === "string" && String(value).trim() === "")) {
      if (param.required) issues.push(`Pflicht-Parameter "${param.name}" fehlt.`);
      continue;
    }
    const typeOk =
      (param.type === "string" && typeof value === "string") ||
      (param.type === "number" && typeof value === "number") ||
      (param.type === "boolean" && typeof value === "boolean");
    if (!typeOk) issues.push(`Parameter "${param.name}" hat falschen Typ (erwartet ${param.type}).`);
  }
  for (const key of Object.keys(args)) {
    if (!skill.params.some((p) => p.name === key)) {
      issues.push(`Unbekannter Parameter "${key}" — Skill akzeptiert ihn nicht.`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/** Ehrlicher Ausfuehrungsplan: unbekannt oder invalid = KEIN Lauf. */
export function planSkillRun(
  skills: SkillDefinition[],
  invocation: SkillInvocation,
): { run: true; skill: SkillDefinition } | { run: false; reason: string; issues?: string[] } {
  const lookup = findSkill(skills, invocation.skillId);
  if (!lookup.ok) return { run: false, reason: `Skill "${invocation.skillId}" ist unbekannt — NICHT ausgefuehrt.` };
  const check = validateSkillArgs(lookup.skill, invocation.args);
  if (!check.ok) return { run: false, reason: `Skill "${lookup.skill.name}" nicht lauffaehig:`, issues: check.issues };
  return { run: true, skill: lookup.skill };
}

/** Registry-Katalog fuer den Nutzer: nur verstanden wird, was benannt ist. */
export function describeSkillCatalog(skills: SkillDefinition[]): string {
  if (skills.length === 0) return "Keine Skills registriert — Ausfuehrung moeglich sobald Skills definiert sind.";
  return skills
    .map((s) => `- ${s.name} (${s.source}): ${s.description} [${s.params.length} Parameter]`)
    .join("\n");
}

/** Neue Skill-Definition validieren (Custom-Skills duerfen ID nur einmal haben). */
export function canRegisterSkill(existing: SkillDefinition[], candidate: SkillDefinition): {
  ok: boolean;
  issue: string | null;
} {
  if (!candidate.id.trim() || !candidate.name.trim()) {
    return { ok: false, issue: "ID und Name sind Pflicht." };
  }
  if (existing.some((s) => s.id === candidate.id)) {
    return { ok: false, issue: `Skill-ID "${candidate.id}" ist bereits vergeben.` };
  }
  return { ok: true, issue: null };
}
