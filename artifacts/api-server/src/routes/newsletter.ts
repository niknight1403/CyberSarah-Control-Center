/**
 * /api/newsletter — Beehiiv Newsletter-Agent Routen
 */
import { Router } from "express";
import { logger } from "../lib/logger";
import {
  veroeffentlicheNewsletter,
  holeLetzteNewsletter,
  holeAbonnentenStats,
  synchronisiereLeadsNachBeehiiv,
  fuegeAbonnentHinzu,
} from "../agents/newsletterAgent";

const router = Router();

// Status & Statistiken
router.get("/newsletter/status", async (_req, res) => {
  const [stats, letzte] = await Promise.all([
    holeAbonnentenStats(),
    holeLetzteNewsletter(5),
  ]);
  res.json({ stats, letzte });
});

// Newsletter manuell veröffentlichen
router.post("/newsletter/veroeffentlichen", async (req, res) => {
  const { marke } = req.body as { marke?: "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT" };
  const result = await veroeffentlicheNewsletter(marke ?? "GeldPilot AI");
  res.json(result);
});

// Leads → Beehiiv synchronisieren
router.post("/newsletter/leads-synchronisieren", async (_req, res) => {
  const synchronisiert = await synchronisiereLeadsNachBeehiiv();
  res.json({ synchronisiert, nachricht: `${synchronisiert} Leads zu Beehiiv hinzugefügt` });
});

// Einzelnen Abonnenten hinzufügen
router.post("/newsletter/abonnent", async (req, res) => {
  const { email, marke } = req.body as { email: string; marke?: string };
  if (!email) { res.status(400).json({ error: "E-Mail fehlt" }); return; }
  const ok = await fuegeAbonnentHinzu(email, marke);
  res.json({ erfolg: ok, nachricht: ok ? "Abonnent hinzugefügt" : "Fehler — Beehiiv-Credentials prüfen" });
});

export default router;
