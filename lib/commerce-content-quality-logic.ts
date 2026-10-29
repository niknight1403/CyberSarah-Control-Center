/**
 * Compliance-aware quality gate for draft-only product content.
 * Signals are conservative heuristics, not a legal/medical certification.
 */
export type DraftQualityResult = {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  reviewRequired: true;
};
type CopyBundle = {
  productCard: string;
  reelScript: string;
  landingCopy: string;
  hookVariants: readonly string[];
  cta: string;
  disclosure: string;
};
const unsafeClaims = [
  /\b(?:100\s*%\s*(?:garantiert|wirksam|sicher)|garantiert(?:e|er|en|es)?\s+(?:heilung|erfolg|rendite))\b/i,
  /\b(?:heilt|heilung\s+garantiert|ohne\s+(?:jedes|jegliches)\s+risiko)\b/i,
  /\b(?:wissenschaftlich\s+bewiesen|klinisch\s+bewiesen)\b/i,
  /\b(?:tausende\s+(?:zufriedene\s+)?kunden|5-sterne-bewertet)\b/i,
];
export function auditCommerceDraft(
  bundle: CopyBundle,
  input: { priceCents: number | null; productUrl: string | null; assetRightsVerified?: boolean },
): DraftQualityResult {
  const texts = [bundle.productCard, bundle.reelScript, bundle.landingCopy, ...bundle.hookVariants, bundle.cta];
  const all = texts.join("\n");
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (texts.some(x => typeof x !== "string" || !x.trim())) {
    blockers.push("Inhaltsbaustein fehlt.");
  }
  if (unsafeClaims.some(regex => regex.test(all))) {
    blockers.push("Ungepruefte Heilungs-, Garantie- oder Social-Proof-Behauptung.");
  }
  if (/https?:\/\/[^\s)]+/i.test(all) && !input.productUrl) {
    warnings.push("KI lieferte URL ohne freigegebenen Produktlink: pruefen.");
  }
  if (input.priceCents === null && /(?:\b\d+[.,]\d{2}\s*€|\b€\s*\d+)/.test(all)) {
    blockers.push("Unbelegter Preis trotz fehlender Preisquelle.");
  }
  if (bundle.hookVariants.length !== 3 || new Set(bundle.hookVariants.map(v => v.trim().toLowerCase())).size !== 3) {
    blockers.push("Drei unterschiedliche Reel-Hooks erforderlich.");
  }
  if (bundle.disclosure.trim().length < 10) blockers.push("Werbekennzeichnung fehlt.");
  if (!input.assetRightsVerified) warnings.push("Bild-/Video-/Audio-/Markenrechte vor Render pruefen.");
  if (!/faq|fragen|häufig/i.test(bundle.landingCopy)) warnings.push("FAQ fuer Landingpage pruefen.");
  return { passed: blockers.length === 0, blockers, warnings, reviewRequired: true };
}
