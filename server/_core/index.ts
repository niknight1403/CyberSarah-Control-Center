import "dotenv/config";
import express from "express";
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
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

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
        res
          .status(400)
          .json({
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

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
