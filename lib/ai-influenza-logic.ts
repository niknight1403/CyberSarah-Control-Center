/**
 * Sprint 2 — AI Influenza: Paketdefinitionen und Statuslogik (pure, testbar).
 * Preise sind Start-Hypothesen gemaess Master-Prompt Phase 7 und werden in
 * Sprint 8 (Profit-Analytics) gegen reale Kosten validiert.
 */

export type PaketId = "starter" | "growth" | "business";

export interface PaketDefinition {
  id: PaketId;
  name: string;
  preisEur: number;
  intervall: "month";
  leistungen: string[];
  reihenfolge: number;
}

export const AI_INFLUENZA_PAKETE: readonly PaketDefinition[] = Object.freeze([
  {
    id: "starter",
    name: "AI Influenza Starter",
    preisEur: 299,
    intervall: "month",
    leistungen: ["12 Beiträge/Monat", "4 KI-Bilder/Monat", "Content-Plan"],
    reihenfolge: 100,
  },
  {
    id: "growth",
    name: "AI Influenza Growth",
    preisEur: 999,
    intervall: "month",
    leistungen: ["12 Kurzvideos/Monat", "20 Beiträge/Monat", "Monatsreport"],
    reihenfolge: 101,
  },
  {
    id: "business",
    name: "AI Influenza Business",
    preisEur: 2499,
    intervall: "month",
    leistungen: ["Individuelles KI-Marketing-Team", "Vereinbarter Leistungsumfang", "Wöchentliches Reporting"],
    reihenfolge: 102,
  },
]);

export function findPaket(id: string): PaketDefinition | undefined {
  return AI_INFLUENZA_PAKETE.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Angebots-Statusmaschine
// ---------------------------------------------------------------------------
export const ANGEBOT_STATUS = [
  "entwurf",
  "freigabe_offen",
  "freigegeben",
  "versendet",
  "angenommen",
  "abgelehnt",
  "abgelaufen",
] as const;
export type AngebotStatus = (typeof ANGEBOT_STATUS)[number];

const ANGEBOT_UEBERGAENGE: Record<AngebotStatus, readonly AngebotStatus[]> = {
  entwurf: ["freigabe_offen"],
  freigabe_offen: ["freigegeben", "entwurf"],
  freigegeben: ["versendet", "abgelehnt"],
  versendet: ["angenommen", "abgelehnt", "abgelaufen"],
  angenommen: [],
  abgelehnt: [],
  abgelaufen: ["freigabe_offen"],
};

/** Externe Aktion (Versand) ist nur aus freigegebenem Zustand erlaubt. */
export function darfAngebotWechseln(von: AngebotStatus, nach: AngebotStatus): boolean {
  return ANGEBOT_UEBERGAENGE[von]?.includes(nach) ?? false;
}

/** Angebot gilt nur mit Freigabe-Nachweis als versendbar (Gate fuer Assisted-Modus). */
export function istVersandErlaubt(angebot: {
  status: AngebotStatus;
  freigegebenVon?: string | null;
  freigegebenAm?: Date | null;
}): boolean {
  return (
    angebot.status === "freigegeben" &&
    Boolean(angebot.freigegebenVon && angebot.freigegebenVon.trim().length > 0) &&
    Boolean(angebot.freigegebenAm)
  );
}

// ---------------------------------------------------------------------------
// Auftrags-Statusmaschine
// ---------------------------------------------------------------------------
export const AUFTRAG_STATUS = [
  "onboarding",
  "produktion",
  "qualitaetspruefung",
  "kundenfreigabe",
  "ausgeliefert",
  "abgebrochen",
] as const;
export type AuftragStatus = (typeof AUFTRAG_STATUS)[number];

const AUFTRAG_UEBERGAENGE: Record<AuftragStatus, readonly AuftragStatus[]> = {
  onboarding: ["produktion", "abgebrochen"],
  produktion: ["qualitaetspruefung", "abgebrochen"],
  qualitaetspruefung: ["kundenfreigabe", "produktion", "abgebrochen"],
  kundenfreigabe: ["ausgeliefert", "produktion", "abgebrochen"],
  ausgeliefert: [],
  abgebrochen: [],
};

export function darfAuftragWechseln(von: AuftragStatus, nach: AuftragStatus): boolean {
  return AUFTRAG_UEBERGAENGE[von]?.includes(nach) ?? false;
}

/** Fortschritt je Status (Basis fuer Dashboard-Anzeige, 0..100). */
export const AUFTRAG_FORTSCHRITT: Record<AuftragStatus, number> = {
  onboarding: 15,
  produktion: 45,
  qualitaetspruefung: 70,
  kundenfreigabe: 85,
  ausgeliefert: 100,
  abgebrochen: 0,
};

/** Deckungsbeitrag in Cent (Umsatz minus Kosten), ehrlich ohne Rundungstricks. */
export function deckungsbeitragCent(umsatzCent: number, kostenCent: number): number {
  return Math.round(umsatzCent) - Math.round(kostenCent);
}
