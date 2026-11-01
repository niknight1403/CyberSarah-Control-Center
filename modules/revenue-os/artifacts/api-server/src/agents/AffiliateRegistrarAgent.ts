/**
 * Affiliate-Registrierungs-Agent
 * Bereitet für jede entdeckte Affiliate-/Partner-Chance eine fertige
 * "Sofort-Start"-Anmeldung vor: Registrierungs-Link + Schritt-für-Schritt-Anleitung.
 * Meldet sich NICHT selbstständig auf Drittanbieter-Seiten an (kein Browser-Bot) —
 * der Operator bestätigt jede Registrierung mit einem Klick im Dashboard,
 * danach fließt der Link automatisch als Kampagne in die anderen Agenten.
 */
import { db } from "@workspace/db";
import { revenueOpportunitiesTable, agentLogsTable, campaignsTable } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";

interface Anleitungsschritt {
  schritt: number;
  titel: string;
  beschreibung: string;
}

function fallbackAnleitung(titel: string, url: string | null): Anleitungsschritt[] {
  return [
    { schritt: 1, titel: "Anbieter-Seite öffnen", beschreibung: url ? `Öffne ${url} im Browser.` : "Öffne die Programm-Webseite des Anbieters." },
    { schritt: 2, titel: "Kostenloses Partnerkonto anlegen", beschreibung: `Registriere dich mit deinen Business-Daten für "${titel}" — die meisten Programme sind gebührenfrei.` },
    { schritt: 3, titel: "Zahlungsdaten hinterlegen", beschreibung: "Trage deine Bankverbindung/PayPal für Provisionsauszahlungen ein." },
    { schritt: 4, titel: "Affiliate-Link kopieren", beschreibung: "Kopiere deinen persönlichen Tracking-Link aus dem Partner-Dashboard." },
    { schritt: 5, titel: "Link im System bestätigen", beschreibung: "Füge den Link hier ein und bestätige — er fließt danach automatisch in Kampagnen & Content." },
  ];
}

async function generiereAnleitung(titel: string, beschreibung: string | null, url: string | null): Promise<Anleitungsschritt[]> {
  if (!openaiVerfuegbar) return fallbackAnleitung(titel, url);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Du erstellst kurze, konkrete Schritt-für-Schritt-Anleitungen (Deutsch) für die kostenlose Registrierung bei Affiliate-/Partnerprogrammen. Gib NUR JSON zurück.",
        },
        {
          role: "user",
          content: `Programm: "${titel}". Beschreibung: ${beschreibung ?? "—"}. URL: ${url ?? "unbekannt"}.
Antworte als JSON: {"schritte": [{"schritt": 1, "titel": "...", "beschreibung": "..."}]} mit maximal 5 Schritten.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { schritte?: Anleitungsschritt[] };
    if (parsed.schritte && parsed.schritte.length > 0) return parsed.schritte;
  } catch {
    // Fällt auf Template zurück
  }
  return fallbackAnleitung(titel, url);
}

export class AffiliateRegistrarAgent extends AgentBase {
  constructor() {
    super("Affiliate-Registrierungs-Agent", "affiliate_registrar");
  }

  protected beschreibungText(): string {
    return "Bereitet fertige Registrierungs-Links + Anleitungen für Affiliate-Programme vor — Operator bestätigt, Link fließt automatisch ins System";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = (aufgabe.payload as Record<string, string>)?.aktion ?? "registrierungen_vorbereiten";
    switch (aktion) {
      case "bestaetigen":
        return this.bestaetigeRegistrierung(Number((aufgabe.payload as Record<string, unknown>).opportunityId));
      default:
        return this.bereiteRegistrierungenVor();
    }
  }

  private async bereiteRegistrierungenVor(): Promise<AufgabeErgebnis> {
    const offene = await db
      .select()
      .from(revenueOpportunitiesTable)
      .where(
        and(
          eq(revenueOpportunitiesTable.kanal, "affiliate"),
          or(
            isNull(revenueOpportunitiesTable.registrierungsStatus),
            eq(revenueOpportunitiesTable.registrierungsStatus, "offen"),
          ),
        ),
      )
      .limit(8);

    let vorbereitet = 0;
    for (const chance of offene) {
      try {
        const schritte = await generiereAnleitung(chance.titel, chance.beschreibung, chance.affiliateUrl);
        await db
          .update(revenueOpportunitiesTable)
          .set({
            registrierungsStatus: "vorbereitet",
            registrierungsLink: chance.affiliateUrl ?? null,
            registrierungsAnleitung: JSON.stringify(schritte),
            updatedAt: new Date(),
          })
          .where(eq(revenueOpportunitiesTable.id, chance.id));
        vorbereitet++;
      } catch {
        // einzelne Chance überspringen, Rest weiterlaufen lassen
      }
    }

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: this.holeName(),
        aktion: "Registrierungen vorbereitet",
        status: "erfolgreich",
        nachricht: `${vorbereitet} Affiliate-Registrierungen mit Anleitung + Link vorbereitet — wartet auf Bestätigung`,
      });
    }

    return {
      success: true,
      message: `${vorbereitet} Registrierungen vorbereitet — bereit zur Bestätigung im Finance-Team-Tab`,
      metadaten: { vorbereitet },
    };
  }

  /**
   * Wird nach Bestätigung durch den Operator aufgerufen: markiert die Chance
   * als bestätigt/aktiv und erstellt automatisch eine Kampagne, damit der
   * Affiliate-Link ohne weiteres Zutun in Sales-/Content-/Monetization-Agenten fließt.
   */
  private async bestaetigeRegistrierung(opportunityId: number): Promise<AufgabeErgebnis> {
    const [chance] = await db
      .select()
      .from(revenueOpportunitiesTable)
      .where(eq(revenueOpportunitiesTable.id, opportunityId))
      .limit(1);

    if (!chance) {
      return { success: false, message: "Chance nicht gefunden", metadaten: {} };
    }

    await db
      .update(revenueOpportunitiesTable)
      .set({ registrierungsStatus: "bestaetigt", status: "aktiv", updatedAt: new Date() })
      .where(eq(revenueOpportunitiesTable.id, opportunityId));

    const [vorhandeneKampagne] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.name, chance.titel))
      .limit(1);

    if (!vorhandeneKampagne) {
      await db.insert(campaignsTable).values({
        name: chance.titel,
        marke: chance.marke ?? "CyberSarah",
        typ: "affiliate",
        netzwerk: chance.registrierungsLink ?? chance.affiliateUrl ?? "manuell",
        status: "aktiv",
        affiliateLink: chance.registrierungsLink ?? chance.affiliateUrl ?? undefined,
      });
    }

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: this.holeName(),
        aktion: "Registrierung bestätigt",
        status: "erfolgreich",
        nachricht: `"${chance.titel}" bestätigt — Kampagne automatisch angelegt, Link fließt in alle Agenten`,
      });
    }

    return {
      success: true,
      message: `"${chance.titel}" aktiviert — Kampagne autonom erstellt`,
      metadaten: { opportunityId, titel: chance.titel },
    };
  }

  private holeName(): string {
    return "Affiliate-Registrierungs-Agent";
  }
}
