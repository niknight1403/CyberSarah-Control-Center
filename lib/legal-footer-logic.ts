/**
 * Footer-Angaben des Funnels als reine Daten.
 *
 * Getrennt von der Darstellung, damit die Vollstaendigkeit testbar ist: jede
 * Funnel-Seite muss Impressum, AGB, Widerruf und Datenschutz verlinken.
 */
export { LEGAL_FOOTER_LINKS } from "./legal-texts";
export type { LegalDocumentId } from "./legal-texts";

export const LEGAL_COPYRIGHT = "© 2026 CyberSarah · AI Influenza Team";

/** Seiten, auf denen die Rechtstexte erreichbar sein muessen. */
export const FUNNEL_PAGES_REQUIRING_FOOTER = [
  "/",
  "/ai-influenza",
  "/ai-influenza-danke",
  "/ai-influenza-team",
  "/account",
  "/login",
] as const;

/** Pflicht-Links, die im Footer vorkommen muessen (Reihenfolge zaehlt nicht). */
export const REQUIRED_FOOTER_HREFS = ["/impressum", "/agb", "/widerruf", "/datenschutz"] as const;

/** Prueft eine Linkliste gegen die Pflichtmenge — fuer Tests und Reviews. */
export function missingLegalLinks(hrefs: readonly string[]): string[] {
  return REQUIRED_FOOTER_HREFS.filter((href) => !hrefs.includes(href));
}
