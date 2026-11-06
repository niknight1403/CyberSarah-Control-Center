/**
 * Pflichtangaben des Anbieters an genau einer Stelle.
 *
 * Warum zentral: Impressum, AGB, Widerrufsbelehrung und Rechnungen muessen
 * dieselbe Anschrift nennen. Wer sie an vier Stellen tippt, hat irgendwann drei
 * verschiedene Versionen — und genau darueber streitet man dann.
 *
 * Wichtig: Anschrift und USt-IdNr. sind Angaben des Betreibers. Sie werden hier
 * NICHT erfunden. Solange ein Pflichtfeld leer ist, sagt die Impressum-Seite das
 * offen, statt eine Luecke zu ueberspielen.
 */

export type LegalCompany = {
  /** Vollstaendiger Name oder Firma inkl. Rechtsform. */
  legalName: string;
  /** Vertretungsberechtigte Person. */
  representative: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  /** Telefonnummer ist fuer die schnelle Kontaktaufnahme empfohlen, nicht zwingend. */
  phone: string;
  /** USt-IdNr. nach § 27a UStG; bei Kleinunternehmerregelung leer lassen und Hinweis nutzen. */
  vatId: string;
  /** Optional: Handelsregister. */
  registerCourt: string;
  registerNumber: string;
  /** Hinweis zur Umsatzsteuer, z. B. Kleinunternehmerregelung nach § 19 UStG. */
  vatNote: string;
  /** Verantwortlich fuer journalistisch-redaktionelle Inhalte (§ 18 Abs. 2 MStV). */
  contentResponsible: string;
  /** Produktname, wie er im Funnel erscheint. */
  productName: string;
};

export const LEGAL_COMPANY: LegalCompany = {
  legalName: "Heinz-Nikola Oeben",
  representative: "Heinz-Nikola Oeben",
  // Diese beiden Zeilen sind die einzigen Angaben, die niemand erraten darf.
  street: "Deichstraße 108",
  postalCode: "52525",
  city: "Heinsberg",
  country: "Deutschland",
  email: "niko.oeben@gmail.com",
  phone: "",
  vatId: "",
  registerCourt: "",
  registerNumber: "",
  vatNote: "",
  contentResponsible: "Heinz-Nikola Oeben",
  productName: "CyberSarah · AI Influenza Team",
};

/** Angaben, ohne die das Impressum nicht vollstaendig ist. */
export function missingImpressumFields(company: LegalCompany = LEGAL_COMPANY): string[] {
  const missing: string[] = [];
  if (!company.legalName.trim()) missing.push("Name oder Firma");
  if (!company.street.trim()) missing.push("Straße und Hausnummer");
  if (!company.postalCode.trim() || !company.city.trim()) missing.push("Postleitzahl und Ort");
  if (!company.country.trim()) missing.push("Land");
  if (!company.email.trim()) missing.push("E-Mail-Adresse");
  return missing;
}

/** Solange hier etwas fehlt, ist die Seite nicht abmahnfest — und sagt das auch. */
export function impressumComplete(company: LegalCompany = LEGAL_COMPANY): boolean {
  return missingImpressumFields(company).length === 0;
}

/** Eine Zeile fuer Footer und Rechnungen. */
export function companyAddressLine(company: LegalCompany = LEGAL_COMPANY): string {
  const place = [company.postalCode, company.city].filter(Boolean).join(" ").trim();
  return [company.legalName, company.street, place, company.country].filter(Boolean).join(", ");
}
