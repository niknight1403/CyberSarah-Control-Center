import { openai, openaiVerfuegbar, handleOpenAIFehler } from "../lib/openaiClient";
import { inkrementiereFallbackZaehler } from "./watchdog";
import { db } from "@workspace/db";
import { agentLogsTable, agentsTable, campaignsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface SalesOptimierung {
  kampagneId?: number;
  kampagneName: string;
  optimierteHeadline: string;
  optimierterCta: string;
  upsellIdee: string;
  preisPositionierung: string;
  einwandBehandlung: Record<string, string>;
  naechsteSchritte: string[];
}

export async function optimiereSales(agentId: number): Promise<SalesOptimierung> {
  const startzeit = Date.now();

  // Top-Kampagne laden (nach Umsatz)
  const kampagnen = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "aktiv"))
    .orderBy(sql`CAST(umsatz AS NUMERIC) DESC`)
    .limit(5);

  const topKampagne = kampagnen[0];
  const kampagneKontext = kampagnen.map(k => ({
    name: k.name,
    marke: k.marke,
    typ: k.typ,
    klicks: k.klicks,
    konversionen: k.konversionen,
    umsatz: k.umsatz,
    provision: k.provision,
    konversionsrate: k.klicks && k.klicks > 0 ? ((k.konversionen ?? 0) / k.klicks * 100).toFixed(2) + "%" : "0%",
  }));

  const prompt = `Du bist der Sales-Optimierungs-Agent des CyberSarah Revenue OS.

Aktive Kampagnen-Performance:
${JSON.stringify(kampagneKontext, null, 2)}

Optimiere die Verkaufsstrategie für die beste Kampagne. Antworte NUR mit validem JSON:
{
  "kampagneName": "Name der fokussierten Kampagne",
  "optimierteHeadline": "Neue, stärkere Headline für Landingpage/Ad (max. 80 Zeichen)",
  "optimierterCta": "Optimierter Call-to-Action Button-Text",
  "upsellIdee": "Konkrete Upsell-Möglichkeit für bestehende Käufer",
  "preisPositionierung": "Empfehlung zur Preispositionierung",
  "einwandBehandlung": {
    "Einwand 1": "Antwort 1",
    "Einwand 2": "Antwort 2",
    "Einwand 3": "Antwort 3"
  },
  "naechsteSchritte": ["Schritt 1", "Schritt 2", "Schritt 3"]
}`;

  if (!openaiVerfuegbar) {
    inkrementiereFallbackZaehler(agentId, "Sales Agent");
    const dauer = Date.now() - startzeit;
    const fallback: SalesOptimierung = {
      kampagneId: topKampagne?.id,
      kampagneName: topKampagne?.name ?? "Hauptkampagne",
      optimierteHeadline: "KI-Power für dein Business — Jetzt starten",
      optimierterCta: "Kostenlos testen →",
      upsellIdee: "Premium-Paket mit 1:1 Coaching",
      preisPositionierung: "Einstiegsangebot mit Geld-zurück-Garantie",
      einwandBehandlung: { "Zu teuer": "Starte mit dem Basispaket ab 19€", "Keine Zeit": "Nur 15 Min/Tag nötig" },
      naechsteSchritte: ["A/B-Test für Headlines starten", "Retargeting einrichten"],
    };
    await db.insert(agentLogsTable).values({ agentId, agentName: "Sales Agent", aktion: "Sales-Optimierung (Fallback)", status: "erfolgreich", nachricht: "Fallback-Optimierung erstellt (kein API-Key)", dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    return fallback;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Du bist ein erfahrener Sales-Copywriter und Conversion-Optimierer für digitale Produkte und Affiliate-Marketing. Antworte ausschließlich mit validem JSON auf Deutsch." },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.4,
      response_format: { type: "json_object" },
    });

    const optimierung: SalesOptimierung = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    if (topKampagne) optimierung.kampagneId = topKampagne.id;

    const dauer = Date.now() - startzeit;
    await db.insert(agentLogsTable).values({ agentId, agentName: "Sales Agent", aktion: "Sales-Optimierung durchgeführt", status: "erfolgreich", nachricht: `Kampagne "${optimierung.kampagneName}" optimiert | Headline: "${optimierung.optimierteHeadline?.substring(0, 60)}"`, metadaten: JSON.stringify(optimierung), dauer });
    await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
    logger.info({ kampagne: optimierung.kampagneName }, "Sales Agent: Optimierung abgeschlossen");
    return optimierung;
  } catch (err) {
    const { istApiKeyFehler } = handleOpenAIFehler(err, "Sales Agent");
    if (istApiKeyFehler) {
      await db.update(agentsTable).set({ letzteAktivitaet: new Date() }).where(eq(agentsTable.id, agentId));
      return { kampagneId: topKampagne?.id, kampagneName: topKampagne?.name ?? "Kampagne", optimierteHeadline: "Mit KI zum Erfolg", optimierterCta: "Jetzt starten", upsellIdee: "Upgrade-Angebot", preisPositionierung: "Wertbasiert", einwandBehandlung: {}, naechsteSchritte: [] };
    }
    throw err;
  }
}
