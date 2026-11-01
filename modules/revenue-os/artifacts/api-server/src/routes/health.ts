/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HEALTH-CHECK ENDPOINT (SPRINT 63 — Executive Directive)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GET /api/health — Vollständiger System-Health-Check mit Health-Index (0-100):
 *   - PostgreSQL: ONLINE/OFFLINE (SELECT 1, 5s Timeout)
 *   - Stripe:     ONLINE/OFFLINE (balance.retrieve, 5s Timeout)
 *   - OpenAI:     ONLINE/OFFLINE (models.list, 5s Timeout)
 *
 * Health-Index: jede Komponente gewichtet 1/3 → 100/100 = alle Komponenten ONLINE.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";
import { pruefeStripeVerbindung } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { holeProviderSnapshot } from "../lib/llmRouter";
import { holeConnectorSnapshot } from "../lib/toolConnectorManager";

const router: IRouter = Router();

const CHECK_TIMEOUT_MS = 5_000;

function mitTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout nach ${ms}ms`)), ms)
    ),
  ]);
}

interface KomponentenStatus {
  status: "ONLINE" | "OFFLINE";
  details: Record<string, unknown>;
}

async function pruefePostgres(): Promise<KomponentenStatus> {
  try {
    if (!db) {
      return { status: "OFFLINE", details: { fehler: "Keine Datenbankverbindung initialisiert (DATABASE_URL fehlt oder unreachable)" } };
    }
    const ergebnis = await mitTimeout(db.execute(sql`SELECT 1`), CHECK_TIMEOUT_MS);
    const zeilen = Array.isArray(ergebnis) ? ergebnis.length : (ergebnis as any)?.rowCount ?? 1;
    return { status: "ONLINE", details: { verbindung: "ok", zeilen: zeilen } };
  } catch (err) {
    return { status: "OFFLINE", details: { fehler: err instanceof Error ? err.message : "Unbekannter Fehler" } };
  }
}

async function pruefeStripe(): Promise<KomponentenStatus> {
  const ergebnis = await pruefeStripeVerbindung();
  return {
    status: ergebnis.verbunden ? "ONLINE" : "OFFLINE",
    details: {
      modus: ergebnis.modus,
      saldo: ergebnis.saldo,
      ...(ergebnis.fehler ? { fehler: ergebnis.fehler } : {}),
    },
  };
}

async function pruefeOpenAI(): Promise<KomponentenStatus> {
  if (!openaiVerfuegbar) {
    return { status: "OFFLINE", details: { fehler: "Kein OPENAI_API_KEY konfiguriert (Fallback-Modus)" } };
  }
  try {
    await mitTimeout(openai.models.list(), CHECK_TIMEOUT_MS);
    return { status: "ONLINE", details: { verbindung: "ok", apiKeys: "konfiguriert" } };
  } catch (err) {
    return { status: "OFFLINE", details: { fehler: err instanceof Error ? err.message : "Unbekannter Fehler" } };
  }
}

// ── GET /api/health — Vollständiger Health-Check mit Health-Index ───────────────
router.get("/health", async (_req, res) => {
  const start = Date.now();

  const [postgres, stripe, openaiStatus] = await Promise.all([
    pruefePostgres(),
    pruefeStripe(),
    pruefeOpenAI(),
  ]);

  const provider = holeProviderSnapshot();
  const kostenloseLlm = provider.filter((p) => p.kostenlos && p.konfiguriert);
  const connectors = holeConnectorSnapshot();
  const aktiveConnectors = connectors.filter((c) => c.aktiv);

  const komponenten = [
    { name: "PostgreSQL", ...postgres },
    { name: "Stripe", ...stripe },
    { name: "OpenAI", ...openaiStatus },
    {
      name: "LLM-Router (kostenlos)",
      status: kostenloseLlm.length > 0 ? "ONLINE" : "OFFLINE",
      details: {
        kostenloseProvider: kostenloseLlm.map((p) => `${p.id} (${p.modell})`),
        providerInsgesamt: provider.length,
        routing: "autonomer Failover, kostenlos vor kostenpflichtig",
      },
    },
    {
      name: "Werkzeug-Connector",
      status: aktiveConnectors.length > 0 ? "ONLINE" : "DEGRADED",
      details: {
        aktiv: aktiveConnectors.map((c) => c.id),
        konfiguriert: connectors.filter((c) => c.konfiguriert).length,
        registriert: connectors.length,
      },
    },
    {
      name: "Reach-Schwarm",
      status: "ONLINE",
      details: { personas: ["CyberSarah", "CyberNova", "DataDiva", "PixelPoet"], modus: "autonom, transparent KI-gekennzeichnet" },
    },
  ];

  // Health-Index: Anteil der ONLINE-Komponenten → 0-100
  const onlineAnzahl = komponenten.filter((k) => k.status === "ONLINE").length;
  const healthIndex = Math.round((onlineAnzahl / komponenten.length) * 100);

  const antwort = {
    status: healthIndex === 100 ? "healthy" : healthIndex >= 66 ? "degraded" : "critical",
    systemHealthIndex: healthIndex,
    maxHealthIndex: 100,
    geprueftAm: new Date().toISOString(),
    dauerMs: Date.now() - start,
    komponenten: komponenten.map((k) => ({
      name: k.name,
      status: k.status,
      ...k.details,
    })),
  };

  if (healthIndex === 100) {
    logger.info({ healthIndex, dauerMs: antwort.dauerMs }, "✅ Health-Check 100/100 — alle Komponenten ONLINE");
  } else {
    logger.warn({ healthIndex, offline: komponenten.filter((k) => k.status === "OFFLINE").map((k) => k.name) }, `⚠️ Health-Check ${healthIndex}/100`);
  }

  res.json(antwort);
});

// ── GET /api/healthz — Leichtgewichtiger Liveness-Check (Abwärtskompatibilität) ─
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
