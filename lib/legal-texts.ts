/**
 * Rechtstexte des Funnels als Daten, nicht als JSX.
 *
 * Vorteile dieser Form: Die Texte sind testbar (Pflichtabschnitte vorhanden),
 * sie nennen dieselben Anbieter wie der Code (Stripe, Resend, Render, LLM-
 * Provider) und sie lassen sich von einer Anwaeltin pruefen, ohne React zu lesen.
 *
 * Diese Texte sind sorgfaeltig formuliert, aber sie ersetzen keine
 * Rechtsberatung. Wer sie aendert, aendert vertragliche Pflichten.
 */
import { LEGAL_COMPANY, type LegalCompany } from "./legal-company";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  list?: string[];
};

export type LegalDocument = {
  id: "impressum" | "datenschutz" | "agb" | "widerruf";
  title: string;
  updatedAt: string;
  intro?: string;
  sections: LegalSection[];
};

export const LEGAL_UPDATED_AT = "6. November 2026";

function address(company: LegalCompany): string {
  const place = [company.postalCode, company.city].filter(Boolean).join(" ").trim();
  return [company.street, place, company.country].filter(Boolean).join(", ");
}

export function buildImpressum(company: LegalCompany = LEGAL_COMPANY): LegalDocument {
  return {
    id: "impressum",
    title: "Impressum",
    updatedAt: LEGAL_UPDATED_AT,
    intro: "Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG) und § 18 Abs. 2 Medienstaatsvertrag (MStV).",
    sections: [
      {
        heading: "Diensteanbieter",
        paragraphs: [
          company.legalName,
          address(company) || "Anschrift: noch nicht hinterlegt (siehe Hinweis oben)",
          company.country,
        ],
      },
      {
        heading: "Vertretungsberechtigt",
        paragraphs: [company.representative || company.legalName],
      },
      {
        heading: "Kontakt",
        paragraphs: [
          `E-Mail: ${company.email}`,
          ...(company.phone ? [`Telefon: ${company.phone}`] : []),
        ],
      },
      {
        heading: "Umsatzsteuer",
        paragraphs: [
          company.vatId
            ? `Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${company.vatId}`
            : company.vatNote || "Umsatzsteuer-Identifikationsnummer: noch nicht hinterlegt.",
        ],
      },
      ...(company.registerCourt && company.registerNumber
        ? [
            {
              heading: "Handelsregister",
              paragraphs: [`${company.registerCourt}, ${company.registerNumber}`],
            },
          ]
        : []),
      {
        heading: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
        paragraphs: [company.contentResponsible || company.legalName, address(company) || "Anschrift siehe oben"],
      },
      {
        heading: "Verbraucherstreitbeilegung",
        paragraphs: [
          "Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
          "Beschwerden richten Sie bitte an die oben genannte E-Mail-Adresse. Wir antworten in der Regel innerhalb von zwei Werktagen.",
        ],
      },
      {
        heading: "Haftung für Inhalte und Links",
        paragraphs: [
          "Für eigene Inhalte haften wir nach den allgemeinen Gesetzen. Wir sind nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.",
          "Für Inhalte externer Links ist der jeweilige Anbieter verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.",
        ],
      },
    ],
  };
}

