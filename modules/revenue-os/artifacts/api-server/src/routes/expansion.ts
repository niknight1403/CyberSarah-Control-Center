import { Router } from "express";
import { db } from "@workspace/db";
import { expansionChancenTable, agentsTable, agentLogsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { scanneExpansionChancen, validiereROI, holeExpansionStatus } from "../agents/expansionAgent";

const router = Router();

// GET /expansion/chancen — alle Expansion-Chancen
router.get("/expansion/chancen", async (req, res) => {
    if (!db) { res.json([]); return; }
  try {
    const chancen = await db
      .select()
      .from(expansionChancenTable)
      .orderBy(asc(expansionChancenTable.prioritaet), desc(expansionChancenTable.createdAt));
    res.json(chancen);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Expansion-Chancen");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// GET /expansion/status — Übersicht
router.get("/expansion/status", async (req, res) => {
  try {
    const status = await holeExpansionStatus();
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden des Expansion-Status");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /expansion/scan — Neuen Scan starten
router.post("/expansion/scan", async (req, res) => {
    if (!db) { res.json([]); return; }
  try {
    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.typ, "expansion_scanner"))
      .limit(1);

    const agentId = agent?.id ?? 0;
    const result = await scanneExpansionChancen(agentId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Expansion-Scan");
    res.status(500).json({ error: "Scan fehlgeschlagen" });
  }
});

// POST /expansion/chancen/:id/aktivieren — Chance aktivieren
router.post("/expansion/chancen/:id/aktivieren", async (req, res) => {
    if (!db) { res.json([]); return; }
  const id = parseInt(req.params.id ?? "0");
    if (!db) { res.json([]); return; }
  try {
    await db.update(expansionChancenTable)
      .set({ status: "aktiv", updatedAt: new Date() })
      .where(eq(expansionChancenTable.id, id));
    res.json({ success: true, message: "Chance aktiviert" });
  } catch (err) {
    req.log.error({ err, id }, "Fehler beim Aktivieren");
    res.status(500).json({ error: "Fehler beim Aktivieren" });
  }
});

// POST /expansion/chancen/:id/pausieren — Chance pausieren
router.post("/expansion/chancen/:id/pausieren", async (req, res) => {
    if (!db) { res.json([]); return; }
  const id = parseInt(req.params.id ?? "0");
    if (!db) { res.json([]); return; }
  try {
    await db.update(expansionChancenTable)
      .set({ status: "pausiert", updatedAt: new Date() })
      .where(eq(expansionChancenTable.id, id));
    res.json({ success: true, message: "Chance pausiert" });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Pausieren" });
  }
});

// POST /expansion/chancen/:id/validieren — ROI prüfen
router.post("/expansion/chancen/:id/validieren", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  try {
    const result = await validiereROI(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Validierung fehlgeschlagen" });
  }
});

// GET /expansion/projektion — Realistische Monatsprognose
router.get("/expansion/projektion", async (_req, res) => {
    if (!db) { res.json([]); return; }
  try {
    const chancen = await db
      .select()
      .from(expansionChancenTable)
      .where(eq(expansionChancenTable.status, "aktiv"));

    const sofortChancen = await db
      .select()
      .from(expansionChancenTable)
      .where(eq(expansionChancenTable.sofortStartbar, true));

    // Realistische Prognose (konservativ, ehrlich)
    const projektion = {
      monat1: {
        konservativ: 50,
        realistisch: 300,
        optimistisch: 800,
        beschreibung: "Aufbau-Phase: Content-Reichweite wächst, erste Affiliate-Klicks, möglicherweise 1-2 Coaching-Anfragen",
        aktionen: ["Digistore24 & Copecart anmelden", "Erste Stripe Payment Links erstellen", "TikTok/Instagram Content posten"],
      },
      monat2: {
        konservativ: 200,
        realistisch: 800,
        optimistisch: 2500,
        beschreibung: "Wachstums-Phase: Reichweite nimmt zu, Affiliate-Conversions starten, Coaching-Pipeline füllt sich",
        aktionen: ["Content-Rhythmus etabliert", "Erste Affiliate-Sales", "Newsletter-Aufbau"],
      },
      monat3: {
        konservativ: 500,
        realistisch: 2000,
        optimistisch: 6000,
        beschreibung: "Momentum: Algorithmus-Boost, wiederkehrende Kunden, Upsells greifen",
        aktionen: ["Skalierung der Top-Kanäle", "A/B-Tests für Preise", "Affiliate-Netzwerk ausbaut"],
      },
      voraussetzungen: [
        "Tägliche Content-Posts (automatisch durch Content Agent)",
        "Digistore24/Copecart Anmeldung (10 Min, einmalig)",
        "Stripe Live-Key ist aktiv ✅",
        "OpenAI API-Key für KI-Content ✅",
      ],
      risiken: [
        "Monat 1 kann €0 sein wenn keine Reichweite vorhanden",
        "TikTok/YouTube brauchen Zeit bis Algorithmus greift (4-8 Wochen)",
        "Coaching-Nachfrage hängt von persönlichem Branding ab",
      ],
      kostenlosFuerErstenMonat: true,
      offeneChancenAnzahl: sofortChancen.length,
      aktivierteChancen: chancen.length,
    };

    res.json(projektion);
  } catch (err) {
    res.status(500).json({ error: "Projektion nicht verfügbar" });
  }
});

export default router;
