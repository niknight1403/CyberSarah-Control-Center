import { describe, expect, it } from "vitest";
import { auditCommerceDraft } from "../lib/commerce-content-quality-logic";
const valid = {
  productCard: "Das Produkt dient dem Lernen und ist kein Heilmittel.",
  reelScript: "Szene 1: Problem. Szene 2: Lösung. Szene 3: Ehrliches Beispiel. Jetzt prüfen.",
  landingCopy: "Headline: Mehr Überblick. FAQ: Wie funktioniert es? Details müssen geprüft werden.",
  hookVariants: ["Du möchtest mehr Überblick?", "Drei Hinweise für deinen Start", "Womit beginnst du heute?"],
  scenePlan: [
      { startSec: 0, endSec: 6, voiceover: "Willkommen bei CyberSarah", onScreenText: "KI fuer alle", visualPrompt: "Introszene mit Smartphone" },
      { startSec: 6, endSec: 13, voiceover: "Produktvorteile transparent erklaeren", onScreenText: "Transparenz", visualPrompt: "Einfache Grafiken fuer Vorteile" },
      { startSec: 13, endSec: 22, voiceover: "Fakten pruefen und mehr erfahren", onScreenText: "Mehr erfahren", visualPrompt: "Abschluss mit Produktkarte" },
    ],
  cta: "Entdecke die Produktdetails",
  disclosure: "Werbung | KI-generierter Entwurf",
};
const input = { priceCents: null, productUrl: null, assetRightsVerified: false };
describe("Commerce Content Quality Gate", () => {
  it("accepts a cautious draft but preserves manual review flags", () => {
    const result = auditCommerceDraft(valid, input);
    expect(result.passed).toBe(true);
    expect(result.reviewRequired).toBe(true);
    expect(result.warnings).toContain("Bild-/Video-/Audio-/Markenrechte vor Render pruefen.");
  });
  it("blocks invented guarantees, health claims and testimonial evidence", () => {
    for(const phrase of ["100% garantiert", "heilt", "wissenschaftlich bewiesen", "tausende zufriedene Kunden"]) {
      const result = auditCommerceDraft({ ...valid, landingCopy: valid.landingCopy + " " + phrase }, input);
      expect(result.passed, phrase).toBe(false);
    }
  });
  it("rejects a fabricated EUR price when price data is missing", () => {
    const result = auditCommerceDraft({ ...valid, productCard: "Jetzt nur 79,00 €!" }, input);
    expect(result.passed).toBe(false);
    expect(result.blockers.some(item => item.includes("Preis"))).toBe(true);
  });
  it("rejects duplicate hooks or only two hooks", () => {
    expect(auditCommerceDraft({ ...valid, hookVariants: ["first", "first", "third"] }, input).passed).toBe(false);
    expect(auditCommerceDraft({ ...valid, hookVariants: ["first", "second"] }, input).passed).toBe(false);
  });
  it("blocks gapped scene timings and invalid reel duration", () => {
    const wrong = { ...valid, scenePlan: valid.scenePlan.map((scene, index) =>
      index === 1 ? { ...scene, startSec: 8 } : scene) };
    const audit = auditCommerceDraft(wrong, input);
    expect(audit.passed).toBe(false);
    expect(audit.blockers.some(v => v.includes("Timing"))).toBe(true);
  });
  it("blocks affiliate product drafts without an identifiable advertising disclosure", () => {
    const result = auditCommerceDraft({
      ...valid, disclosure: "Bitte Details lesen, alles unverbindlich",
    }, { ...input, requiresAffiliateDisclosure: true });
    expect(result.passed).toBe(false);
    expect(result.blockers.some(message => message.includes("Affiliate"))).toBe(true);
    expect(auditCommerceDraft({
      ...valid, disclosure: "Werbung / Affiliate-Link – Provision moeglich",
    }, { ...input, requiresAffiliateDisclosure: true }).passed).toBe(true);
  });
  it("adds explicit link and rights review requirements, not silent execution", () => {
    const result = auditCommerceDraft({ ...valid, reelScript: "Link: https://unknown.example/sale" }, input);
    expect(result.warnings.some(item => item.includes("URL"))).toBe(true);
  });
});