export function buildDatenschutz(company: LegalCompany = LEGAL_COMPANY): LegalDocument {
  return {
    id: "datenschutz",
    title: "Datenschutzerklärung",
    updatedAt: LEGAL_UPDATED_AT,
    intro:
      "Diese Erklärung beschreibt, welche personenbezogenen Daten beim Besuch der Verkaufsseite, bei einer Erstgespräch-Anfrage und bei einem Abschluss verarbeitet werden. Sie gilt zusätzlich zur Datenschutzrichtlinie der Anwendung.",
    sections: [
      {
        heading: "1. Verantwortlicher",
        paragraphs: [
          `${company.legalName}, ${address(company) || "Anschrift siehe Impressum"}, E-Mail: ${company.email}`,
        ],
      },
      {
        heading: "2. Hosting und Server-Logfiles",
        paragraphs: [
          "Die Anwendung wird bei Render (Render Services, Inc., USA) betrieben, die Datenbank bei Neon (Neon Inc., USA). Beim Aufruf werden technisch notwendige Verbindungsdaten verarbeitet: gekürzte IP-Adresse, Zeitpunkt, aufgerufene Ressource, Statuscode, User-Agent.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer, stabiler Betrieb). Die Logs werden spätestens nach 30 Tagen gelöscht.",
        ],
      },
      {
        heading: "3. Erstgespräch-Anfrage",
        paragraphs: [
          "Wenn Sie das Formular „Erstgespräch anfragen“ nutzen, verarbeiten wir Name, E-Mail-Adresse, optional Unternehmen, Domain, Paketinteresse, Wunschzeitraum und Ihr Anliegen.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Anbahnung eines Vertrags) und Ihre Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, die Sie mit dem Kontrollkästchen erteilen. Ohne Einwilligung wird die Anfrage nicht gespeichert.",
          "Die Angaben werden zur Kontaktaufnahme und Terminabstimmung verwendet, nicht für Werbung, nicht für Profilbildung und nicht für Weitergabe an Dritte.",
        ],
      },
      {
        heading: "4. Zahlungen",
        paragraphs: [
          "Zahlungen werden über Stripe (Stripe Payments Europe, Ltd., Irland) abgewickelt. Die Zahlungsdaten werden direkt bei Stripe eingegeben und uns nicht übermittelt; wir erhalten Zahlungsstatus, Rechnungsbetrag, Währung und eine Kundenkennung.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO sowie Art. 6 Abs. 1 lit. c DSGVO für steuerliche Aufbewahrungspflichten (§ 147 AO, § 257 HGB).",
        ],
      },
      {
        heading: "5. E-Mail-Versand",
        paragraphs: [
          "Transaktionsmails (Anfragebestätigung, Anmeldelink, Rechnungen) versenden wir über Resend (Resend, Inc., USA). Dabei werden Empfängeradresse, Betreff und Inhalt an den Dienstleister übermittelt.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) beziehungsweise lit. f DSGVO für den sicheren Betrieb.",
        ],
      },
      {
        heading: "6. Künstliche Intelligenz",
        paragraphs: [
          "Für Text-, Sprach- und Bildgenerierung nutzen wir Schnittstellen von Groq, OpenRouter, Google (Gemini) und OpenAI. An diese Anbieter werden nur die für die jeweilige Aufgabe nötigen Eingaben übermittelt.",
          "Wir übermitteln keine Zahlungsdaten und keine Kontaktdaten an diese Anbieter. Bei Anbietern mit Sitz in den USA stützt sich die Übermittlung auf die Standardvertragsklauseln der EU-Kommission.",
        ],
      },
      {
        heading: "7. Cookies und Reichweitenmessung",
        paragraphs: [
          "Wir setzen keine Marketing- oder Analyse-Cookies. Technisch notwendige Cookies werden ausschließlich für die Anmeldung verwendet (Session-Cookie, Laufzeit bis zu einem Jahr).",
          "Es findet kein Tracking durch Dritte, keine Retargeting-Pixel und keine Weitergabe von Nutzungsprofilen statt.",
        ],
      },
      {
        heading: "8. Speicherdauer",
        paragraphs: [
          "Anfragen ohne Vertragsschluss löschen wir 12 Monate nach dem letzten Kontakt. Vertrags- und Rechnungsdaten bewahren wir für die gesetzlichen Fristen auf (in der Regel 10 Jahre).",
        ],
      },
      {
        heading: "9. Ihre Rechte",
        paragraphs: [
          "Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Eine erteilte Einwilligung können Sie jederzeit widerrufen.",
          `Für alle Anfragen genügt eine Nachricht an ${company.email}. Außerdem steht Ihnen die Beschwerde bei einer Datenschutz-Aufsichtsbehörde zu.`,
        ],
      },
      {
        heading: "10. Änderungen",
        paragraphs: [
          "Wir passen diese Erklärung an, wenn sich Verarbeitungen ändern. Es gilt die jeweils veröffentlichte Fassung mit dem oben genannten Datum.",
        ],
      },
    ],
  };
}

