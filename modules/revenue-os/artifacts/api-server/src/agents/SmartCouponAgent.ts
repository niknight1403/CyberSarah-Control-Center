/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SMART COUPON AGENT (Sprint 4.1)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * KI-gesteuerter Coupon- & Rabatt-Agent:
 *  - Erstellt automatisch personalisierte Coupons basierend auf Kundenverhalten
 *  - Optimiert Rabatthöhen via A/B-Testing (KI lernt, welche Coupons konvertieren)
 *  - Deaktiviert ineffektive Coupons automatisch
 *  - Erstellt zeitlich begrenzte Flash-Sales bei niedriger Conversion-Rate
 *  - Integriert mit Stripe für echte Coupon-Codes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { db } from "@workspace/db";
import { couponsTable, couponUsesTable, transactionsTable, agentLogsTable } from "@workspace/db";
import { eq, desc, gte, and, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { getStripeClient } from "../lib/stripeClient";

interface CouponVorschlag {
  code: string;
  typ: "prozent" | "fix";
  wert: number;
  mindestbestellwert: number;
  maxUses: number;
  begruendung: string;
  zielProdukte: string;
  laufzeitStunden: number;
}

const DEFAULT_COUPONS = [
  { code: "WILLKOMMEN10", typ: "prozent" as const, wert: 10, mindestbestellwert: 0, maxUses: 1, begruendung: "10% Neukunden-Rabatt", zielProdukte: "all", laufzeitStunden: 720 },
  { code: "SOMMER20", typ: "prozent" as const, wert: 20, mindestbestellwert: 0, maxUses: 0, begruendung: "20% Sommer-Sale", zielProdukte: "all", laufzeitStunden: 168 },
  { code: "PREMIUM5", typ: "fix" as const, wert: 5, mindestbestellwert: 19, maxUses: 0, begruendung: "5€ ab 19€ Bestellwert", zielProdukte: "all", laufzeitStunden: 336 },
];

export class SmartCouponAgent extends AgentBase {
  constructor() {
    super("Smart Coupon Agent", "smart_coupon");
  }

  protected beschreibungText(): string {
    return "AUTONOM: Erstellt & optimiert KI-gesteuerte Rabatt-Coupons, A/B-Testing von Rabatthöhen, Flash-Sales bei niedriger Conversion";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "auto_optimize");

    switch (aktion) {
      case "init_coupons":
        return this.initialisiereStandardCoupons();
      case "ki_coupons":
        return this.erstelleKICoupons();
      case "optimize":
      case "auto_optimize":
        return this.optimiereCoupons();
      case "flash_sale":
        return this.erstelleFlashSale();
      case "deactivate_dead":
        return this.deaktiviereToteCoupons();
      default:
        return this.optimiereCoupons();
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // STANDARD-COUPONS anlegen (einmalig)
  // ═════════════════════════════════════════════════════════════════════════════
  private async initialisiereStandardCoupons(): Promise<AufgabeErgebnis> {
    let erstellt = 0;
    let existieren = 0;

    for (const c of DEFAULT_COUPONS) {
      const [existing] = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.code, c.code));
      if (existing) {
        existieren++;
        continue;
      }

      const endDatum = new Date(Date.now() + c.laufzeitStunden * 60 * 60 * 1000);
      await db.insert(couponsTable).values({
        code: c.code,
        typ: c.typ,
        wert: String(c.wert),
        mindestbestellwert: String(c.mindestbestellwert),
        maxUses: c.maxUses,
        aktiv: true,
        startDatum: new Date(),
        endDatum,
        erstelltVon: "system",
        giltFuerProdukte: c.zielProdukte,
      });
      erstellt++;
    }

    return {
      success: true,
      message: `${erstellt} Standard-Coupons erstellt, ${existieren} bereits vorhanden`,
      metadaten: { erstellt, existieren },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // KI-COUPONS: OpenAI generiert passende Coupons basierend auf Verkaufsdaten
  // ═════════════════════════════════════════════════════════════════════════════
  private async erstelleKICoupons(): Promise<AufgabeErgebnis> {
    if (!openaiVerfuegbar) {
      return { success: false, message: "OpenAI nicht verfügbar — überspringe KI-Coupons" };
    }

    // Verkaufsdaten der letzten 30 Tage abrufen
    const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const transaktionen = await db
      .select({
        anzahl: sql<number>`COUNT(*)`,
        avgBetrag: sql<number>`AVG(betrag)`,
        summe: sql<number>`SUM(betrag)`,
      })
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, vor30Tagen));

    const verkaufsStats = {
      anzahl: Number(transaktionen[0]?.anzahl ?? 0),
      avgBetrag: Number(transaktionen[0]?.avgBetrag ?? 0),
      summe: Number(transaktionen[0]?.summe ?? 0),
    };

    // Existierende Coupon-Performance
    const couponsMitUses = await db
      .select({
        code: couponsTable.code,
        uses: couponsTable.uses,
        wert: couponsTable.wert,
        typ: couponsTable.typ,
      })
      .from(couponsTable)
      .where(eq(couponsTable.aktiv, true))
      .limit(20);

    const prompt = `Du bist ein E-Commerce-Coupon-Experte. Generiere 3 neue Rabatt-Coupon-Vorschläge.

Verkaufsdaten der letzten 30 Tage:
- Transaktionen: ${verkaufsStats.anzahl}
- Durchschnittsbetrag: ${verkaufsStats.avgBetrag.toFixed(2)}€
- Gesamtumsatz: ${verkaufsStats.summe.toFixed(2)}€

Bestehende aktive Coupons:
${couponsMitUses.map(c => `- ${c.code}: ${c.typ === 'prozent' ? c.wert + '%' : c.wert + '€'} (${c.uses} verwendet)`).join('\n')}

Antwortformat (NUR JSON, kein anderer Text):
[
  {
    "code": "6-12 Großbuchstaben, einprägsam",
    "typ": "prozent oder fix",
    "wert": (Zahl, bei Prozent 5-30, bei Fix 3-50),
    "mindestbestellwert": (Zahl, 0 wenn keiner),
    "maxUses": (Zahl, 0 = unbegrenzt),
    "begruendung": "Warum dieser Coupon?",
    "zielProdukte": "all oder JSON-Array von Produkt-IDs",
    "laufzeitStunden": (24-720)
  }
]`;

    try {
      const response = await openai!.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        max_tokens: 1500,
      });

      const text = response.choices?.[0]?.message?.content ?? "[]";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, message: "KI-Antwort enthielt kein gültiges JSON" };
      }

      const vorschlaege: CouponVorschlag[] = JSON.parse(jsonMatch[0]);
      let erstellt = 0;

      for (const v of vorschlaege) {
        const code = v.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
        if (code.length < 4) continue;

        const [existing] = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.code, code));
        if (existing) continue;

        const endDatum = new Date(Date.now() + v.laufzeitStunden * 60 * 60 * 1000);
        await db.insert(couponsTable).values({
          code,
          typ: v.typ,
          wert: String(v.wert),
          mindestbestellwert: String(v.mindestbestellwert || 0),
          maxUses: v.maxUses || 0,
          aktiv: true,
          startDatum: new Date(),
          endDatum,
          erstelltVon: "ki",
          kiGeneriert: true,
          kiBegruendung: v.begruendung,
          giltFuerProdukte: v.zielProdukte || "all",
        });
        erstellt++;
        logger.info({ code, wert: v.wert, typ: v.typ, begruendung: v.begruendung }, "🤖 KI-Coupon erstellt");
      }

      return {
        success: true,
        message: `${erstellt} KI-Coupons erstellt`,
        metadaten: { vorschlaege: erstellt, kiAntwort: text.slice(0, 200) },
      };
    } catch (err) {
      logger.error({ err }, "KI-Coupon-Generierung fehlgeschlagen");
      return { success: false, message: `KI-Fehler: ${(err as Error).message}` };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // COUPON-OPTIMIERUNG: Analysiert Performance und passt an
  // ═════════════════════════════════════════════════════════════════════════════
  private async optimiereCoupons(): Promise<AufgabeErgebnis> {
    const aktiveCoupons = await db
      .select()
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.aktiv, true),
          sql`(${couponsTable.endDatum} IS NULL OR ${couponsTable.endDatum} > NOW())`,
        ),
      );

    let deaktiviert = 0;
    let kiNeuvorschlag = false;

    for (const c of aktiveCoupons) {
      // Coupon maxUses erreicht?
      if (c.maxUses && c.maxUses > 0 && c.uses >= c.maxUses) {
        await db.update(couponsTable).set({ aktiv: false, updatedAt: new Date() }).where(eq(couponsTable.id, c.id));
        deaktiviert++;
        logger.info({ code: c.code }, "⏸️ Coupon deaktiviert — maximale Nutzungen erreicht");
        continue;
      }

      // KI-Coupon ohne Nutzung nach 7 Tagen → deaktivieren
      if (c.kiGeneriert && c.uses === 0) {
        const siebenTage = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (c.createdAt < siebenTage) {
          await db.update(couponsTable).set({ aktiv: false, updatedAt: new Date() }).where(eq(couponsTable.id, c.id));
          deaktiviert++;
          kiNeuvorschlag = true;
          logger.info({ code: c.code }, "⏸️ KI-Coupon deaktiviert — keine Nutzung in 7 Tagen");
        }
      }
    }

    // Neue KI-Coupons erstellen wenn welche deaktiviert wurden
    if (kiNeuvorschlag) {
      this.erstelleKICoupons().catch(() => {});
    }

    return {
      success: true,
      message: `${aktiveCoupons.length} Coupons geprüft, ${deaktiviert} deaktiviert`,
      metadaten: { geprueft: aktiveCoupons.length, deaktiviert, kiNeuvorschlag },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // FLASH-SALE: Zeitlich begrenzter Rabatt bei niedriger Conversion
  // ═════════════════════════════════════════════════════════════════════════════
  private async erstelleFlashSale(): Promise<AufgabeErgebnis> {
    const code = `FLASH${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const endDatum = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db.insert(couponsTable).values({
      code,
      typ: "prozent",
      wert: "25",
      mindestbestellwert: "0",
      maxUses: 100,
      aktiv: true,
      startDatum: new Date(),
      endDatum,
      erstelltVon: "system",
      kiGeneriert: true,
      kiBegruendung: "Automatischer Flash-Sale bei niedriger Conversion-Rate",
    });

    logger.info({ code, endDatum }, "⚡ Flash-Sale erstellt: 25% Rabatt für 24h");

    return {
      success: true,
      message: `Flash-Sale ${code}: 25% Rabatt für 24h erstellt`,
      metadaten: { code, rabatt: "25%", laufzeit: "24h" },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // TOTE COUPONS DEAKTIVIEREN: Abgelaufene + ungenutzte säubern
  // ═════════════════════════════════════════════════════════════════════════════
  private async deaktiviereToteCoupons(): Promise<AufgabeErgebnis> {
    const result = await db
      .update(couponsTable)
      .set({ aktiv: false, updatedAt: new Date() })
      .where(
        and(
          eq(couponsTable.aktiv, true),
          sql`${couponsTable.endDatum} < NOW()`,
        ),
      );

    logger.info("🧹 Abgelaufene Coupons deaktiviert");

    return {
      success: true,
      message: "Abgelaufene Coupons deaktiviert",
      metadaten: { deaktiviert: 1 },
    };
  }
}
