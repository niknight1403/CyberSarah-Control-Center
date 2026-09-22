import { Router } from "express";
import { db } from "@workspace/db";
import { revenueOpportunitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ladeTeamReport } from "../agents/FinanceTeamAgent";
import { starteFinanceTeamScan, bestaetigeFinanceRegistrierung } from "../agents/orchestrator";

const router = Router();

// GET /finance-team/overview
router.get("/finance-team/overview", async (req, res) => {
    if (!db) { res.json([]); return; }
  try {
    const report = await ladeTeamReport();
    const vorbereitet = await db
      .select()
      .from(revenueOpportunitiesTable)
      .where(eq(revenueOpportunitiesTable.registrierungsStatus, "vorbereitet"));

    res.json({
      erstelltAm: report?.erstelltAm ?? null,
      aktiveKampagnen: report?.aktiveKampagnen ?? 0,
      gesamtUmsatzKampagnen: report?.gesamtUmsatzKampagnen ?? 0,
      wartendeRegistrierungen: report?.wartendeRegistrierungen ?? vorbereitet.length,
      topEmpfehlungen: report?.topEmpfehlungen ?? [],
      umsatzPrognose: report?.umsatzPrognose ?? {
        status: "keine_kampagnen",
        konfidenz: "niedrig",
        echteTransaktionenAnzahl: 0,
        echterGesamtUmsatz: 0,
        kampagnenAlterTage: null,
        geschaetzteTageBisErsteEinnahmeMin: null,
        geschaetzteTageBisErsteEinnahmeMax: null,
        geschaetztesDatumVon: null,
        geschaetztesDatumBis: null,
        hinweis: "Noch keine Prognose verfügbar — das Team scannt automatisch alle 20 Minuten.",
      },
      vorbereiteteRegistrierungen: vorbereitet.map(v => ({
        id: v.id,
        titel: v.titel,
        kanal: v.kanal,
        marke: v.marke,
        geschaetzterMonatsumsatz: Number(v.geschaetzterMonatsumsatz ?? 0),
        registrierungsStatus: v.registrierungsStatus ?? "offen",
        registrierungsLink: v.registrierungsLink,
        registrierungsAnleitung: v.registrierungsAnleitung ? JSON.parse(v.registrierungsAnleitung) : [],
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Finance-Team-Übersicht");
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// POST /finance-team/scan
router.post("/finance-team/scan", async (req, res) => {
  try {
    const ergebnis = await starteFinanceTeamScan();
    res.json(ergebnis);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Finance-Team-Scan");
    res.status(500).json({ error: "Scan fehlgeschlagen" });
  }
});

// POST /finance-team/opportunities/:id/bestaetigen
router.post("/finance-team/opportunities/:id/bestaetigen", async (req, res) => {
  const id = parseInt(req.params.id ?? "0");
  if (!id) { res.status(400).json({ error: "Ungültige ID" }); return; }

  try {
    const ergebnis = await bestaetigeFinanceRegistrierung(id);
    res.json(ergebnis);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Bestätigen der Registrierung");
    res.status(500).json({ error: "Bestätigung fehlgeschlagen" });
  }
});

export default router;