export function buildAgb(company: LegalCompany = LEGAL_COMPANY): LegalDocument {
  return {
    id: "agb",
    title: "Allgemeine Geschäftsbedingungen",
    updatedAt: LEGAL_UPDATED_AT,
    intro: `Diese Bedingungen gelten für alle Verträge über das Produkt ${company.productName} zwischen ${company.legalName} (nachfolgend „Anbieter“) und den Kundinnen und Kunden (nachfolgend „Kunde“).`,
    sections: [
      {
        heading: "1. Geltungsbereich",
        paragraphs: [
          "Die Bedingungen gelten für Verträge über digitale Dienstleistungen, die über diese Verkaufsseite oder die zugehörige Anwendung geschlossen werden. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich zustimmt.",
        ],
      },
      {
        heading: "2. Vertragsschluss",
        paragraphs: [
          "Die Darstellung der Pakete auf der Verkaufsseite ist kein bindendes Angebot. Der Vertrag kommt zustande, wenn der Kunde den Checkout abschließt und der Zahlungsdienstleister die Zahlung bestätigt.",
          "Der Anbieter bestätigt den Zugang über die vom Kunden angegebene E-Mail-Adresse und stellt den Zugang zum Konto bereit.",
        ],
      },
      {
        heading: "3. Leistungsumfang",
        paragraphs: [
          "Der konkrete Leistungsumfang ergibt sich aus der Paketbeschreibung im Checkout, insbesondere aus der dort genannten Anzahl an Beiträgen, Bildmotiven und Content-Plänen.",
          "Die Leistung wird als KI-gestützte Erstellung und planmäßige Auslieferung erbracht. Ein bestimmter wirtschaftlicher Erfolg, eine bestimmte Reichweite oder ein bestimmter Umsatz werden nicht geschuldet.",
        ],
        list: [
          "Der Anbieter darf Inhalte vor Veröffentlichung prüfen und freigeben lassen; ohne Freigabe findet keine externe Veröffentlichung statt.",
          "Nicht genutzte Leistungen eines Monats verfallen, soweit gesetzlich zulässig, mit Ende des Abrechnungszeitraums.",
        ],
      },
      {
        heading: "4. Preise, Laufzeit und Kündigung",
        paragraphs: [
          "Es gelten die im Checkout ausgewiesenen Preise pro Monat. Die gesetzliche Umsatzsteuer ist im ausgewiesenen Preis enthalten.",
          "Das Abonnement verlängert sich monatlich und kann zum Ende des jeweiligen Abrechnungszeitraums gekündigt werden. Die Kündigung ist im Kundenportal jederzeit möglich und bedarf keiner Begründung.",
          "Bereits bezahlte Zeiträume werden bei einer Kündigung nicht anteilig erstattet, soweit gesetzlich nicht anders bestimmt.",
        ],
      },
      {
        heading: "5. Zahlung",
        paragraphs: [
          "Die Zahlung erfolgt über Stripe per Kreditkarte, SEPA-Lastschrift oder die dort angebotenen Zahlungsmethoden. Bei Rücklastschriften kann der Anbieter die dadurch entstehenden Kosten geltend machen.",
        ],
      },
      {
        heading: "6. Pflichten des Kunden",
        paragraphs: [
          "Der Kunde stellt vollständige und richtige Angaben bereit, insbesondere eine erreichbare E-Mail-Adresse, und sorgt dafür, dass die gelieferten Vorgaben (Marke, Zielgruppe, Freigaben) nicht die Rechte Dritter verletzen.",
        ],
      },
      {
        heading: "7. Verfügbarkeit",
        paragraphs: [
          "Der Anbieter bemüht sich um eine hohe Verfügbarkeit, schuldet aber keine ununterbrochene Erreichbarkeit. Wartungsarbeiten werden angekündigt, sofern sie den Betrieb spürbar beeinträchtigen.",
          "Für die Erstellung von Sprach- und Bildinhalten nutzt der Anbieter KI-Schnittstellen Dritter. Deren Kontingente können den Durchsatz begrenzen. Der Anbieter informiert den Kunden, wenn eine Lieferung dadurch nicht termingerecht möglich ist, und liefert nach.",
        ],
      },
      {
        heading: "8. Rechte und Nutzungen",
        paragraphs: [
          "Der Kunde erhält für die gelieferten Inhalte das einfache, nicht übertragbare Recht zur Nutzung im eigenen Unternehmen. Eine Weitergabe an Dritte oder ein Weiterverkauf als eigenes Angebot ist nicht gestattet.",
          "Der Anbieter darf anonymisierte Kennzahlen zur Verbesserung des Angebots verwenden.",
        ],
      },
      {
        heading: "9. Haftung",
        paragraphs: [
          "Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz. Bei leichter Fahrlässigkeit haftet der Anbieter nur für die Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.",
          "Die Haftung für entgangenen Gewinn und mittelbare Schäden ist in diesen Fällen ausgeschlossen, soweit gesetzlich zulässig.",
        ],
      },
      {
        heading: "10. Widerruf",
        paragraphs: [
          "Verbraucher haben ein Widerrufsrecht nach der gesonderten Widerrufsbelehrung. Für den vorzeitigen Beginn digitaler Leistungen gilt die dort genannte Regelung.",
        ],
      },
      {
        heading: "11. Schlussbestimmungen",
        paragraphs: [
          "Es gilt deutsches Recht. Vorrangig ist die gesetzlich zwingende Verbraucherschutzvorschriften anzuwenden. Gerichtsstand ist, soweit zulässig, der Sitz des Anbieters.",
          `Änderungen dieser Bedingungen werden mit Wirkung für die Zukunft angekündigt. Fragen richten Sie an ${company.email}.`,
        ],
      },
    ],
  };
}

