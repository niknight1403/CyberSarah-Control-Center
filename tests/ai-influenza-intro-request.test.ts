import { describe, it, expect } from "vitest";

import {
  AI_INFLUENZA_INTRO_SOURCE_URL,
  aiInfluenzaIntroLeadNodeKey,
  deriveIntroRequestSignals,
  emailDomainOf,
  introRequestConfirmationText,
  introRequestDedupeKey,
  introRequestEstimatedValueCents,
  normalizeIntroDomain,
  parseAiInfluenzaIntroRequest,
  shortHash,
  summarizeIntroRequests,
} from "../lib/ai-influenza-intro-request-logic";

const validRequest = {
  name: "Mara Beispiel",
  email: "Mara@Beispiel-GmbH.de",
  company: "Beispiel GmbH",
  domain: "beispiel-gmbh.de",
  packageId: "growth",
  goal: "Wir brauchen Content fuer Social und Videos, alles läuft noch manuell.",
  preferredWindow: "naechste-woche",
  consent: true,
  website: "",
};

describe("AI Influenza Erstgespraech-Anfrage", () => {
  it("nimmt eine vollstaendige Anfrage an und normalisiert die Eingabe", () => {
    const result = parseAiInfluenzaIntroRequest(validRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("mara@beispiel-gmbh.de");
    expect(result.value.emailDomain).toBe("beispiel-gmbh.de");
    expect(result.value.contactBasis).toBe("customer-requested");
    expect(result.value.consentGiven).toBe(true);
    expect(result.value.source).toBe(AI_INFLUENZA_INTRO_SOURCE_URL);
    expect(result.leadNodeKey).toBe("ai-influenza-lead:beispiel-gmbh.de");
  });

  it("verlangt eine ausdrueckliche Einwilligung", () => {
    const result = parseAiInfluenzaIntroRequest({ ...validRequest, consent: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.spam).toBe(false);
    expect(result.errors.join(" ")).toContain("Einwilligung");
  });

  it("verwirft Bots ueber den Honeypot, ohne Details zu verraten", () => {
    const result = parseAiInfluenzaIntroRequest({ ...validRequest, website: "https://spam.example" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.spam).toBe(true);
    expect(result.errors).toEqual(["Anfrage wurde verworfen."]);
  });

  it("weist ungueltige E-Mail-Adressen und zu lange Texte ab", () => {
    const badEmail = parseAiInfluenzaIntroRequest({ ...validRequest, email: "keine-mail" });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.errors.join(" ")).toContain("E-Mail");

    const longGoal = parseAiInfluenzaIntroRequest({ ...validRequest, goal: "x".repeat(1201) });
    expect(longGoal.ok).toBe(false);
    if (!longGoal.ok) expect(longGoal.errors.join(" ")).toContain("Ziel");
  });

  it("speichert eine eingefuegte URL als reinen Host", () => {
    const withPath = parseAiInfluenzaIntroRequest({ ...validRequest, domain: "beispiel.de/unterseite" });
    expect(withPath.ok).toBe(true);
    if (withPath.ok) expect(withPath.value.domain).toBe("beispiel.de");

    const nonsense = parseAiInfluenzaIntroRequest({ ...validRequest, domain: "keine domain" });
    expect(nonsense.ok).toBe(false);

    const withProtocol = parseAiInfluenzaIntroRequest({ ...validRequest, domain: "https://www.beispiel.de" });
    expect(withProtocol.ok).toBe(true);
    if (withProtocol.ok) expect(withProtocol.value.domain).toBe("beispiel.de");
  });

  it("setzt ohne Firmenangabe einen ehrlichen Platzhalter statt eines leeren Knotens", () => {
    const result = parseAiInfluenzaIntroRequest({ ...validRequest, company: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.company).toBe("Anfrage von Mara Beispiel");
  });

  it("leitet die Domain ersatzweise aus der E-Mail-Adresse ab", () => {
    const result = parseAiInfluenzaIntroRequest({ ...validRequest, domain: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.domain).toBe("beispiel-gmbh.de");
  });

  it("trennt Freemail-Anfragen, damit sie nicht zu einem Firmenknoten verschmelzen", () => {
    const first = parseAiInfluenzaIntroRequest({ ...validRequest, email: "eins@web.de", domain: "" });
    const second = parseAiInfluenzaIntroRequest({ ...validRequest, email: "zwei@web.de", domain: "" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.leadNodeKey.startsWith("ai-influenza-intro:")).toBe(true);
    expect(first.leadNodeKey).not.toBe(second.leadNodeKey);
  });

  it("bewertet Selbstauskuenfte nachvollziehbar und ohne Versandfreigabe", () => {
    const result = parseAiInfluenzaIntroRequest(validRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scoring.score).toBeGreaterThanOrEqual(55);
    expect(result.signals.engagement).toBe(95);
    expect(result.policy.mayPrepare).toBe(true);
    expect(result.policy.maySend).toBe(false);
    expect(result.metadata.externalSendApproved).toBe(false);
    expect(result.metadata.businessUnit).toBe("ai-influenza-team");
    expect(result.metadata.contactBasis).toBe("customer-requested");
  });

  it("gewichtet Paketwahl und Schluesselwoerter unterschiedlich", () => {
    const starter = deriveIntroRequestSignals({ packageId: "starter", goal: "", domain: "a.de" });
    const business = deriveIntroRequestSignals({ packageId: "business", goal: "", domain: "a.de" });
    expect(business.budgetSignal).toBeGreaterThan(starter.budgetSignal);

    const plain = deriveIntroRequestSignals({ packageId: "growth", goal: "Wir suchen Unterstuetzung.", domain: "a.de" });
    const keyworded = deriveIntroRequestSignals({
      packageId: "growth",
      goal: "Content, Video, Social, Newsletter und Kampagne laufen manuell",
      domain: "a.de",
    });
    expect(keyworded.contentNeed).toBeGreaterThan(plain.contentNeed);
    expect(keyworded.automationPain).toBeGreaterThanOrEqual(plain.automationPain);
    expect(keyworded.contentNeed).toBeLessThanOrEqual(100);
  });

  it("bildet einen Dedupe-Schluessel je Tag und Adresse", () => {
    const first = introRequestDedupeKey("Mara@Beispiel-GmbH.de", "2026-11-06T10:00:00.000Z");
    const sameDay = introRequestDedupeKey("mara@beispiel-gmbh.de", "2026-11-06T22:00:00.000Z");
    const nextDay = introRequestDedupeKey("mara@beispiel-gmbh.de", "2026-11-07T09:00:00.000Z");
    const otherMail = introRequestDedupeKey("jemand@beispiel-gmbh.de", "2026-11-06T10:00:00.000Z");

    expect(first).toBe(sameDay);
    expect(first).not.toBe(nextDay);
    expect(first).not.toBe(otherMail);
    expect(first).toContain("2026-11-06");
    expect(first.length).toBeLessThanOrEqual(180);
    // Keine Klartext-Adresse im Schluessel.
    expect(first).not.toContain("mara@");
  });

  it("nennt in der Bestaetigung ehrlich Wunschtermin und Versandgrenze", () => {
    const text = introRequestConfirmationText({ preferredWindow: "diese-woche" });
    expect(text).toContain("Diese Woche");
    expect(text).toContain("Anfrage gespeichert");
    expect(text).toContain("keinen automatischen Werbeversand");
  });

  it("summiert Anfragen fuer die Admin-Sicht", () => {
    const summary = summarizeIntroRequests([
      { packageId: "growth", preferredWindow: "naechste-woche", receivedAt: "2026-11-06T09:00:00.000Z", handled: false },
      { packageId: "growth", preferredWindow: "flexibel", receivedAt: "2026-11-06T11:00:00.000Z", handled: true },
      { packageId: "unsure", preferredWindow: "diese-woche", receivedAt: "2026-11-05T09:00:00.000Z", handled: null },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(2);
    expect(summary.handled).toBe(1);
    expect(summary.byPackage.growth).toBe(2);
    expect(summary.byPackage.starter).toBe(0);
    expect(summary.byWindow["naechste-woche"]).toBe(1);
    expect(summary.newest).toBe("2026-11-06T11:00:00.000Z");
  });

  it("bewertet den Paketwert nur bei klarer Paketwahl", () => {
    expect(introRequestEstimatedValueCents("starter")).toBe(29900);
    expect(introRequestEstimatedValueCents("business")).toBe(249900);
    expect(introRequestEstimatedValueCents("unsure")).toBeUndefined();
  });

  it("haelt die kleinen Helfer stabil", () => {
    expect(normalizeIntroDomain("https://www.Firma.de/kontakt")).toBe("firma.de");
    expect(emailDomainOf("Test@Firma.DE")).toBe("firma.de");
    expect(emailDomainOf("ohne-at")).toBe("");
    expect(shortHash("gleich")).toBe(shortHash("gleich"));
    expect(shortHash("gleich")).not.toBe(shortHash("anders"));
  });

  it("verlangt einen Firmen-Knotenschluessel wie die bestehende Pipeline", () => {
    expect(aiInfluenzaIntroLeadNodeKey("firma.de")).toBe("ai-influenza-lead:firma.de");
    expect(() => aiInfluenzaIntroLeadNodeKey("")).toThrow();
  });
});
