/**
 * Finance-Optimierungs-Team
 * Koordiniert das gesamte Umsatz-Team (Revenue Analyst, Affiliate-Registrierung,
 * Sales, Monetization) und erstellt eine priorisierte Team-Empfehlung, welche
 * Kampagnen/Chancen als Nächstes bestätigt oder skaliert werden sollten.
 * Ergebnis wird als kompaktes JSON in system_config gespeichert und im
 * "Finance-Team"-Tab angezeigt.
 */
import { db } from "@workspace/db";
import { revenueOpportunitiesTable, campaignsTable, systemConfigTable, agentLogsTable, transactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";

const REPORT_KEY = "finance_team_report";

// Demo/Seed-Transaktionen im System haben IDs im Format "txn_001".."txn_999"
// und stammen nicht vom echten Stripe-Webhook/Sync (der echte Stripe-IDs wie
// "cs_...", "pi_...", "in_..." verwendet). Für eine ehrliche Prognose zählen
// nur echte Transaktionen.
const SEED_TRANSAKTIONS_ID = /^txn_\d+$/;

interface TeamEmpfehlung {
  opportunityId: number;
  titel: string;
  kanal: string;
  marke: string | null;
  geschaetzterMonatsumsatz: number;
  registrierungsStatus: string;
  begruendung: string;
}

interface UmsatzPrognose {
  status: "keine_kampagnen" | "fruehphase" | "wachstum";
  konfidenz: "niedrig" | "mittel" | "hoch";
  echteTransaktionenAnzahl: number;
  echterGesamtUmsatz: number;
  kampagnenAlterTage: number | null;
  geschaetzteTageBisErsteEinnahmeMin: number | null;
  geschaetzteTageBisErsteEinnahmeMax: number | null;
  geschaetztesDatumVon: string | null;
  geschaetztesDatumBis: string | null;
  hinweis: string;
}

interface TeamReport {
  erstelltAm: string;
  aktiveKampagnen: number;
  gesamtUmsatzKampagnen: number;
  wartendeRegistrierungen: number;
  topEmpfehlungen: TeamEmpfehlung[];
  umsatzPrognose: UmsatzPrognose;
}

export class FinanceTeamAgent extends AgentBase {
  constructor() {
    super("Finance-Optimierungs-Team", "finance_team");
  }

  protected beschreibungText(): string {
    return "Koordiniert Revenue-, Affiliate- und Sales-Agenten zu einem Team, priorisiert Chancen und empfiehlt die nächsten Schritte";
  }

  async ausfuehren(_aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    return this.erstelleTeamReport();
  }

  private async erstelleTeamReport(): Promise<AufgabeErgebnis> {
    const [chancen, kampagnen, transaktionen] = await Promise.all([
      db.select().from(revenueOpportunitiesTable).orderBy(desc(revenueOpportunitiesTable.geschaetzterMonatsumsatz)).limit(50),
      db.select().from(campaignsTable),
      db.select().from(transactionsTable),
    ]);

    const aktiveKampagnen = kampagnen.filter(k => k.status === "aktiv");
    const wartend = chancen.filter(c => c.registrierungsStatus === "vorbereitet");

    const topEmpfehlungen: TeamEmpfehlung[] = wartend
      .sort((a, b) => Number(b.geschaetzterMonatsumsatz ?? 0) - Number(a.geschaetzterMonatsumsatz ?? 0))
      .slice(0, 5)
      .map(c => ({
        opportunityId: c.id,
        titel: c.titel,
        kanal: c.kanal,
        marke: c.marke,
        geschaetzterMonatsumsatz: Number(c.geschaetzterMonatsumsatz ?? 0),
        registrierungsStatus: c.registrierungsStatus ?? "offen",
        begruendung: `Geschätzt ${Number(c.geschaetzterMonatsumsatz ?? 0)}€/Monat — Registrierung ist vorbereitet, nur noch Bestätigung nötig`,
      }));

    const umsatzPrognose = this.berechneUmsatzPrognose(kampagnen, aktiveKampagnen, transaktionen);

    const report: TeamReport = {
      erstelltAm: new Date().toISOString(),
      aktiveKampagnen: aktiveKampagnen.length,
      gesamtUmsatzKampagnen: aktiveKampagnen.reduce((s, k) => s + Number(k.umsatz ?? 0), 0),
      wartendeRegistrierungen: wartend.length,
      topEmpfehlungen,
      umsatzPrognose,
    };

    const [vorhanden] = await db.select().from(systemConfigTable).where(eq(systemConfigTable.schluessel, REPORT_KEY)).limit(1);
    if (vorhanden) {
      await db.update(systemConfigTable).set({ wert: JSON.stringify(report), aktiviert: true, updatedAt: new Date() }).where(eq(systemConfigTable.schluessel, REPORT_KEY));
    } else {
      await db.insert(systemConfigTable).values({ schluessel: REPORT_KEY, wert: JSON.stringify(report), aktiviert: true });
    }

    if (this.agentId) {
      await db.insert(agentLogsTable).values({
        agentId: this.agentId,
        agentName: "Finance-Optimierungs-Team",
        aktion: "Team-Analyse",
        status: "erfolgreich",
        nachricht: `${topEmpfehlungen.length} priorisierte Empfehlungen | ${aktiveKampagnen.length} aktive Kampagnen | ${wartend.length} wartende Registrierungen`,
      });
    }

    return {
      success: true,
      message: `Finance-Team-Report aktualisiert: ${topEmpfehlungen.length} Top-Empfehlungen, ${wartend.length} wartende Registrierungen`,
      metadaten: { topEmpfehlungen: topEmpfehlungen.length, aktiveKampagnen: aktiveKampagnen.length },
    };
  }

  /**
   * Schätzt, wann mit echtem Umsatz zu rechnen ist — basierend auf echten
   * Transaktionen (nicht Demo-Seed-Daten) und dem Alter aktiver Kampagnen.
   * Ohne echte Live-Daten ist das nur eine branchenübliche Erfahrungsschätzung
   * (niedrige Konfidenz) — das wird im Hinweistext transparent gemacht.
   */
  private berechneUmsatzPrognose(
    alleKampagnen: (typeof campaignsTable.$inferSelect)[],
    aktiveKampagnen: (typeof campaignsTable.$inferSelect)[],
    transaktionen: (typeof transactionsTable.$inferSelect)[],
  ): UmsatzPrognose {
    const echte = transaktionen.filter(t => !SEED_TRANSAKTIONS_ID.test(t.transaktionsId ?? ""));
    const echterGesamtUmsatz = echte.reduce((s, t) => s + Number(t.betrag ?? 0), 0);

    const aeltesteKampagne = alleKampagnen.reduce<Date | null>((min, k) => {
      const erstellt = k.createdAt ? new Date(k.createdAt) : null;
      if (!erstellt) return min;
      return !min || erstellt < min ? erstellt : min;
    }, null);
    const kampagnenAlterTage = aeltesteKampagne
      ? Math.max(0, Math.floor((Date.now() - aeltesteKampagne.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const heuteISO = (tageAbHeute: number) => new Date(Date.now() + tageAbHeute * 24 * 60 * 60 * 1000).toISOString();

    // Fall 1: Es gibt bereits echten (Nicht-Seed-)Umsatz
    if (echte.length > 0) {
      const zeitpunkte = echte.map(t => new Date(t.createdAt).getTime()).sort((a, b) => a - b);
      const spanneTage = Math.max(1, Math.floor((zeitpunkte[zeitpunkte.length - 1]! - zeitpunkte[0]!) / (1000 * 60 * 60 * 24)));
      const konfidenz: UmsatzPrognose["konfidenz"] = echte.length >= 10 && spanneTage >= 30 ? "hoch" : echte.length >= 3 ? "mittel" : "niedrig";
      return {
        status: "wachstum",
        konfidenz,
        echteTransaktionenAnzahl: echte.length,
        echterGesamtUmsatz,
        kampagnenAlterTage,
        geschaetzteTageBisErsteEinnahmeMin: 0,
        geschaetzteTageBisErsteEinnahmeMax: 0,
        geschaetztesDatumVon: heuteISO(0),
        geschaetztesDatumBis: heuteISO(0),
        hinweis: `${echte.length} echte Transaktion(en) über ${spanneTage} Tage erfasst (Gesamt: ${echterGesamtUmsatz.toFixed(0)}€). Erster echter Umsatz ist bereits erzielt — der Fokus liegt jetzt auf Skalierung, nicht mehr auf dem Erstumsatz.`,
      };
    }

    // Fall 2: Keine aktiven Kampagnen — es gibt noch nichts zu bewerben
    if (aktiveKampagnen.length === 0) {
      return {
        status: "keine_kampagnen",
        konfidenz: "niedrig",
        echteTransaktionenAnzahl: 0,
        echterGesamtUmsatz: 0,
        kampagnenAlterTage,
        geschaetzteTageBisErsteEinnahmeMin: null,
        geschaetzteTageBisErsteEinnahmeMax: null,
        geschaetztesDatumVon: null,
        geschaetztesDatumBis: null,
        hinweis: "Noch keine aktive Kampagne. Bestätige zuerst eine vorbereitete Registrierung im Finance-Team-Tab, damit die Uhr für eine realistische Umsatzprognose zu laufen beginnt.",
      };
    }

    // Fall 3: Aktive Kampagnen, aber noch kein echter Umsatz — Branchenschätzung
    // Erfahrungswert: 2-6 Wochen bei aktiver Promotion mit bestehender Reichweite,
    // bis zu 12 Wochen ohne bestehende Reichweite. Bereits verstrichene Kampagnenzeit
    // wird von der verbleibenden Spanne abgezogen (aber nie unter 3 Tage Minimum).
    const basisMin = 14;
    const basisMax = 84;
    const verstrichen = kampagnenAlterTage ?? 0;
    const geschaetzteTageBisErsteEinnahmeMin = Math.max(3, basisMin - verstrichen);
    const geschaetzteTageBisErsteEinnahmeMax = Math.max(geschaetzteTageBisErsteEinnahmeMin + 7, basisMax - verstrichen);

    return {
      status: "fruehphase",
      konfidenz: "niedrig",
      echteTransaktionenAnzahl: 0,
      echterGesamtUmsatz: 0,
      kampagnenAlterTage,
      geschaetzteTageBisErsteEinnahmeMin,
      geschaetzteTageBisErsteEinnahmeMax,
      geschaetztesDatumVon: heuteISO(geschaetzteTageBisErsteEinnahmeMin),
      geschaetztesDatumBis: heuteISO(geschaetzteTageBisErsteEinnahmeMax),
      hinweis: `Branchenübliche Erfahrungsschätzung, KEINE Live-Prognose — es liegen noch keine echten Zahlungen vor (nur Demo-Daten in der Transaktionshistorie). ${aktiveKampagnen.length} aktive Kampagne(n) seit ${verstrichen} Tag(en). Ohne bestehende Reichweite/Publikum dauert es typischerweise länger als mit einem aktiven Kanal.`,
    };
  }
}

export async function ladeTeamReport(): Promise<TeamReport | null> {
  const [vorhanden] = await db.select().from(systemConfigTable).where(eq(systemConfigTable.schluessel, REPORT_KEY)).limit(1);
  if (!vorhanden?.wert) return null;
  try {
    return JSON.parse(vorhanden.wert) as TeamReport;
  } catch {
    return null;
  }
}
