/**
 * Conservative draft review. These flags are not proof of illegality.
 * They stay visible in the existing human approval queue; no auto-publishing.
 */
export function contentEvidenceReview(text: string, disclosure: string | undefined): string[] {
  const flags: string[] = [];
  const source = text.normalize("NFKC");
  if (/(?:\b\d{1,2}\s*%\s*(?:rabatt|sparen|g[uü]nstiger)|\brabatt\s+\d{1,2}\s*%)/i.test(source)) {
    flags.push("Rabattbeleg und gueltige Angebotsbedingungen vor Publikation pruefen");
  }
  if (/(?:nur heute|nur f[uü]r kurze zeit|letzte chance|limited time)/i.test(source)) {
    flags.push("Zeitlich begrenztes Angebot ist nicht ohne Fristnachweis verifiziert");
  }
  if (/(?:\bgarantiert(?:e|er|en|es)?\s+(?:rendite|erfolg|heilung)|\b100\s*%\s+(?:sicher|wirksam)|\bheilt\s+(?:krebs|diabetes))/i.test(source)) {
    flags.push("Unbelegte gesundheits- oder finanzbezogene Erfolgsbehauptung");
  }
  if (/(?:\b\d{1,3}(?:[.,]\d{3})*\s*(?:euro|€)\s*(?:umsatz|verdienst)|\bt[aä]glich\s+\d+\s*€)/i.test(source)) {
    flags.push("Einkommens- und Umsatzangaben benoetigen einen verifizierten Beleg");
  }
  if (/(?:affiliate[-\s]?link|provision|partnerlink)/i.test(source) &&
      !/(?:werbung|anzeige|affiliate|provision)/i.test(disclosure ?? "")) {
    flags.push("Werbe-/Affiliate-Kennzeichnung vor Freigabe pruefen");
  }
  return [...new Set(flags)];
}
