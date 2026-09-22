import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

process.on("uncaughtException", (err) => {
  logger.error({ err }, "🚨 Unbehandelter Fehler — Server läuft weiter");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "🚨 Unbehandelte Promise-Ablehnung — Server läuft weiter");
});

// ─── Live-API-Key Validierung beim Systemstart ────────────────────────────────

interface ServiceStatus {
  name: string;
  status: "aktiv" | "test" | "deaktiviert" | "fehler";
  details: string;
}

async function validiereAlleServices(): Promise<ServiceStatus[]> {
  const services: ServiceStatus[] = [];

  // ── Stripe ──
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (stripeKey) {
    try {
      const { pruefeStripeVerbindung } = await import("./lib/stripeClient");
      const result = await pruefeStripeVerbindung();
      services.push({
        name: "Stripe",
        status: result.verbunden
          ? result.modus === "live" ? "aktiv" : "test"
          : "fehler",
        details: result.verbunden
          ? `Verbunden (${result.modus}) — Saldo: ${result.saldo ?? 0} EUR`
          : `Fehler: ${result.fehler ?? "Unbekannt"}`,
      });
    } catch (err) {
      services.push({
        name: "Stripe",
        status: "fehler",
        details: `Initialisierung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`,
      });
    }
  } else {
    services.push({ name: "Stripe", status: "deaktiviert", details: "STRIPE_SECRET_KEY fehlt" });
  }

  // ── OpenAI ──
  const openaiKey = process.env["OPENAI_API_KEY"] ?? process.env["NIKOKEY"];
  if (openaiKey) {
    try {
      const { pruefeOpenAIVerbindung, holeAlleKeys } = await import("./lib/openaiClient");
      const result = await pruefeOpenAIVerbindung();
      const keys = holeAlleKeys();
      services.push({
        name: "OpenAI",
        status: result.verbunden ? "aktiv" : "fehler",
        details: result.verbunden
          ? `Verbunden — Key ${result.keyIndex + 1}/${result.gesamtKeys}`
          : `${keys.length} Key(s) konfiguriert, keiner erreichbar`,
      });
    } catch (err) {
      services.push({
        name: "OpenAI",
        status: "fehler",
        details: `Initialisierung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`,
      });
    }
  } else {
    services.push({ name: "OpenAI", status: "deaktiviert", details: "OPENAI_API_KEY fehlt" });
  }

  // ── Gemini ──
  const geminiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_GEMINI_KEY"];
  if (geminiKey) {
    try {
      const { pruefeGeminiVerbindung, holeGeminiStatus } = await import("./lib/geminiClient");
      const ok = await pruefeGeminiVerbindung();
      const status = holeGeminiStatus();
      services.push({
        name: "Gemini",
        status: ok ? "aktiv" : "fehler",
        details: ok
          ? `Verbunden — Modell: ${status.modell}, Keys: ${status.keysAnzahl}`
          : "Verbindungsprüfung fehlgeschlagen",
      });
    } catch (err) {
      services.push({
        name: "Gemini",
        status: "fehler",
        details: `Initialisierung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`,
      });
    }
  } else {
    services.push({ name: "Gemini", status: "deaktiviert", details: "GEMINI_API_KEY fehlt" });
  }

  // ── Digistore24 ──
  const ds24Key = process.env["DIGISTORE24_API_KEY"];
  if (ds24Key) {
    try {
      const { pruefeDigistoreVerbindung } = await import("./lib/digistoreClient");
      const result = await pruefeDigistoreVerbindung();
      services.push({
        name: "Digistore24",
        status: result.verbunden ? "aktiv" : "fehler",
        details: result.verbunden
          ? `Verbunden — Affiliate-ID: ${result.affiliateId ?? "nicht gesetzt"}`
          : `Fehler: ${result.fehler ?? "Unbekannt"}`,
      });
    } catch (err) {
      services.push({
        name: "Digistore24",
        status: "fehler",
        details: `Initialisierung fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`,
      });
    }
  } else {
    services.push({ name: "Digistore24", status: "deaktiviert", details: "DIGISTORE24_API_KEY fehlt" });
  }

  return services;
}

