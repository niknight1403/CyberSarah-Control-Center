import { Router } from "express";
import { holeOrchestratorStatus, fuehreAgentManuellAus } from "../agents/orchestrator";
import { globalQueue } from "../agents/JobQueue";
import { erstelleStripeService } from "../services/APIService";
import { logger } from "../lib/logger";

const router = Router();

// GET /orchestrator/status — Orchestrator + Queue Status
router.get("/orchestrator/status", (req, res) => {
  const status = holeOrchestratorStatus();
  res.json({
    ...status,
    zeitstempel: new Date().toISOString(),
  });
});

// POST /orchestrator/queue — Job manuell einreihen
router.post("/orchestrator/queue", async (req, res) => {
  const { aufgabenTyp, payload, prioritaet, maxVersuche } = req.body as {
    aufgabenTyp: string;
    payload: Record<string, unknown>;
    prioritaet?: 1 | 2 | 3;
    maxVersuche?: number;
  };

  if (!aufgabenTyp || !payload) {
    res.status(400).json({ error: "aufgabenTyp und payload sind Pflichtfelder" });
    return;
  }

  const id = globalQueue.fuegeHinzu(aufgabenTyp, payload, {
    prioritaet: prioritaet ?? 2,
    maxVersuche: maxVersuche ?? 3,
  });

  res.status(201).json({ jobId: id, status: "wartend", zeitstempel: new Date().toISOString() });
});

// GET /orchestrator/services/status — API-Service Circuit-Breaker Status
router.get("/orchestrator/services/status", (req, res) => {
  const stripeService = erstelleStripeService();
  res.json({
    stripe: {
      circuitBreaker: stripeService.holeCircuitBreakerStatus(),
      rateLimiter: stripeService.holeRateLimitStatistiken(),
    },
    zeitstempel: new Date().toISOString(),
  });
});

// POST /orchestrator/services/stripe/test — Stripe API testen
router.post("/orchestrator/services/stripe/test", async (req, res) => {
  const stripeService = erstelleStripeService();

  if (!process.env["STRIPE_SECRET_KEY"]) {
    res.status(400).json({
      erfolg: false,
      fehler: "STRIPE_SECRET_KEY nicht konfiguriert",
      anleitung: "Setze STRIPE_SECRET_KEY als Umgebungsvariable",
    });
    return;
  }

  const antwort = await stripeService.anfrage({
    endpoint: "/customers",
    methode: "GET",
    abfrageParameter: { limit: 5 },
  });

  res.json(antwort);
});

// POST /orchestrator/services/social/test — Social-Media Service testen
router.post("/orchestrator/services/social/test", async (req, res) => {
  const { plattform } = req.body as { plattform?: string };
  const erlaubtePlattformen = ["instagram", "tiktok", "youtube"];
  const zielPlattform = erlaubtePlattformen.includes(plattform ?? "") ? (plattform as "instagram" | "tiktok" | "youtube") : "instagram";

  const { erstelleSocialMediaService } = await import("../services/APIService");
  const service = erstelleSocialMediaService(zielPlattform);

  if (!process.env[`${zielPlattform.toUpperCase()}_ACCESS_TOKEN`] && !process.env[`${zielPlattform.toUpperCase()}_API_KEY`]) {
    res.json({
      erfolg: false,
      service: zielPlattform,
      fehler: `${zielPlattform.toUpperCase()}_ACCESS_TOKEN nicht konfiguriert`,
      circuitBreaker: service.holeCircuitBreakerStatus(),
      rateLimiter: service.holeRateLimitStatistiken(),
    });
    return;
  }

  res.json({
    erfolg: true,
    service: zielPlattform,
    nachricht: "Service konfiguriert und bereit",
    circuitBreaker: service.holeCircuitBreakerStatus(),
    rateLimiter: service.holeRateLimitStatistiken(),
  });
});

export default router;
