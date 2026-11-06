import { describe, expect, it } from "vitest";

import { LEGAL_COMPANY, companyAddressLine, impressumComplete, missingImpressumFields } from "../lib/legal-company";
import { LEGAL_FOOTER_LINKS, missingLegalLinks, REQUIRED_FOOTER_HREFS } from "../lib/legal-footer-logic";
import {
  buildAgb,
  buildDatenschutz,
  buildImpressum,
  buildWiderruf,
  legalDocumentOrNull,
} from "../lib/legal-texts";

const FILLED = {
  ...LEGAL_COMPANY,
  street: "Musterstraße 1",
  postalCode: "25335",
  city: "Elmshorn",
  vatId: "DE123456789",
};

describe("Pflichtangaben", () => {
  it("meldet fehlende Anschrift statt sie zu erfinden", () => {
    const ohneAnschrift = { ...LEGAL_COMPANY, street: "", postalCode: "", city: "" };
    expect(impressumComplete(ohneAnschrift)).toBe(false);
    expect(missingImpressumFields(ohneAnschrift)).toContain("Straße und Hausnummer");
    expect(missingImpressumFields(ohneAnschrift)).toContain("Postleitzahl und Ort");
  });

  it("ist mit der hinterlegten Geschaeftsanschrift vollstaendig", () => {
    expect(impressumComplete()).toBe(true);
    expect(missingImpressumFields()).toEqual([]);
    expect(companyAddressLine()).toContain("Deichstraße 108");
    expect(companyAddressLine()).toContain("52525 Heinsberg");
  });

  it("gilt als vollstaendig, sobald die Angaben eingetragen sind", () => {
    expect(impressumComplete(FILLED)).toBe(true);
    expect(missingImpressumFields(FILLED)).toEqual([]);
    expect(companyAddressLine(FILLED)).toContain("Musterstraße 1");
    expect(companyAddressLine(FILLED)).toContain("25335 Elmshorn");
  });
});

describe("Impressum", () => {
  it("enthaelt alle Pflichtabschnitte", () => {
    const doc = buildImpressum(FILLED);
    const headings = doc.sections.map((section) => section.heading).join(" | ");
    expect(doc.id).toBe("impressum");
    expect(headings).toContain("Diensteanbieter");
    expect(headings).toContain("Kontakt");
    expect(headings).toContain("Umsatzsteuer");
    expect(headings).toContain("Verbraucherstreitbeilegung");
    const text = JSON.stringify(doc);
    expect(text).toContain("Musterstraße 1");
    expect(text).toContain("DE123456789");
    expect(text).toContain(LEGAL_COMPANY.email);
  });

  it("sagt offen, wenn die USt-IdNr. fehlt", () => {
    const doc = buildImpressum(LEGAL_COMPANY);
    expect(JSON.stringify(doc)).toContain("noch nicht hinterlegt");
  });
});

describe("AGB", () => {
  it("regelt Vertragsschluss, Preise, Laufzeit und Haftung", () => {
    const doc = buildAgb(FILLED);
    const headings = doc.sections.map((section) => section.heading).join(" | ");
    expect(headings).toContain("Vertragsschluss");
    expect(headings).toContain("Preise, Laufzeit und Kündigung");
    expect(headings).toContain("Zahlung");
    expect(headings).toContain("Haftung");
    const text = JSON.stringify(doc);
    expect(text).toContain("monatlich");
    expect(text).toContain("Ein bestimmter wirtschaftlicher Erfolg");
    expect(text).toContain("Widerrufsrecht");
  });

  it("verweist auf die gesonderte Widerrufsbelehrung statt sie zu verstecken", () => {
    expect(JSON.stringify(buildAgb(FILLED))).toContain("gesonderten Widerrufsbelehrung");
  });
});

describe("Widerrufsbelehrung", () => {
  it("nennt Frist, Folgen, Erloeschen und das Musterformular", () => {
    const doc = buildWiderruf(FILLED);
    const text = JSON.stringify(doc);
    expect(text).toContain("vierzehn Tagen");
    expect(text).toContain("Folgen des Widerrufs");
    expect(text).toContain("§ 356 Abs. 5 BGB");
    expect(doc.sections.some((section) => section.heading === "Muster-Widerrufsformular")).toBe(true);
    expect(text).toContain("Hiermit widerrufe(n) ich/wir");
  });
});

describe("Datenschutzerklaerung", () => {
  it("benennt Verantwortlichen, Dienstleister und Betroffenenrechte", () => {
    const doc = buildDatenschutz(FILLED);
    const text = JSON.stringify(doc);
    expect(doc.sections[0].heading).toContain("Verantwortlicher");
    expect(text).toContain("Stripe");
    expect(text).toContain("Resend");
    expect(text).toContain("Render");
    expect(text).toContain("Art. 15");
    expect(text).toContain("keine Marketing- oder Analyse-Cookies");
  });

  it("nennt fuer jede Verarbeitung eine Rechtsgrundlage", () => {
    const doc = buildDatenschutz(FILLED);
    const joined = doc.sections.map((section) => (section.paragraphs ?? []).join(" ")).join(" ");
    expect(joined).toContain("Art. 6 Abs. 1 lit. b DSGVO");
    expect(joined).toContain("Art. 6 Abs. 1 lit. f DSGVO");
  });
});

describe("Footer-Verknuepfung", () => {
  it("verlinkt alle vier Rechtstexte", () => {
    const hrefs = LEGAL_FOOTER_LINKS.map((entry) => entry.href);
    expect(missingLegalLinks(hrefs)).toEqual([]);
    expect(hrefs).toHaveLength(4);
  });

  it("erkennt eine unvollstaendige Verlinkung", () => {
    expect(missingLegalLinks(["/impressum", "/agb"])).toEqual(["/widerruf", "/datenschutz"]);
    expect(REQUIRED_FOOTER_HREFS).toContain("/datenschutz");
  });

  it("liefert jede Route als Dokument aus", () => {
    for (const href of REQUIRED_FOOTER_HREFS) {
      const doc = legalDocumentOrNull(href.replace("/", ""));
      expect(doc?.title.length).toBeGreaterThan(3);
      expect(doc?.sections.length).toBeGreaterThan(2);
    }
    expect(legalDocumentOrNull("unbekannt")).toBeNull();
  });
});
