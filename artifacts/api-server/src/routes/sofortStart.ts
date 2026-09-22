import { Router } from "express";
import {
  erstelleSofortProdukte,
  ladeProdukte,
  ladeSetupStatus,
  markiereSetupSchritt,
  generiereGumroadBeschreibungen,
  generiereAffiliateContentTemplates,
} from "../agents/sofortStartAgent";

const router = Router();

// POST /sofort-start/erstelle-produkte — Stripe-Produkte automatisch erstellen
router.post("/sofort-start/erstelle-produkte", async (req, res) => {
  try {
    const result = await erstelleSofortProdukte();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Erstellen der Sofort-Produkte");
    res.status(500).json({ error: "Produkt-Erstellung fehlgeschlagen", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET /sofort-start/produkte — alle Produkte mit Payment-Links
router.get("/sofort-start/produkte", async (req, res) => {
  try {
    const produkte = await ladeProdukte();
    res.json(produkte);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Produkte");
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// GET /sofort-start/setup-status — Setup-Fortschritt
router.get("/sofort-start/setup-status", async (req, res) => {
  try {
    const schritte = await ladeSetupStatus();
    res.json(schritte);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Laden des Setup-Status" });
  }
});

// POST /sofort-start/setup-schritt-erledigt/:schluessel
router.post("/sofort-start/setup-schritt-erledigt/:schluessel", async (req, res) => {
  const schluessel = req.params.schluessel ?? "";
  const metadaten = req.body as Record<string, string> | undefined;
  try {
    await markiereSetupSchritt(schluessel, metadaten);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Markieren" });
  }
});

// GET /sofort-start/gumroad-beschreibungen — Gumroad-ready Produkttexte
router.get("/sofort-start/gumroad-beschreibungen", async (req, res) => {
  try {
    const beschreibungen = await generiereGumroadBeschreibungen();
    res.json(beschreibungen);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Generieren" });
  }
});

// GET /sofort-start/affiliate-templates — Content-Vorlagen für Digistore24
router.get("/sofort-start/affiliate-templates", async (_req, res) => {
  try {
    const templates = generiereAffiliateContentTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Generieren" });
  }
});

export default router;
