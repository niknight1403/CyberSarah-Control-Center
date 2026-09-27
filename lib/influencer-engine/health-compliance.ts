export type ComplianceIssue = {
  code: "cure_claim" | "guarantee" | "diagnosis" | "fear" | "missing_disclosure";
  message: string;
};

const RULES: Array<{ code: ComplianceIssue["code"]; pattern: RegExp; message: string }> = [
  { code: "cure_claim", pattern: /\b(heilt|heilung|cures?|therapiert)\b/i, message: "Heilungsbehauptung entfernen oder evidenzbasiert und zulässig neu formulieren." },
  { code: "guarantee", pattern: /\b(garantiert|100\s*%|wirkt immer|sicher wirksam)\b/i, message: "Garantierte Wirkung ist unzulässig bzw. irreführend." },
  { code: "diagnosis", pattern: /\b(du hast|sie haben)\s+(diabetes|krebs|depression|adhs|bluthochdruck)\b/i, message: "Keine Diagnose aus Kurzcontent ableiten." },
  { code: "fear", pattern: /\b(gefährlich wenn du nicht|bevor es zu spät ist|vergiftet dich)\b/i, message: "Angstbasierte Gesundheitsmanipulation vermeiden." },
];

export function reviewHealthCopy(text: string, affiliate = false): { ok: boolean; issues: ComplianceIssue[] } {
  const issues = RULES.filter((rule) => rule.pattern.test(text)).map(({ code, message }) => ({ code, message }));
  if (affiliate && !/\b(werbung|anzeige|affiliate|provision)\b/i.test(text)) {
    issues.push({ code: "missing_disclosure", message: "Affiliate-/Werbekennzeichnung ergänzen." });
  }
  return { ok: issues.length === 0, issues };
}

export function addHealthDisclaimer(text: string): string {
  const cleaned = text.trim();
  return `${cleaned}\n\nHinweis: Allgemeine Information, keine individuelle medizinische Beratung. Bei Beschwerden medizinisches Fachpersonal konsultieren.`;
}
