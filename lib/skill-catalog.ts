/**
 * Skill-Katalog (rein, testbar) — Sprint 196.
 *
 * Einzelquelle fuer die Skill-Metadaten: Der Optimizer-Chat (Agent-Tab) und
 * die Einstellungs-Seite /settings/skills rendern dieselben Eintraege, damit
 * Bezeichnungen nie auseinanderdriften. Die Praeferenzen selbst bleiben in
 * lib/skill-preferences-logic.ts (Speicher-Schluessel, Normalisierung).
 */
import { type SkillId, type SkillPreferences } from "@/lib/skill-preferences-logic";

export type SkillCatalogEntry = {
  id: SkillId;
  /** Anzeigename — identisch zur Bezeichnung im Chat-Kontext-Header. */
  label: string;
  /** Erklaerung auf der Einstellungs-Seite (was laeuft, wenn aktiv). */
  description: string;
  /** IconSymbol-Name (SF Symbols, gemappt in components/ui/icon-symbol.tsx). */
  icon: "sparkles" | "chevron.left.forwardslash.chevron.right" | "checkmark.circle.fill";
  /** Glas-Akzentfarbe der Karte auf der Einstellungs-Seite. */
  accent: "cyan" | "purple" | "green";
};

export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  {
    id: "agent",
    label: "Agent-Vorschläge",
    description:
      "Der Superagent unterbreitet bei jedem Auftrag konkrete Umsetzungs- und Optimierungsvorschläge für Repository und Zielauftrag.",
    icon: "sparkles",
    accent: "cyan",
  },
  {
    id: "diff",
    label: "Code-Diff-Prüfung",
    description:
      "Geplante Änderungen werden vor dem Anwenden als Diff geprüft — auffällige Löschungen und Risiko-Dateien werden markiert.",
    icon: "chevron.left.forwardslash.chevron.right",
    accent: "purple",
  },
  {
    id: "quality",
    label: "CI-Qualitätsprüfung",
    description:
      "Nach der Umsetzung werden Typcheck, Tests und Build-Status gelesen und als Qualitätsrückmeldung in den Chat gemeldet.",
    icon: "checkmark.circle.fill",
    accent: "green",
  },
] as const;

/** Aktive Skill-Bezeichnungen als kommagetrennte Liste ("" wenn keiner aktiv). */
export function enabledSkillLabels(preferences: SkillPreferences): string {
  return SKILL_CATALOG.filter((skill) => preferences[skill.id])
    .map((skill) => skill.label)
    .join(", ");
}

/** Katalog-Eintrag per SkillId auflösen (immer vorhanden — Katalog ist vollstaendig). */
export function skillCatalogEntry(id: SkillId): SkillCatalogEntry {
  const entry = SKILL_CATALOG.find((skill) => skill.id === id);
  if (!entry) throw new Error(`Unbekannte SkillId: ${id}`);
  return entry;
}
