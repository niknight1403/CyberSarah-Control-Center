import { Router } from "express";
import { db } from "@workspace/db";
import { haraProposalsTable, haraPerformanceTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { starteHaraScan, starteHaraAusfuehrung, holeHaraAgent } from "../agents/orchestrator";
import type { HaraSchritt } from "../agents/HaraAgent";

const router = Router();

function parseJsonArray<T>(roh: string | null): T[] {
  try {
    const v = JSON.parse(roh ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// GET /hara/overview
router.get("/hara/overview", async (req, res) => {
  if (!db) {
    res.json({
      proposals: [],
      performance: [],
      statistik: { gesamtVorschlaege: 0, offen: 0, inUmsetzung: 0, abgeschlossen: 0, verworfen: 0, erfolgsquote: null },
    });
    return;
  }
  try {
    const [proposals, performance] = await Promise.all([
      db.select().from(haraProposalsTable).orderBy(desc(haraProposalsTable.createdAt)).limit(50),
      db.select().from(haraPerformanceTable).orderBy(desc(haraPerformanceTable.createdAt)).limit(20),
    ]);

    const abgeschlossen = proposals.filter(p => p.status === "abgeschlossen").length;
    const verworfen = proposals.filter(p => p.status === "verworfen").length;
    const entschieden = abgeschlossen + verworfen;

    res.json({
      proposals: proposals.map(p => ({
        id: p.id,
        titel: p.titel,
        status: p.status,
        marke: p.marke,
        kanal: p.kanal,
        businessCase: p.businessCase,
        roiErwartung: p.roiErwartung,
        geschaetzterMonatsumsatz: Number(p.geschaetzterMonatsumsatz ?? 0),
        ressourcen: parseJsonArray<string>(p.ressourcen),
        automatisierungsPfad: parseJsonArray<HaraSchritt>(p.automatisierungsPfad),
        roiScore: p.roiScore,
        geschwindigkeitScore: p.geschwindigkeitScore,
        automatisierbarkeitScore: p.automatisierbarkeitScore,
        gesamtScore: p.gesamtScore,
        quelle: p.quelle,
        bestaetigtAm: p.bestaetigtAm?.toISOString() ?? null,
        createdAt: p.createdAt?.toISOString() ?? null,
      })),
      performance: performance.map(e => ({
        id: e.id,
        proposalId: e.proposalId,
        titel: e.titel,
        kanal: e.kanal,
        resultat: e.resultat,
        analyse: e.analyse,
        createdAt: e.createdAt?.toISOString() ?? null,
      })),
      statistik: {
        gesamtVorschlaege: proposals.length,
        offen: proposals.filter(p => p.status === "vorgeschlagen").length,
        inUmsetzung: proposals.filter(p => p.status === "bestaetigt" || p.status === "in_umsetzung").length,
        abgeschlossen,
        verworfen,
        erfolgsquote: entschieden > 0 ? Math.round((abgeschlossen / entschieden) * 100) : null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der HARA-Übersicht");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /hara/scan — Phase 1 manuell anstoßen (ASYNCHRON — keine Blockade)
router.post("/hara/scan", async (req, res) => {
  if (!db) {
    res.status(503).json({ success: false, message: "Keine Datenbank konfiguriert — HARA-Scan nicht möglich" });
    return;
  }
  // Sofort antworten, Scan läuft im Hintergrund
  res.json({ success: true, message: "🔍 HARA-Scan gestartet — läuft im Hintergrund (OpenAI)", background: true });
  
  // Asynchron ausführen (Fehler werden intern geloggt)
  starteHaraScan().catch((err) => {
    req.log?.error?.({ err }, "Hintergrund-HARA-Scan fehlgeschlagen");
  });
});

// POST /hara/proposals/:id/bestaetigen — CONFIRM-Signal (Phase 2 → 3)
router.post("/hara/proposals/:id/bestaetigen", async (req, res) => {
  if (!db) {
    res.status(503).json({ error: "Keine Datenbank konfiguriert — HARA-Bestätigung nicht möglich" });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });

    const [proposal] = await db.select().from(haraProposalsTable).where(eq(haraProposalsTable.id, id)).limit(1);
    if (!proposal) return res.status(404).json({ error: "Paket nicht gefunden" });
    if (proposal.status !== "vorgeschlagen") {
      return res.status(409).json({ error: `Paket ist bereits im Status "${proposal.status}"` });
    }

    await db.update(haraProposalsTable)
      .set({ status: "bestaetigt", bestaetigtAm: new Date(), updatedAt: new Date() })
      .where(eq(haraProposalsTable.id, id));

    starteHaraAusfuehrung(id);

    return res.json({ success: true, message: `CONFIRM erhalten — autonome Ausführung von "${proposal.titel}" gestartet` });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Bestätigen des HARA-Pakets");
    return res.status(500).json({ error: "Bestätigung fehlgeschlagen" });
  }
});

// POST /hara/proposals/:id/verwerfen — Lern-Signal für Phase 4
router.post("/hara/proposals/:id/verwerfen", async (req, res) => {
  if (!db) {
    res.status(503).json({ error: "Keine Datenbank konfiguriert — HARA-Verwerfung nicht möglich" });
    return;
  }
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungültige ID" });

    const [proposal] = await db.select().from(haraProposalsTable).where(eq(haraProposalsTable.id, id)).limit(1);
    if (!proposal) return res.status(404).json({ error: "Paket nicht gefunden" });
    if (proposal.status === "verworfen" || proposal.status === "abgeschlossen") {
      return res.status(409).json({ error: `Paket ist bereits im Status "${proposal.status}"` });
    }

    await db.update(haraProposalsTable)
      .set({ status: "verworfen", updatedAt: new Date() })
      .where(eq(haraProposalsTable.id, id));

    const agent = holeHaraAgent();
    if (agent) {
      await (agent as any).schreibePerformance(
        proposal.id,
        proposal.titel,
        proposal.kanal,
        "verworfen",
        "Vom Operator verworfen — diese Art von Vorschlag (Kanal/Ansatz) beim nächsten Scan niedriger priorisieren.",
      );
    }

    return res.json({ success: true, message: `"${proposal.titel}" verworfen — HARA lernt daraus für den nächsten Scan` });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Verwerfen des HARA-Pakets");
    return res.status(500).json({ error: "Verwerfen fehlgeschlagen" });
  }
});

// POST /hara/proposals/:id/schritte/:index/erledigt — manuellen Schritt abhaken
router.post("/hara/proposals/:id/schritte/:index/erledigt", async (req, res) => {
  if (!db) {
    res.status(503).json({ error: "Keine Datenbank konfiguriert — Aktion nicht möglich" });
    return;
  }
  try {
    const id = Number(req.params.id);
    const index = Number(req.params.index);
    if (!Number.isFinite(id) || !Number.isFinite(index)) return res.status(400).json({ error: "Ungültige Parameter" });

    const [proposal] = await db.select().from(haraProposalsTable).where(eq(haraProposalsTable.id, id)).limit(1);
    if (!proposal) return res.status(404).json({ error: "Paket nicht gefunden" });
    if (proposal.status !== "bestaetigt" && proposal.status !== "in_umsetzung") {
      return res.status(409).json({ error: `Paket muss erst bestätigt werden (aktueller Status: "${proposal.status}")` });
    }

    const pfad = parseJsonArray<HaraSchritt>(proposal.automatisierungsPfad);
    const schritt = pfad[index];
    if (!schritt) return res.status(404).json({ error: "Schritt nicht gefunden" });
    if (schritt.typ !== "manuell") return res.status(400).json({ error: "Nur manuelle Schritte können hier abgehakt werden" });
    if (schritt.status === "erledigt") return res.status(409).json({ error: "Schritt ist bereits erledigt" });

    schritt.status = "erledigt";
    schritt.ergebnis = "Vom Operator bestätigt";

    const alleErledigt = pfad.every(s => s.status === "erledigt");
    await db.update(haraProposalsTable)
      .set({
        automatisierungsPfad: JSON.stringify(pfad),
        status: alleErledigt ? "abgeschlossen" : proposal.status,
        updatedAt: new Date(),
      })
      .where(eq(haraProposalsTable.id, id));

    if (alleErledigt) {
      const agent = holeHaraAgent();
      if (agent) {
        await (agent as any).schreibePerformance(
          proposal.id,
          proposal.titel,
          proposal.kanal,
          "erfolg",
          "Alle Schritte abgeschlossen (Auto + manuell) — Strategie vollständig umgesetzt, Performance im Kampagnen-Tab beobachten.",
        );
      }
    }

    return res.json({
      success: true,
      message: alleErledigt
        ? `Alle Schritte erledigt — "${proposal.titel}" abgeschlossen!`
        : "Schritt als erledigt markiert",
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Abhaken des HARA-Schritts");
    return res.status(500).json({ error: "Aktion fehlgeschlagen" });
  }
});

export default router;
