import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import compression from "compression";
import { existsSync } from "node:fs";
import path from "node:path";
import { attachAnomalyDetector } from "../self-healing";
import { startOptimizerLoop } from "../orchestrator/optimizer-loop";
import {
  isWebFallbackCandidate,
  mapUrlPathToWebFile,
  resolveWebDistDir,
} from "../../lib/static-web-logic";
import { isTruthyEnvFlag } from "../../lib/trust-proxy-logic";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { handleRotationWebhook , initProviderAdmin } from "../provider-admin";
import { providerAdminIdSchema } from "../provider-admin-router";
import { registerRenderProxy } from "./renderProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import {
  createLiveBillingPortalSession,
  createLiveCheckoutSession,
  processStripeWebhook,
  StripeWebhookSignatureError,
} from "../billing";
import { sdk } from "./sdk";
import { createSecurityMiddleware } from "./security";
import { checkDatabaseHealth } from "../db";
import { restoreRouterState } from "../model-router";
// Sprint 196 — Autonomer Route-Rotations-Agent (Gratis-Kette, Admin-Vollzugriff).
import { restoreRouteRotationState } from "../route-rotation-agent";
import { runDraftEngine } from "../draft-engine";
import { metricsHandler, requestMetricsMiddleware } from "./observability";
import {
  buildRuntimeStatusSnapshot,
  filterRuntimeLogs,
} from "../../lib/live-status-logic";
import {
  getRuntimeLogs,
  installRuntimeLogger,
  subscribeRuntimeLogs,
} from "../runtime-logger";
import { agenticLoopTelemetryBus } from "../agentic-loop-telemetry";
import { isValidLoopSessionId } from "../../lib/agentic-loop-telemetry-logic";

async function requireBillingUser(req: express.Request, res: express.Response) {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Authentifizierung erforderlich." });
    return null;
  }
}