export function buildWiderruf(company: LegalCompany = LEGAL_COMPANY): LegalDocument {
  return {
    id: "widerruf",
    title: "Widerrufsbelehrung",
    updatedAt: LEGAL_UPDATED_AT,
    intro: "Für Verbraucherinnen und Verbraucher gilt das folgende Widerrufsrecht. Unternehmern steht kein gesetzliches Widerrufsrecht zu.",
    sections: [
      {
        heading: "Widerrufsrecht",
        paragraphs: [
          "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.",
          "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsschlusses. Um Ihr Widerrufsrecht auszuüben, müssen Sie uns mittels einer eindeutigen Erklärung (zum Beispiel per Brief oder E-Mail) über Ihren Entschluss informieren, diesen Vertrag zu widerrufen.",
          `An: ${company.legalName}, ${address(company) || "Anschrift siehe Impressum"}, E-Mail: ${company.email}`,
          "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Frist absenden.",
        ],
      },
      {
        heading: "Folgen des Widerrufs",
        paragraphs: [
          "Wenn Sie diesen Vertrag widerrufen, erstatten wir alle Zahlungen, die wir von Ihnen erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurück, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist.",
          "Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Zahlung eingesetzt haben; dafür werden Ihnen keine Entgelte berechnet.",
          "Haben Sie verlangt, dass die Leistung während der Widerrufsfrist beginnt, müssen Sie einen angemessenen Anteil der bereits erbrachten Leistung zahlen, sofern Sie vor Abgabe Ihrer Erklärung ausdrücklich zugestimmt haben.",
        ],
      },
      {
        heading: "Vorzeitiger Beginn und Erlöschen",
        paragraphs: [
          "Wir beginnen mit der Leistung erst, wenn Sie im Checkout ausdrücklich verlangen, dass wir vor Ablauf der Widerrufsfrist beginnen, und Sie Ihre Kenntnis vom Erlöschen des Widerrufsrechts bestätigt haben.",
          "Bei vollständiger Erbringung der digitalen Dienstleistung erlischt das Widerrufsrecht, wenn Sie dem vorzeitigen Beginn ausdrücklich zugestimmt und Ihre Kenntnis vom Verlust des Widerrufsrechts bestätigt haben (§ 356 Abs. 5 BGB).",
          "Bis zur vollständigen Erbringung bleibt Ihr Widerrufsrecht bestehen; bereits erbrachte Leistungen werden dann anteilig abgerechnet.",
        ],
      },
      {
        heading: "Muster-Widerrufsformular",
        paragraphs: [
          "Wenn Sie den Vertrag widerrufen wollen, können Sie dieses Formular ausfüllen und per E-Mail an uns senden:",
        ],
        list: [
          `An ${company.legalName}, ${address(company) || "Anschrift siehe Impressum"}, E-Mail: ${company.email}:`,
          "Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung:",
          "Bestellt am / erhalten am:",
          "Name des/der Verbraucher(s):",
          "Anschrift des/der Verbraucher(s):",
          "Unterschrift (nur bei Mitteilung auf Papier):",
          "Datum:",
        ],
      },
    ],
  };
}

export type LegalDocumentId = LegalDocument["id"];

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, () => LegalDocument> = {
  impressum: buildImpressum,
  datenschutz: buildDatenschutz,
  agb: buildAgb,
  widerruf: buildWiderruf,
};

export function legalDocumentOrNull(id: string): LegalDocument | null {
  const entry = (LEGAL_DOCUMENTS as Record<string, (() => LegalDocument) | undefined>)[id];
  return entry ? entry() : null;
}

/** Reihenfolge im Footer — Impressum und Widerruf zuerst, weil sie geprüft werden. */
export const LEGAL_FOOTER_LINKS: readonly { id: LegalDocumentId; label: string; href: string }[] = [
  { id: "impressum", label: "Impressum", href: "/impressum" },
  { id: "agb", label: "AGB", href: "/agb" },
  { id: "widerruf", label: "Widerruf", href: "/widerruf" },
  { id: "datenschutz", label: "Datenschutz", href: "/datenschutz" },
];
