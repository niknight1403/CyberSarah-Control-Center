import { describe, expect, it } from "vitest";

import {
  RESEND_TEST_DOMAIN,
  domainFromAddress,
  evaluateEmailDomain,
  readinessEmailBlock,
} from "../lib/email-domain-logic";

const verified = (name: string) => ({ name, status: "verified" });

describe("domainFromAddress", () => {
  it("liest die Domain aus einer reinen Adresse", () => {
    expect(domainFromAddress("team@cybersarah-ki.com")).toBe("cybersarah-ki.com");
  });

  it("liest die Domain aus der Anzeigeform mit Namen", () => {
    expect(domainFromAddress("CyberSarah <team@cybersarah-ki.com>")).toBe("cybersarah-ki.com");
  });

  it("gibt null zurueck, wenn keine Domain drin ist", () => {
    expect(domainFromAddress("")).toBeNull();
    expect(domainFromAddress("kaputt")).toBeNull();
    expect(domainFromAddress("ohne@punkt")).toBeNull();
  });
});

describe("evaluateEmailDomain", () => {
  it("meldet fehlende Konfiguration als solche", () => {
    const check = evaluateEmailDomain({ fromAddress: null, domains: [] });
    expect(check.status).toBe("unconfigured");
    expect(check.configured).toBe(false);
    expect(check.hint).toContain("RESEND_FROM_EMAIL");
  });

  it("akzeptiert eine verifizierte Domain", () => {
    const check = evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: [verified("cybersarah-ki.com")] });
    expect(check.status).toBe("ok");
    expect(check.domainVerified).toBe(true);
    expect(check.hint).toBeNull();
  });

  it("erkennt eine unverifizierte Domain und nennt die Folge", () => {
    // Der reale Fall: Domain angegeben, bei Resend aber nicht eingerichtet.
    const check = evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: [] });
    expect(check.status).toBe("unverified");
    expect(check.domainVerified).toBe(false);
    expect(check.hint).toContain("nicht verifiziert");
    expect(check.hint).toContain("403");
  });

  it("wertet eine nur angelegte, nicht verifizierte Domain nicht als ok", () => {
    const check = evaluateEmailDomain({
      fromAddress: "team@cybersarah-ki.com",
      domains: [{ name: "cybersarah-ki.com", status: "pending" }],
    });
    expect(check.status).toBe("unverified");
  });

  it("erlaubt Subdomains der verifizierten Domain", () => {
    const check = evaluateEmailDomain({ fromAddress: "team@mail.cybersarah-ki.com", domains: [verified("cybersarah-ki.com")] });
    expect(check.status).toBe("ok");
  });

  it("verwechselt aehnliche Domains nicht", () => {
    const check = evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: [verified("cybersarah-ki.com.evil.tld")] });
    expect(check.domainVerified).toBe(false);
  });

  it("behauptet nichts, wenn die Domainliste nicht abrufbar ist", () => {
    const check = evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: null });
    expect(check.status).toBe("unknown");
    expect(check.hint).toContain("ungeprueft");
  });

  it("kennzeichnet die Testdomain des Anbieters offen", () => {
    const check = evaluateEmailDomain({ fromAddress: `onboarding@${RESEND_TEST_DOMAIN}`, domains: [] });
    expect(check.status).toBe("ok");
    expect(check.hint).toContain("nur an das eigene Postfach");
  });

  it("gibt bei kaputter Adresse eine klare Meldung", () => {
    const check = evaluateEmailDomain({ fromAddress: "kaputt", domains: [] });
    expect(check.status).toBe("unconfigured");
    expect(check.hint).toContain("keine Domain");
  });
});

describe("readinessEmailBlock", () => {
  it("verraet die vollstaendige Adresse nicht", () => {
    const block = readinessEmailBlock(evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: [] }));
    expect(JSON.stringify(block)).not.toContain("team@");
    expect(block.fromDomain).toBe("cybersarah-ki.com");
    expect(block.ok).toBe(false);
  });

  it("ist still, wenn alles stimmt", () => {
    const block = readinessEmailBlock(
      evaluateEmailDomain({ fromAddress: "team@cybersarah-ki.com", domains: [verified("cybersarah-ki.com")] }),
    );
    expect(block.ok).toBe(true);
    expect(block.hint).toBeNull();
  });
});