async function startServer() {
  const hasDb = !!process.env["DATABASE_URL"];

  // ── Service-Validierung beim Start ──────────────────────────────────────────
  logger.info("╔══════════════════════════════════════════════════════╗");
  logger.info("║     🔑 CyberSarah Revenue OS — Start-Validierung   ║");
  logger.info("╚══════════════════════════════════════════════════════╝");

  // Service validation runs in background - don't block server startup
  (async () => {
    try {
      const serviceStatus = await validiereAlleServices();
      for (const s of serviceStatus) {
        const emoji = s.status === "aktiv" ? "✅" : s.status === "test" ? "🧪" : s.status === "deaktiviert" ? "❌" : "⚠️";
        logger.info(emoji + " " + s.name + ": " + s.status + " — " + s.details);
      }
    } catch (e: any) {
      logger.warn("Service-Validierung fehlgeschlagen: " + (e?.message ?? e));
    }
  })();
  logger.info({ hatDb: hasDb, port }, "🚀 CyberSarah Revenue OS — Server bereit");

  // ── API Manager Agent (Key-Rotation & Health Checks) ────────────────────────
  // API Manager Agent runs in background
  (async () => {
    try {
      const { starteApiManagerAgent } = await import("./agents/apiManagerAgent");
      await starteApiManagerAgent();
    } catch (e: any) {
      logger.warn("API Manager Agent Fehler: " + (e?.message ?? e));
    }
  })();

  // ── DB-Schema automatisch synchronisieren (drizzle-kit push) ──────────────
  if (hasDb) {
    try {
      logger.info("🐘 Prüfe DB-Schema...");
      const { execSync } = await import("child_process");
      const path = await import("path");
      const dbDir = path.resolve(import.meta.dirname ?? ".", "../../lib/db");
      execSync("npx drizzle-kit push --config ./drizzle.config.ts", {
        cwd: dbDir,
        env: { ...process.env, DATABASE_URL: process.env["DATABASE_URL"] },
        timeout: 30000,
        stdio: "pipe",
      });
      logger.info("✅ DB-Schema synchronisiert");
    } catch (e: any) {
      logger.warn("DB-Schema-Push übersprungen: " + (e?.stderr?.toString()?.slice(0, 120) ?? e?.message ?? ""));
    }
  }

  // ── Agenten + Orchestrator (nur mit DB) ────────────────────────────────────
  if (hasDb) {
    try {
      const { initialisiereAgenten, starteOrchestrator } = await import("./agents/orchestrator");
      await initialisiereAgenten();
      starteOrchestrator();
      logger.info("✅ Agenten + Orchestrator gestartet");
    } catch (err) {
      logger.warn({ err }, "Agenten-Start übersprungen");
    }
  } else {
    logger.info("⚠️ Keine DB — Agenten nicht gestartet");
  }

  // ── Stripe-Sync (regelmäßiger Abgleich mit Stripe-API) ─────────────────────
  // Stripe Sync runs in background
  if (process.env["STRIPE_SECRET_KEY"]) {
    (async () => {
      try {
        const { syncStripeTransaktionen } = await import("./lib/stripeSync");
        const ergebnis = await syncStripeTransaktionen();
        if (ergebnis.neu > 0) logger.info({ neu: ergebnis.neu }, "Stripe-Sync: Neue Transaktionen importiert");
        setInterval(async () => {
          try {
            const result = await syncStripeTransaktionen();
            if (result.neu > 0) logger.info({ neu: result.neu }, "Stripe-Sync: Neue Transaktionen importiert");
          } catch (e2: any) { logger.warn("Stripe-Sync fehlgeschlagen: " + (e2?.message ?? e2)); }
        }, 15 * 60 * 1000);
      } catch (e: any) {
        logger.warn("Stripe-Sync konnte nicht gestartet werden: " + (e?.message ?? e));
      }
    })();
  }

  // ── Sprint 65: Administrator-Konto autonom sicherstellen ─────────────────
  try {
    const { stelleAdminBereit } = await import("./lib/adminAccount");
    const admin = await stelleAdminBereit();
    if (admin.erstellt) {
      logger.info({ email: admin.email }, "👑 Administrator-Konto eingerichtet (alle Rechte, alle Features)");
    }
  } catch (e: any) {
    logger.warn("Admin-Seed übersprungen: " + (e?.message ?? e));
  }

  // ── Sprint 65: Live-Problem-Löser-Agent starten (alle 5 Minuten) ─────────
  try {
    const { starteLiveProblemLoeser } = await import("./agents/liveProblemLoeserAgent");
    starteLiveProblemLoeser(5 * 60 * 1000);
    logger.info("🔧 Live-Problem-Löser-Agent aktiv — überwacht und heilt autonom alle 5 Minuten");
  } catch (e: any) {
    logger.warn("Live-Problem-Löser konnte nicht gestartet werden: " + (e?.message ?? e));
  }

  app.listen(port, () => {
    logger.info({ port }, "✅ CyberSarah Revenue OS Server gestartet");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Server-Fehler beim Start");
  process.exit(1);
});
