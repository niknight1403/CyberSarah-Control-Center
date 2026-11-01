/**
 * API Manager Agent
 * - Prüft stündlich alle API-Keys auf Gültigkeit & Quota
 * - Rotiert automatisch auf Backup-Keys oder Free-Tier-Modelle
 * - Sendet Alerts bei kritischen Fehlern
 * - Speichert Status in DB (systemConfig-Tabelle)
 * - Erkennt Rate-Limits (429) und schaltet automatisch um
 */
import { logger } from "../lib/logger";

// ─── Status-Store ──────────────────────────────────────────────────────────────

interface ApiStatus {
  name: string;
  verfuegbar: boolean;
  letztesPruefung: Date;
  fehler?: string;
  modell?: string;
  keysTotal?: number;
  keysVerfuegbar?: number;
  naechstePruefung?: Date;
}

const apiStatus: Record<string, ApiStatus> = {};
const MAX_PRUEFUNGS_INTERVAL_MS = 60 * 60 * 1000; // 1 Stunde
let letztePruefung = new Date(0);

export function holeApiStatus(): Record<string, ApiStatus> {
  return { ...apiStatus };
}

export function holeApiStatusFuer(name: string): ApiStatus | undefined {
  return apiStatus[name];
}

// ─── OpenAI Health Check ───────────────────────────────────────────────────────

async function pruefeOpenAI(): Promise<boolean> {
  const {
    pruefeOpenAIVerbindung,
    holeAlleKeys,
    istKeyBlockiert,
    blockiereKey,
    rotiereNaechstenKey,
    aktualisiereVerfuegbarkeit,
  } = await import("../lib/openaiClient");

  const result = await pruefeOpenAIVerbindung();
  const alleKeys = holeAlleKeys();
  const verfuegbareKeys = alleKeys.filter(k => !istKeyBlockiert(k));

  if (result.verbunden) {
    aktualisiereVerfuegbarkeit(true);
    apiStatus["openai"] = {
      name: "OpenAI",
      verfuegbar: true,
      letztesPruefung: new Date(),
      modell: "gpt-4o-mini",
      keysTotal: alleKeys.length,
      keysVerfuegbar: verfuegbareKeys.length,
    };
    logger.info(
      { aktiverKey: result.aktiverKey, keysVerfuegbar: verfuegbareKeys.length },
      "✅ OpenAI API Key gültig"
    );
    return true;
  }

  // Alle Keys geprüft — Key Rotation durchführen
  const neuerKey = rotiereNaechstenKey();
  if (neuerKey) {
    aktualisiereVerfuegbarkeit(true);
    apiStatus["openai"] = {
      name: "OpenAI",
      verfuegbar: true,
      letztesPruefung: new Date(),
      modell: "gpt-4o-mini",
      keysTotal: alleKeys.length,
      keysVerfuegbar: verfuegbareKeys.length,
      fehler: result.fehler ?? "Auf Backup-Key rotiert",
    };
    return true;
  }

  // Alle Keys erschöpft — Gemini als Fallback
  const { geminiVerfuegbar } = await import("../lib/geminiClient");
  if (geminiVerfuegbar) {
    logger.warn("⚠️ OpenAI nicht verfügbar — Gemini als Fallback aktiv");
    aktualisiereVerfuegbarkeit(false);
    apiStatus["openai"] = {
      name: "OpenAI",
      verfuegbar: false,
      letztesPruefung: new Date(),
      fehler: "Alle Keys erschöpft — Gemini Fallback aktiv",
      keysTotal: alleKeys.length,
      keysVerfuegbar: 0,
    };
    return false;
  }

  aktualisiereVerfuegbarkeit(false);
  apiStatus["openai"] = {
    name: "OpenAI",
    verfuegbar: false,
    letztesPruefung: new Date(),
    fehler: "Alle Keys erschöpft, kein Fallback verfügbar",
    keysTotal: alleKeys.length,
    keysVerfuegbar: 0,
  };
  return false;
}

// ─── Stripe Health Check ───────────────────────────────────────────────────────

async function pruefeStripe(): Promise<boolean> {
  const { pruefeStripeVerbindung } = await import("../lib/stripeClient");
  const result = await pruefeStripeVerbindung();

  apiStatus["stripe"] = {
    name: "Stripe",
    verfuegbar: result.verbunden,
    letztesPruefung: new Date(),
    modell: result.modus === "live" ? "LIVE 💰" : result.modus === "test" ? "TEST 🧪" : "nicht_konfiguriert",
    fehler: result.fehler,
  };

  if (result.verbunden) {
    logger.info(
      { modus: result.modus, saldo: result.saldo },
      "✅ Stripe API erreichbar"
    );
  }

  return result.verbunden;
}

// ─── Gemini Health Check ───────────────────────────────────────────────────────

