import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, agentLogsTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";
import { openaiVerfuegbar } from "../lib/openaiClient";
import { stripeTestModus, stripeLiveKey } from "../lib/stripeClient";
import { holeFallbackZaehler, holeSmartPausen } from "../agents/watchdog";
import { holeApiStatus } from "../agents/apiManagerAgent";

const router = Router();

const BEKANNTE_AGENTEN_ANZAHL = 35;

router.get("/system-status", async (req, res) => {
  try {
    const apiKeyStatus = holeApiStatus();
    const smartPausen = holeSmartPausen();

    if (!db) {
      const fallbackInfo = holeFallbackZaehler();
      const gesamtFallbacks = Object.values(fallbackInfo).reduce((s, v) => s + v.count, 0);
      const warnungen: string[] = [];
      if (!openaiVerfuegbar) warnungen.push("OpenAI API-Key nicht verfuegbar");
      if (!stripeLiveKey) warnungen.push("Stripe nicht im LIVE-Modus");
      warnungen.push("Datenbank nicht verbunden - Agenten-Count aus Registry");
      const systemGesundheit = Math.round((openaiVerfuegbar ? 40 : 0) + (stripeLiveKey ? 30 : 10) + 30);
      res.json({
        openaiVerfuegbar,
        openaiModus: openaiVerfuegbar ? "live" : "fallback",
        stripeVerfuegbar: !!process.env.STRIPE_SECRET_KEY,
        stripeTestModus,
        apiKeyStatus,
        geminiAktiv: !!(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GEMINI_KEY"]),
        digistoreAktiv: !!process.env["DIGISTORE24_API_KEY"],
        stripeLiveKey,
        stripeModus: stripeLiveKey ? "live" : stripeTestModus ? "test" : "nicht_konfiguriert",
        agentenGesamt: BEKANNTE_AGENTEN_ANZAHL,
        agentenNachStatus: {} as Record<string, number>,
        erfolgsrate24h: 100,
        gesamtLogs24h: 0,
        gesamtFallbacks,
        agentsImFallbackModus: Object.keys(fallbackInfo).length,
        fallbackDetails: fallbackInfo,
        smartPausen,
        systemGesundheit,
        systemGesund: systemGesundheit >= 60,
        warnungen,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const agenten = await db.select().from(agentsTable);
    const agentenNachStatus = agenten.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const seit24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs24h = await db
      .select({ status: agentLogsTable.status })
      .from(agentLogsTable)
      .where(gte(agentLogsTable.createdAt, seit24h));

    const gesamtLogs = logs24h.length;
    const erfolgreichLogs = logs24h.filter(l => l.status === "erfolgreich").length;
    const erfolgsrate24h = gesamtLogs > 0
      ? Math.round((erfolgreichLogs / gesamtLogs) * 100)
      : 100;

    const fallbackInfo = holeFallbackZaehler();
    const gesamtFallbacks = Object.values(fallbackInfo).reduce((s, v) => s + v.count, 0);
    const agentsImFallbackModus = Object.keys(fallbackInfo).length;

    const systemGesundheit = Math.round(
      (openaiVerfuegbar ? 40 : 0) +
      (stripeLiveKey ? 30 : 10) +
      (erfolgsrate24h * 0.3)
    );

    const warnungen: string[] = [];
    if (!openaiVerfuegbar) warnungen.push("OpenAI API-Key nicht verfuegbar");
    if (!stripeLiveKey) warnungen.push("Stripe nicht im LIVE-Modus");
    if ((agentenNachStatus["fehler"] || 0) > 0) {
      warnungen.push(agentenNachStatus["fehler"] + " Agent(en) im FEHLER-Status");
    }

    res.json({
      openaiVerfuegbar,
      openaiModus: openaiVerfuegbar ? "live" : "fallback",
      stripeVerfuegbar: !!process.env.STRIPE_SECRET_KEY,
      stripeTestModus,
      apiKeyStatus,
      geminiAktiv: !!(process.env["GEMINI_API_KEY"] || process.env["GOOGLE_GEMINI_KEY"]),
      digistoreAktiv: !!process.env["DIGISTORE24_API_KEY"],
      stripeLiveKey,
      stripeModus: stripeLiveKey ? "live" : stripeTestModus ? "test" : "nicht_konfiguriert",
      agentenGesamt: agenten.length,
      agentenNachStatus,
      erfolgsrate24h,
      gesamtLogs24h: gesamtLogs,
      gesamtFallbacks,
      agentsImFallbackModus,
      fallbackDetails: fallbackInfo,
      smartPausen,
      systemGesundheit,
      systemGesund: systemGesundheit >= 60,
      warnungen,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("SYSTEM STATUS FEHLER:", err?.message, err?.code);
    res.status(500).json({ error: "Interner Serverfehler", detail: err?.message?.slice(0, 200) });
  }
});

export default router;
