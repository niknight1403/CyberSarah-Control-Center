import { describe, expect, it } from "vitest";

import {
  AI_INFLUENZA_PAKETE,
  AUFTRAG_FORTSCHRITT,
  darfAngebotWechseln,
  darfAuftragWechseln,
  deckungsbeitragCent,
  findPaket,
  istVersandErlaubt,
} from "../../lib/ai-influenza-logic";

describe("AI Influenza — Pakete", () => {
  it("definiert genau die drei Master-Prompt-Pakete mit korrekten Preisen", () => {
    expect(AI_INFLUENZA_PAKETE).toHaveLength(3);
    expect(AI_INFLUENZA_PAKETE.map((p) => p.id)).toEqual(["starter", "growth", "business"]);
    expect(findPaket("starter")?.preisEur).toBe(299);
    expect(findPaket("growth")?.preisEur).toBe(999);
    expect(findPaket("business")?.preisEur).toBe(2499);
  });

  it("liefert für unbekannte Pakete undefined statt zu raten", () => {
    expect(findPaket("enterprise-x")).toBeUndefined();
  });

  it("jedes Paket hat Leistungen und ist unveränderlich", () => {
    for (const paket of AI_INFLUENZA_PAKETE) {
      expect(paket.leistungen.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(AI_INFLUENZA_PAKETE)).toBe(true);
  });
});

describe("Angebots-Statusmaschine", () => {
  it("erlaubt den Standardpfad entwurf → freigabe_offen → freigegeben → versendet", () => {
    expect(darfAngebotWechseln("entwurf", "freigabe_offen")).toBe(true);
    expect(darfAngebotWechseln("freigabe_offen", "freigegeben")).toBe(true);
    expect(darfAngebotWechseln("freigegeben", "versendet")).toBe(true);
    expect(darfAngebotWechseln("versendet", "angenommen")).toBe(true);
  });

  it("verhindert das Überspringen des Freigabe-Gates", () => {
    expect(darfAngebotWechseln("entwurf", "versendet")).toBe(false);
    expect(darfAngebotWechseln("freigabe_offen", "versendet")).toBe(false);
  });

  it("verbietet Wiederbelebung abgeschlossener Angebote", () => {
    expect(darfAngebotWechseln("angenommen", "versendet")).toBe(false);
    expect(darfAngebotWechseln("abgelehnt", "freigegeben")).toBe(false);
  });

  it("Versand nur mit dokumentierter Freigabe", () => {
    const freigegebenAm = new Date("2026-11-01T20:00:00Z");
    expect(istVersandErlaubt({ status: "freigegeben", freigegebenVon: "admin", freigegebenAm })).toBe(true);
    expect(istVersandErlaubt({ status: "freigegeben", freigegebenVon: "", freigegebenAm })).toBe(false);
    expect(istVersandErlaubt({ status: "freigegeben", freigegebenVon: "admin", freigegebenAm: null })).toBe(false);
    expect(istVersandErlaubt({ status: "entwurf", freigegebenVon: "admin", freigegebenAm })).toBe(false);
  });
});

describe("Auftrags-Statusmaschine", () => {
  it("erlaubt den Lieferpfad und die Rückschleife aus der Qualitätsprüfung", () => {
    expect(darfAuftragWechseln("onboarding", "produktion")).toBe(true);
    expect(darfAuftragWechseln("produktion", "qualitaetspruefung")).toBe(true);
    expect(darfAuftragWechseln("qualitaetspruefung", "produktion")).toBe(true);
    expect(darfAuftragWechseln("kundenfreigabe", "ausgeliefert")).toBe(true);
  });

  it("verhindert Direktlieferung ohne Kundenfreigabe", () => {
    expect(darfAuftragWechseln("onboarding", "ausgeliefert")).toBe(false);
    expect(darfAuftragWechseln("produktion", "ausgeliefert")).toBe(false);
  });

  it("Fortschritt steigt monoton bis 100 bei Lieferung", () => {
    expect(AUFTRAG_FORTSCHRITT.onboarding).toBeLessThan(AUFTRAG_FORTSCHRITT.produktion);
    expect(AUFTRAG_FORTSCHRITT.produktion).toBeLessThan(AUFTRAG_FORTSCHRITT.qualitaetspruefung);
    expect(AUFTRAG_FORTSCHRITT.qualitaetspruefung).toBeLessThan(AUFTRAG_FORTSCHRITT.kundenfreigabe);
    expect(AUFTRAG_FORTSCHRITT.kundenfreigabe).toBeLessThan(AUFTRAG_FORTSCHRITT.ausgeliefert);
    expect(AUFTRAG_FORTSCHRITT.ausgeliefert).toBe(100);
  });
});

describe("Deckungsbeitrag", () => {
  it("rechnet Umsatz minus Kosten in Cent", () => {
    expect(deckungsbeitragCent(29900, 4500)).toBe(25400);
    expect(deckungsbeitragCent(99900, 120000)).toBe(-20100);
  });
});
