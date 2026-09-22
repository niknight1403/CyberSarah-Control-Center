import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { verarbeiteDigistoreIPN, validiereDigistoreSignatur } from "./lib/digistoreClient";
import type { DS24IpnPayload } from "./lib/digistoreClient";
import router from "./routes";
import stripeWebhookRouter from "./routes/stripeWebhook";
import seoBlogRouter from "./routes/seoBlogSitemap";
import publicSiteRouter from "./routes/publicSite";
import { corsOptions } from "./lib/corsConfig";
import { db } from "@workspace/db";
import { webhookEventsTable } from "@workspace/db";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors(corsOptions));

// ─── Hilfsfunktion: IP-Adresse ermitteln (Proxy-aware) ───────────────────────

function holeIpAdresse(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  if (Array.isArray(forwarded)) return forwarded[0]!;
  return req.socket.remoteAddress ?? "unbekannt";
}

// ─── Stripe Webhook (VOR express.json() — raw body für Signatur-Verifikation!) ──

app.use("/api", stripeWebhookRouter);

// ─── Digistore24 IPN Webhook (POST /api/digistore/ipn) ──────────────────────

app.post(
  "/api/digistore/ipn",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    const ip = holeIpAdresse(req);
    try {
      const payload = req.body as DS24IpnPayload & Record<string, string>;
      const signatur = payload.sha_sign ?? (req.headers["x-ds24-signature"] as string);

      // Signatur prüfen (wenn Secret gesetzt)
      let signaturGueltig: boolean | null = null;
      if (process.env["DIGISTORE24_IPN_SECRET"]) {
        const gueltig = validiereDigistoreSignatur(payload, signatur ?? "");
        signaturGueltig = gueltig;
        if (!gueltig) {
          logger.warn({ ip }, "Ungültige Digistore24 IPN-Signatur");
          // Audit-Log für ungültige Signatur
          try {
            await db.insert(webhookEventsTable).values({
              quelle: "digistore24",
              ereignisTyp: "SIGNATUR_FEHLGESCHLAGEN",
              externId: payload.order_id ?? null,
              payload: payload as unknown as Record<string, unknown>,
              signaturPruefung: true,
              signaturGueltig: false,
              verarbeitet: false,
              fehler: "Ungültige IPN-Signatur",
              ipAdresse: ip,
            });
          } catch { /* Audit-Logging darf Webhook nicht blockieren */ }
          res.status(401).json({ error: "Ungültige Signatur" });
          return;
        }
      }

      await verarbeiteDigistoreIPN(payload);

      // Audit-Log für成功的 Verarbeitung
      try {
        await db.insert(webhookEventsTable).values({
          quelle: "digistore24",
          ereignisTyp: payload.event ?? "unbekannt",
          externId: payload.order_id ?? null,
          payload: payload as unknown as Record<string, unknown>,
          signaturPruefung: !!process.env["DIGISTORE24_IPN_SECRET"],
          signaturGueltig,
          verarbeitet: true,
          ipAdresse: ip,
        });
      } catch { /* Audit-Logging darf Webhook nicht blockieren */ }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "Digistore24 IPN Fehler");
      // Audit-Log für Verarbeitungsfehler
      try {
        const payload = req.body as Record<string, unknown>;
        await db.insert(webhookEventsTable).values({
          quelle: "digistore24",
          ereignisTyp: "VERARBEITUNGSFEHLER",
          externId: (payload?.order_id as string) ?? null,
          payload,
          signaturPruefung: false,
          signaturGueltig: null,
          verarbeitet: false,
          fehler: err instanceof Error ? err.message : "Unbekannter Fehler",
          ipAdresse: ip,
        });
      } catch { /* Audit-Logging darf Webhook nicht blockieren */ }
      res.status(500).json({ error: "Verarbeitungsfehler" });
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Dashboard: Statische Dateien ────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardPath = path.resolve(__dirname, "../../dashboard/dist");

app.use("/app", express.static(dashboardPath, { index: "index.html" }));

// Redirect /app to /app/ for SPA
app.get("/app", (_req, res) => res.redirect("/app/"));

// ─── Public Routes (vor statischen Dateien) ──
const apkPath = path.resolve(__dirname, "../../../apk");
app.use("/apk", express.static(apkPath));
app.use("/", publicSiteRouter);
app.use("/", seoBlogRouter);

// ─── DB-Fehler-Handling (loggt Fehler sichtbar statt sie zu verschlucken) ───

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // DB-Fehler explizit loggen (statt still zu ignorieren)
  if (err?.code === "23502" || err?.code === "42P01" ||
      err?.message?.includes("null") || err?.message?.includes("select") ||
      err?.message?.includes("Cannot read properties of null") ||
      err?.message?.includes("relation") || err?.message?.includes("column")) {
    logger.warn({ err: err.message?.slice(0, 200), code: err.code, path: req.path }, "DB-Fehler auf Route");
    if (req.method === "GET") {
      return res.json({ error: "Datenbank-Fehler", detail: err.message?.slice(0, 120), path: req.path });
    }
    return res.status(500).json({ error: "Datenbank-Fehler", detail: err.message?.slice(0, 120) });
  }
  next(err);
});

app.use("/api", router);

// ─── Digistore24 Status-Endpoint (REST, nicht Webhook) ──────────────────────

app.get("/api/digistore/status", (_req, res) => {
  res.json({
    aktiv: !!process.env["DIGISTORE24_API_KEY"],
    affiliateId: process.env["DIGISTORE24_AFFILIATE_ID"] ?? null,
    ipnSecretKonfiguriert: !!process.env["DIGISTORE24_IPN_SECRET"],
  });
});

// ─── Webhook-Event-Log (nur für Admins) ─────────────────────────────────────

app.get("/api/webhook-events", async (req, res) => {
  if (!db) {
    return res.json({ error: "Keine Datenbank konfiguriert", events: [] });
  }
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
    const quelle = req.query.quelle as string | undefined;

    const { desc, eq } = await import("drizzle-orm");
    let query = db.select().from(webhookEventsTable);
    if (quelle) {
      query = query.where(eq(webhookEventsTable.quelle, quelle));
    }
    const events = await query.orderBy(desc(webhookEventsTable.createdAt)).limit(limit);

    res.json(events.map(e => ({
      id: e.id,
      quelle: e.quelle,
      ereignisTyp: e.ereignisTyp,
      externId: e.externId,
      signaturPruefung: e.signaturPruefung,
      signaturGueltig: e.signaturGueltig,
      verarbeitet: e.verarbeitet,
      fehler: e.fehler,
      ipAdresse: e.ipAdresse,
      createdAt: e.createdAt?.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Fehler beim Laden der Webhook-Events");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// ─── Globale Fehlerbehandlung ───────────────────────────────────────────────

app.use(
  (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message === "Nicht erlaubter CORS-Ursprung") {
      logger.warn({ origin: req.headers.origin }, "CORS-Anfrage blockiert");
      res.status(403).json({ error: "Nicht erlaubter Ursprung" });
      return;
    }
    logger.error({ err }, "Unbehandelter Serverfehler");
    res.status(500).json({ error: "Interner Serverfehler" });
  },
);

export default app;
