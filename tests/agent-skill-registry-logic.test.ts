import { describe, it, expect } from "vitest";
import {
  findSkill,
  validateSkillArgs,
  planSkillRun,
  describeSkillCatalog,
  canRegisterSkill,
} from "@/lib/agent-skill-registry-logic";
import type { SkillDefinition } from "@/lib/agent-skill-registry-logic";

const skill = (over: Partial<SkillDefinition> = {}): SkillDefinition => ({
  id: "export-report",
  name: "Bericht exportieren",
  description: "Exportiert Daten als Bericht",
  source: "builtin",
  params: [
    { name: "ziel", type: "string", required: true },
    { name: "format", type: "string", required: false },
  ],
  ...over,
});

describe("Paritaet 1/6 — Skill-Registry", () => {
  it("findet Skills per ID und Name", () => {
    expect(findSkill([skill()], "export-report").ok).toBe(true);
    expect(findSkill([skill()], "Bericht exportieren").ok).toBe(true);
    expect(findSkill([skill()], "gibtsnicht").ok).toBe(false);
  });

  it("validiert Pflicht-Parameter, Typen und unbekannte Parameter beim Namen", () => {
    const check = validateSkillArgs(skill(), { ziel: "x", format: "json" });
    expect(check.ok).toBe(true);
    const missing = validateSkillArgs(skill(), {});
    expect(missing.issues.join()).toContain('"ziel" fehlt');
    const wrongType = validateSkillArgs(skill(), { ziel: 5 });
    expect(wrongType.issues.join()).toContain("falschen Typ");
    const unknown = validateSkillArgs(skill(), { ziel: "x", hacker: true });
    expect(unknown.issues.join()).toContain('"hacker"');
  });

  it("Plant nur lauffaehige Skills — unbekannt/invalid ist KEIN Lauf", () => {
    expect(planSkillRun([skill()], { skillId: "export-report", args: { ziel: "x" } }).run).toBe(true);
    const unknown = planSkillRun([skill()], { skillId: "nope", args: {} });
    expect(unknown.run).toBe(false);
    if (!unknown.run) expect(unknown.reason).toContain("NICHT ausgefuehrt");
    const invalid = planSkillRun([skill()], { skillId: "export-report", args: {} });
    expect(invalid.run).toBe(false);
    if (!invalid.run) expect(invalid.issues).toHaveLength(1);
  });

  it("Katalog und Registry-Regeln ehrlich", () => {
    expect(describeSkillCatalog([])).toContain("Keine Skills");
    expect(describeSkillCatalog([skill()])).toContain("Bericht exportieren (builtin)");
    expect(canRegisterSkill([], skill()).ok).toBe(true);
    expect(canRegisterSkill([skill()], skill()).issue).toContain("bereits vergeben");
    expect(canRegisterSkill([], skill({ id: " " })).issue).toContain("Pflicht");
  });
});