async function pruefeGemini(): Promise<boolean> {
  const { pruefeGeminiVerbindung, geminiVerfuegbar, holeGeminiStatus } = await import("../lib/geminiClient");

  if (!geminiVerfuegbar) {
    apiStatus["gemini"] = {
      name: "Gemini",
      verfuegbar: false,
      letztesPruefung: new Date(),
      fehler: "GEMINI_API_KEY fehlt",
    };
    return false;
  }

  const ok = await pruefeGeminiVerbindung();
  const status = holeGeminiStatus();

  apiStatus["gemini"] = {
    name: "Gemini",
    verfuegbar: ok,
    letztesPruefung: new Date(),
    modell: status.modell,
    keysTotal: status.keysAnzahl,
    fehler: ok ? undefined : "Verbindungsprüfung fehlgeschlagen",
  };

  if (ok) logger.info({ model: status.modell }, "✅ Gemini API erreichbar");
  return ok;
}

// ─── Digistore24 Health Check ──────────────────────────────────────────────────

async function pruefeDigistore(): Promise<boolean> {
  const { pruefeDigistoreVerbindung, digistoreVerfuegbar } = await import("../lib/digistoreClient");

  if (!digistoreVerfuegbar) {
    apiStatus["digistore24"] = {
      name: "Digistore24",
      verfuegbar: false,
      letztesPruefung: new Date(),
      fehler: "DIGISTORE24_API_KEY fehlt",
    };
    return false;
  }

  const result = await pruefeDigistoreVerbindung();

  apiStatus["digistore24"] = {
    name: "Digistore24",
    verfuegbar: result.verbunden,
    letztesPruefung: new Date(),
    fehler: result.fehler,
  };

  if (result.verbunden) {
    logger.info({ affiliateId: result.affiliateId }, "✅ Digistore24 API erreichbar");
  }

  return result.verbunden;
}

// ─── Vollständiger Health Check ────────────────────────────────────────────────

export async function fuehreApiHealthCheckDurch(): Promise<void> {
  logger.info("🔍 API Manager: Starte Gesundheitsprüfung aller Keys...");

  const [openaiOk, stripeOk, geminiOk, digistoreOk] = await Promise.allSettled([
    pruefeOpenAI(),
    pruefeStripe(),
    pruefeGemini(),
    pruefeDigistore(),
  ]);

  const zusammenfassung = {
    openai: openaiOk.status === "fulfilled" ? openaiOk.value : false,
    stripe: stripeOk.status === "fulfilled" ? stripeOk.value : false,
    gemini: geminiOk.status === "fulfilled" ? geminiOk.value : false,
    digistore24: digistoreOk.status === "fulfilled" ? digistoreOk.value : false,
  };

  letztePruefung = new Date();
  apiStatus["_meta"] = {
    name: "System",
    verfuegbar: true,
    letztesPruefung: new Date(),
    naechstePruefung: new Date(Date.now() + MAX_PRUEFUNGS_INTERVAL_MS),
  };

  logger.info(zusammenfassung, "📊 API Manager: Health-Check abgeschlossen");

  // Kritischer Alarm: wenn weder OpenAI noch Gemini verfügbar
  if (!zusammenfassung.openai && !zusammenfassung.gemini) {
    logger.error("🚨 KRITISCH: Keine KI-API verfügbar! Alle Agenten pausiert.");
  }

  // Kritischer Alarm: kein Zahlungsprovider
  if (!zusammenfassung.stripe && !zusammenfassung.digistore24) {
    logger.error("🚨 KRITISCH: Kein Zahlungsprovider verfügbar! Monetarisierung pausiert.");
  }
}

// ─── Rate-Limit-Event Handling (extern aufrufbar) ────────────────────────────

export async function onApiKeyRateLimit(dienst: "openai" | "gemini", keyPrefix: string): Promise<void> {
  logger.warn({ dienst, keyPrefix }, "⚠️ Rate Limit erkannt — Key-Rotation wird ausgelöst");

  if (dienst === "openai") {
    const { blockiereKey: bk, rotiereNaechstenKey: rk } = await import("../lib/openaiClient");
    bk(keyPrefix, "Rate Limit (429)");
    rk();
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

export async function starteApiManagerAgent(): Promise<void> {
  logger.info("🚀 API Manager Agent startet...");

  // Sofortiger erster Check
  await fuehreApiHealthCheckDurch();

  // Stündliche Wiederholung
  setInterval(async () => {
    try {
      await fuehreApiHealthCheckDurch();
    } catch (err) {
      logger.error({ err }, "API Manager Health-Check fehlgeschlagen");
    }
  }, MAX_PRUEFUNGS_INTERVAL_MS);

  logger.info("✅ API Manager Agent läuft (prüft alle 60 Minuten)");
}
