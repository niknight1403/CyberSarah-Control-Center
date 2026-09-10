import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  isWebFallbackCandidate,
  mapUrlPathToWebFile,
  resolveWebDistDir,
} from "../../lib/static-web-logic";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import {
  createLiveBillingPortalSession,
  createLiveCheckoutSession,
  processStripeWebhook,
} from "../billing";
import { sdk } from "./sdk";
import { createSecurityMiddleware } from "./security";
import { checkDatabaseHealth } from "../db";
import { metricsHandler, requestMetricsMiddleware } from "./observability";
import {
  buildRuntimeStatusSnapshot,
  classifyRuntimeState,
  filterRuntimeLogs,
} from "../../lib/live-status-logic";
import {
  getRuntimeLogs,
  installRuntimeLogger,
  subscribeRuntimeLogs,
} from "../runtime-logger";

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

  app.set("trust proxy", process.env.TRUST_PROXY === "true");
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
        res.status(400).json({
          error: "Webhook konnte nicht verifiziert oder verarbeitet werden.",
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
  registerOAuthRoutes(app);

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

  // Sprint 66 — Live-Runtime-Endpunkte fuer das Preview-Panel (auth-pflichtig).
  installRuntimeLogger();
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
    app.get("*", (req, res) => {
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

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
