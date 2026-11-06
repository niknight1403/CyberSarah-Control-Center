/**
 * Ist der Absender-Funnel ueberhaupt zustellbar?
 *
 * Der teure Fall: Die App verschickt Bestaetigungen, Resend lehnt sie ab, und
 * niemand merkt es, weil der Fehler nur im Log steht. Genau das passiert, wenn
 * die Absender-Domain bei Resend nicht verifiziert ist — der Versand antwortet
 * mit 403, die Anfrage selbst bleibt aber gespeichert.
 *
 * Diese Datei beantwortet die Frage ohne Nebenwirkung: Sie liest nur die
 * Domainliste des Mailanbieters und vergleicht sie mit der Absenderadresse.
 * Kein Testversand, keine Mail an Kunden.
 */

export type EmailDomainCheck = {
  /** Ist ueberhaupt eine Absenderadresse konfiguriert? */
  configured: boolean;
  fromAddress: string | null;
  fromDomain: string | null;
  /** Steht die Domain in der Liste des Anbieters als verifiziert? */
  domainVerified: boolean;
  /** Freitext fuer Dashboard und Readiness; leer, wenn alles stimmt. */
  hint: string | null;
  /** Kurzfassung fuer Anzeigen: "ok" | "unverified" | "unconfigured" | "unknown". */
  status: "ok" | "unverified" | "unconfigured" | "unknown";
};

/** Die Resend-Testdomain: dort darf jede Instanz an die eigene Adresse senden. */
export const RESEND_TEST_DOMAIN = "resend.dev";

export function domainFromAddress(address: string | null | undefined): string | null {
  const clean = (address ?? "").trim();
  const match = clean.match(/<([^>]+)>/);
  const bare = (match ? match[1] : clean).trim().toLowerCase();
  const at = bare.lastIndexOf("@");
  if (at < 1) return null;
  const domain = bare.slice(at + 1).replace(/[>;\s]+$/, "");
  return domain.includes(".") ? domain : null;
}

function domainMatches(verifiedDomain: string, fromDomain: string): boolean {
  const verified = verifiedDomain.trim().toLowerCase();
  if (!verified) return false;
  return fromDomain === verified || fromDomain.endsWith(`.${verified}`);
}

export type ProviderDomain = { name: string; status: string };

/**
 * Bewertet die Absenderdomain gegen die Domainliste des Anbieters.
 * `domains === null` heisst: Liste nicht abrufbar — dann wird nichts behauptet.
 */
export function evaluateEmailDomain(input: {
  fromAddress: string | null;
  domains: ProviderDomain[] | null;
}): EmailDomainCheck {
  const fromAddress = (input.fromAddress ?? "").trim() || null;
  const fromDomain = domainFromAddress(fromAddress);

  if (!fromAddress) {
    return {
      configured: false,
      fromAddress: null,
      fromDomain: null,
      domainVerified: false,
      status: "unconfigured",
      hint: "Keine Absenderadresse gesetzt (RESEND_FROM_EMAIL). Bestaetigungen an Interessenten koennen nicht verschickt werden.",
    };
  }
  if (!fromDomain) {
    return {
      configured: true,
      fromAddress,
      fromDomain: null,
      domainVerified: false,
      status: "unconfigured",
      hint: `Die Absenderadresse "${fromAddress}" enthaelt keine Domain und kann nicht zugestellt werden.`,
    };
  }
  if (input.domains === null) {
    return {
      configured: true,
      fromAddress,
      fromDomain,
      domainVerified: false,
      status: "unknown",
      hint: "Die Domainliste des Mailanbieters war nicht abrufbar; die Zustellbarkeit ist ungeprueft.",
    };
  }
  // Die Testdomain des Anbieters gilt immer als nutzbar, aber nur fuer den Betreiber.
  if (fromDomain === RESEND_TEST_DOMAIN || fromDomain.endsWith(`.${RESEND_TEST_DOMAIN}`)) {
    return {
      configured: true,
      fromAddress,
      fromDomain,
      domainVerified: true,
      status: "ok",
      hint: "Es wird die Testadresse des Mailanbieters genutzt: Mails gehen nur an das eigene Postfach, nicht an Kunden.",
    };
  }
  const verified = input.domains.some(
    (entry) => entry.status === "verified" && domainMatches(entry.name, fromDomain),
  );
  if (verified) {
    return {
      configured: true,
      fromAddress,
      fromDomain,
      domainVerified: true,
      status: "ok",
      hint: null,
    };
  }
  return {
    configured: true,
    fromAddress,
    fromDomain,
    domainVerified: false,
    status: "unverified",
    hint: `Die Domain "${fromDomain}" ist beim Mailanbieter nicht verifiziert. Bestaetigungen werden abgelehnt (403); die Anfrage bleibt gespeichert, der Interessent bekommt aber keine Mail.`,
  };
}

/** Readiness-Block: klein, ohne Adressen im Klartext zu veroeffentlichen. */
export function readinessEmailBlock(check: EmailDomainCheck): {
  ok: boolean;
  status: EmailDomainCheck["status"];
  fromDomain: string | null;
  hint: string | null;
} {
  return {
    ok: check.status === "ok",
    status: check.status,
    fromDomain: check.fromDomain,
    hint: check.hint,
  };
}