async function startServer() {
  const app = express();
  const startedAt = Date.now();
  const server = createServer(app);

  app.set("trust proxy", isTruthyEnvFlag(process.env.TRUST_PROXY));
  // Komprimiert das große Expo-Web-Bundle und CSS/JSON vor der Auslieferung.
  // Die Startup-Shell bleibt inline und erscheint bereits vor diesem Download.
  app.use(compression({ threshold: 1024 }));
  app.use(createSecurityMiddleware());
  app.use(requestMetricsMiddleware);

  app.post(
    "/api/billing/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const result = await processStripeWebhook(
          req.body as Buffer,
          req.header("stripe-signature"),
        );
        res.status(200).json(result);
      } catch (error) {
        console.error(
          "[Stripe] Webhook-Verarbeitung fehlgeschlagen:",
          error instanceof Error ? error.message : "Unbekannter Fehler",
        );
        // Signatur-Fehler: 400 (Stripe kann dieses Event nie liefern).
        // Verarbeitungs-Fehler: 500 — Stripe wiederholt die Zustellung.
        if (error instanceof StripeWebhookSignatureError) {
          res.status(400).json({
            error: "Webhook-Signatur ungültig.",
          });
          return;
        }
        res.status(500).json({
          error: "Webhook-Verarbeitung vorübergehend fehlgeschlagen — Stripe wird erneut zustellen.",
        });
      }
    },
  );

  app.post("/api/billing/stripe/checkout", async (req, res) => {
    const user = await requireBillingUser(req, res);
    if (!user) return;
    try {
      res.status(201).json(await createLiveCheckoutSession(user));
    } catch (error) {
      console.error(
        "[Stripe] Checkout konnte nicht erstellt werden:",
        error instanceof Error ? error.message : "Unbekannter Fehler",
      );
      res
        .status(502)
        .json({ error: "Checkout konnte nicht vorbereitet werden." });
    }
  });

  app.post("/api/billing/stripe/portal", async (req, res) => {
    const user = await requireBillingUser(req, res);
    if (!user) return;
    try {
      res.status(201).json(await createLiveBillingPortalSession(user));
    } catch (error) {
      console.error(
        "[Stripe] Billing-Portal konnte nicht erstellt werden:",
        error instanceof Error ? error.message : "Unbekannter Fehler",
      );
      res
        .status(502)
        .json({ error: "Billing-Portal konnte nicht vorbereitet werden." });
    }
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerRenderProxy(app);
  registerOAuthRoutes(app);

  // Sprint 155 — Autorisierter Rotations-Webhook: POST /api/provider-rotation/webhook
  // Nur mit korrektem PROVIDER_ROTATION_WEBHOOK_SECRET (Timing-sicher geprueft).
  // Nutzlast: { provider, apiKey, expiresAt? } — Antwort enthaelt NIE Voll-Keys.
  app.post("/api/provider-rotation/webhook", async (req, res) => {
    try {
      const body = req.body as { provider?: unknown; apiKey?: unknown; expiresAt?: unknown };
      const parsed = providerAdminIdSchema.safeParse(body?.provider);
      if (!parsed.success || typeof body?.apiKey !== "string" || body.apiKey.trim().length < 8) {
        res.status(400).json({ ok: false, error: "Ungültige Nutzlast — provider und apiKey (min. 8 Zeichen) sind erforderlich." });
        return;
      }
      const result = await handleRotationWebhook({
        provider: parsed.data as Parameters<typeof handleRotationWebhook>[0]["provider"],
        apiKey: body.apiKey,
        expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
        providedSecret: req.headers["x-rotation-secret"] as string | undefined,
      });
      res.status(result.status).json({ ok: result.ok, maskedKey: result.maskedKey, message: result.safeMessage });
    } catch {
      res.status(500).json({ ok: false, error: "Interner Fehler beim Rotations-Webhook." });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });
  app.get("/api/ready", async (_req, res) => {
    const database = await checkDatabaseHealth();
    res.status(database ? 200 : 503).json({
      ok: database,
      checks: { database },
      timestamp: Date.now(),
    });
  });

  app.get("/api/metrics", metricsHandler);

  // Sprint 346 — Autonome Draft-Engine: taeglicher Cron-Endpoint. Nutzt
  // bewusst METRICS_TOKEN als gemeinsames Ops-Token (bereits auf Render UND
  // als GitHub-Secret konfiguriert) — kein neues Secret noetig. Erzeugt
  // NUR pending-Entwuerfe; Freigabe bleibt dem Menschen vorbehalten.
  app.post("/api/cron/draft-engine", async (req, res) => {
    const configuredToken = process.env.METRICS_TOKEN?.trim();
    if (!configuredToken || req.header("authorization") !== `Bearer ${configuredToken}`) {
      res.status(401).json({ error: "Nicht autorisiert." });
      return;
    }
    try {
      const result = await runDraftEngine();
      console.info("[Draft-Engine] Lauf abgeschlossen:", JSON.stringify(result));
      res.json({ ok: true, result, timestamp: Date.now() });
    } catch (error) {
      console.error("[Draft-Engine] Lauf fehlgeschlagen:", error);
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "unbekannter Fehler" });
    }
  });


  // Sprint 66 — Live-Runtime-Endpunkte fuer das Preview-Panel (auth-pflichtig).
  installRuntimeLogger();
  attachAnomalyDetector();
  const requireRuntimeUser = async (
    req: express.Request,
    res: express.Response,
  ): Promise<boolean> => {
    try {
      await sdk.authenticateRequest(req);
      return true;
    } catch {
      res.status(401).json({ error: "Authentifizierung erforderlich." });
      return false;
    }
  };

  app.get("/api/runtime/status", async (req, res) => {
    if (!(await requireRuntimeUser(req, res))) return;
    const logs = getRuntimeLogs();
    res.json(
      buildRuntimeStatusSnapshot({
        input: {
          processUp: true,
          lastErrorAtMs: logs.filter((entry) => entry.level === "error").at(-1)?.atMs,
          nowMs: Date.now(),
        },
        activeUrl: process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || "3000"}`,
        port: parseInt(process.env.PORT || "3000", 10),
        connectionKind: "sse",
        pingMs: null,
        buffer: logs,
        serverUptimeMs: Date.now() - startedAt,
      }),
    );
  });

  app.get("/api/runtime/logs", async (req, res) => {
    if (!(await requireRuntimeUser(req, res))) return;
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 100));
    const levelsParam = String(req.query.levels || "");
    const levels = levelsParam
      .split(",")
      .map((level) => level.trim())
      .filter((level): level is "info" | "warn" | "error" | "success" =>
        ["info", "warn", "error", "success"].includes(level),
      );
    const filtered = filterRuntimeLogs(getRuntimeLogs(), {
      levels: levels.length > 0 ? levels : undefined,
      query: typeof req.query.query === "string" ? req.query.query : undefined,
    });
    res.json({ entries: filtered.slice(-limit).reverse(), total: filtered.length });
  });

  // Sprint 353 — Agentic-Loop-Telemetrie: SSE-Stream pro Session-ID.
  // Reconnect-Sicherheit: Last-Event-ID wird nachgeliefert (atomares
  // subscribeWithReplay), danach folgt der Live-Stream; Heartbeat haelt
  // Proxies waerme, close raeumt Abonnenten und Timer ab.
  app.get("/api/agentic-loops/:sessionId/stream", async (req, res) => {
    const sessionId = String(req.params.sessionId ?? "");
    if (!isValidLoopSessionId(sessionId)) {
      res.status(400).json({ error: "Ungueltige Session-ID (4-64 Zeichen, [A-Za-z0-9_-])." });
      return;
    }
    if (!(await requireRuntimeUser(req, res))) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": loop-telemetrie verbunden\n\n");
    const sinceHeader = req.headers["last-event-id"];
    const sinceEventId = Number.isFinite(Number(sinceHeader)) ? Number(sinceHeader) : 0;
    const { unsubscribe } = agenticLoopTelemetryBus.subscribeWithReplay(sessionId, (event) => {
      res.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
    }, sinceEventId);
    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get("/api/runtime/logs/stream", async (req, res) => {
    if (!(await requireRuntimeUser(req, res))) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": stream verbunden\n\n");
    for (const entry of getRuntimeLogs().slice(-100)) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
    const unsubscribe = subscribeRuntimeLogs((entry) => {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });
    const heartbeat = setInterval(() => {
      res.write(`: ping ${Date.now()}\n\n`);
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Statischer Expo-Web-Export (Render-Einzel-Dienst): Dateien aus
  // web-dist ausliefern, unbekannte GET-Pfade auf index.html fallen.
  const webDistDir = resolveWebDistDir(process.cwd());
  if (webDistDir) {
    // Catch-all NACH allen /api-Routen: Datei aus dem Web-Export liefern,
    // sonst index.html (Static-Site-Export, client-seitiges Routing).
    app.get("/{*splat}", (req, res) => {
      if (!isWebFallbackCandidate(req.method, req.path)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const relative = mapUrlPathToWebFile(req.path);
      const filePath = relative ? path.join(webDistDir, relative) : null;
      if (filePath && existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }
      // Fallback nur fuer pfadaehnliche Requests (keine Asset-Endungen).
      const looksLikeAsset = /\.[a-zA-Z0-9]+$/.test(req.path.split("?")[0]);
      const indexPath = path.join(webDistDir, "index.html");
      if (!looksLikeAsset && existsSync(indexPath)) {
        res.sendFile(indexPath);
        return;
      }
      res.status(404).json({ error: "Not found" });
    });
    console.log(`[api] serving static web export from ${webDistDir}`);
  }

  // Sprint 69: Globale JSON-Fehlerbehandlung — NIE HTML-Fehlerseiten an
  // API-Clients ausliefern (Express-Default 404/500 liefert sonst HTML und
  // loest client-seitige JSON-Parse-Exceptions aus).
  app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.path, method: req.method });
  });
   
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error("[api] unhandled error:", req.method, req.path, error);
    const status = typeof (error as { status?: number })?.status === "number" ? (error as { status: number }).status : 500;
    if (!res.headersSent) {
      res.status(status).json({ error: "Internal server error", path: req.path, method: req.method });
    }
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  void restoreRouterState().catch(() => undefined);
  void initProviderAdmin().catch(() => undefined);
  // Sprint 196 — Autonomer Route-Rotations-Agent: Zustand restaurieren,
  // synchronen Spiegel fuer die Ketten-Sortierung setzen und Tick starten.
  void restoreRouteRotationState().catch(() => undefined);

  // Sprint 169 — Port-Konflikt-Haertung (EADDRINUSE): Ohne diesen Handler
  // wirft der Listener eine unbehandelte Exception mit rohem Stack-Trace und
  // der Supervisor (PM2/Render) startet blind gegen denselben belegten Port
  // in einen Restart-Loop. Jetzt: loesbare, deutsche Fehlermeldung ueber den
  // Runtime-Logger (speist auch die port_in_use-Signatur des Self-Healing-
  // Ledgers) und kontrollierter Exit — das Recovery entscheidet der Supervisor.
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `[api] FEHLER EADDRINUSE: Port ${port} ist bereits belegt. Belegenden Prozess finden (lsof -i :${port} bzw. Render-Log) oder PORT auf freien Wert setzen. Prozess wird kontrolliert beendet.`,
      );
    } else {
      console.error("[api] Listener-Fehler, Prozess wird beendet:", error);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    startOptimizerLoop();
  });
}

// Sprint 169 — Globale Async-Exception-Haertung: Unbehandelte Rejections
// beenden Node seit v15 sofort mit rohem Stack. Sie landen jetzt sauber im
// Runtime-Logger und damit im Self-Healing-Ledger (Signatur
// unhandled_rejection) — der Prozess bleibt am Leben, der Fehler bleibt
// beobachtbar und klassifiziert. Unbehandelte Exceptions sind dagegen nicht
// fortsetzbar (Interna unklar): loggen und kontrolliert beenden (Exit 1),
// damit PM2/Render sauber statt mitten im Request neu starten.
process.on("unhandledRejection", (reason) => {
  console.error("[api] Unbehandelte Promise-Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error(
    "[api] Unbehandelte Exception — Prozess wird kontrolliert beendet:",
    error,
  );
  process.exit(1);
});

startServer().catch((error) => {
  console.error("[api] Server-Start fehlgeschlagen:", error);
  process.exit(1);
});
