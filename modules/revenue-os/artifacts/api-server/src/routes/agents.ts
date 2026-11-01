import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { fuehreAgentManuellAus } from "../agents/orchestrator";
import { hebeSmartPauseAuf } from "../agents/watchdog";
import { logger } from "../lib/logger";
import { costGuardrailMiddleware } from "../middleware/costGuardrail";

const router = Router();

const MOCK_AGENTS = [
  { id: 1, name: "Director Agent", typ: "director", status: "aktiv", beschreibung: "Strategisches Gehirn", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, name: "Master Agent", typ: "master", status: "aktiv", beschreibung: "Zentrale Kommandozentrale", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, name: "Content Factory", typ: "content_factory", status: "aktiv", beschreibung: "Content-Generierung für 3 Marken", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, name: "Social Media Poster", typ: "social_media", status: "aktiv", beschreibung: "TikTok + Instagram Auto-Post", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, name: "SEO Blog Agent", typ: "seo_blog", status: "aktiv", beschreibung: "SEO-optimierte Artikel generieren", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, name: "Trend Analyst", typ: "trend_analyst", status: "aktiv", beschreibung: "Markttrends überwachen", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 7, name: "Video Agent", typ: "video", status: "aktiv", beschreibung: "Video-Skripte erstellen", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 8, name: "Sales Agent", typ: "sales", status: "aktiv", beschreibung: "Verkaufstexte optimieren", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 9, name: "Funnel Agent", typ: "funnel", status: "aktiv", beschreibung: "E-Mail-Sequenzen generieren", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 10, name: "Community Agent", typ: "community", status: "aktiv", beschreibung: "DMs und Kommentare", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 11, name: "Revenue Analyst", typ: "revenue_analyst", status: "aktiv", beschreibung: "Umsatzchancen scannen", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 12, name: "Monetization Agent", typ: "monetization", status: "aktiv", beschreibung: "Upsell & Affiliate", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 13, name: "HARA Agent", typ: "hara", status: "aktiv", beschreibung: "Revenue-Pakete scannen", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 14, name: "Expansion Scanner", typ: "expansion_scanner", status: "aktiv", beschreibung: "Kostenlose Umsatzquellen", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 15, name: "Finance Team", typ: "finance_team", status: "aktiv", beschreibung: "Buchhaltung & Steuer", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 16, name: "Micro-Trading", typ: "micro_trading", status: "pausiert", beschreibung: "Pausiert — zu riskant", letzteAktivitaet: new Date().toISOString(), fehlerAnzahl: 0, ausgefuehrtAufgaben: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

router.get("/agents", async (req, res) => {
  if (!db) return res.json(MOCK_AGENTS);
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.id);
  res.json(agents.map(a => ({
    id: a.id,
    name: a.name,
    typ: a.typ,
    status: a.status,
    beschreibung: a.beschreibung,
    letzteAktivitaet: a.letzteAktivitaet?.toISOString() ?? null,
    fehlerAnzahl: a.fehlerAnzahl,
    ausgefuehrtAufgaben: a.ausgefuehrtAufgaben,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  })));
});

router.patch("/agents/:id/status", async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"));
  const { status } = req.body as { status: string };

  const erlaubteStatus = ["aktiv", "gestoppt", "fehler", "wartend", "pausiert"];
  if (!erlaubteStatus.includes(status)) {
    res.status(400).json({ error: "Ungültiger Status" });
    return;
  }

  const [agent] = await db.update(agentsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(agentsTable.id, id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent nicht gefunden" });
    return;
  }

  res.json({
    id: agent.id, name: agent.name, typ: agent.typ, status: agent.status,
    beschreibung: agent.beschreibung,
    letzteAktivitaet: agent.letzteAktivitaet?.toISOString() ?? null,
    fehlerAnzahl: agent.fehlerAnzahl, ausgefuehrtAufgaben: agent.ausgefuehrtAufgaben,
    createdAt: agent.createdAt.toISOString(), updatedAt: agent.updatedAt.toISOString(),
  });
});

// POST /agents/:id/reset — Circuit Breaker zurücksetzen (nach Key-Reparatur)
router.post("/agents/:id/reset", async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"));

  const [agent] = await db
    .update(agentsTable)
    .set({ status: "wartend", fehlerAnzahl: sql`0`, updatedAt: new Date() })
    .where(eq(agentsTable.id, id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent nicht gefunden" });
    return;
  }

  // Smart-Pause für diesen Agent aufheben (30-Min-Sperre löschen)
  hebeSmartPauseAuf(id);

  req.log.info({ agentId: id, agentName: agent.name }, `Circuit Breaker zurückgesetzt: ${agent.name}`);

  res.json({
    success: true,
    message: `${agent.name} wurde zurückgesetzt — Fehleranzahl auf 0, Smart-Pause aufgehoben`,
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      fehlerAnzahl: agent.fehlerAnzahl,
    },
  });
});

// SPRING 63: Cost-Guardrail schützt jede Agenten-Execution
// (403 bei gesperrter Subscription, 429 bei erschöpftem Token-Budget)
router.post("/agents/:id/run", costGuardrailMiddleware, async (req, res) => {
  const id = parseInt(String(req.params.id ?? "0"));
  try {
    const ergebnis = await fuehreAgentManuellAus(id);
    res.json({ ...ergebnis, logId: null });
  } catch (err) {
    req.log.error({ err, agentId: id }, "Manueller Agent-Start fehlgeschlagen");
    res.json({ success: false, message: err instanceof Error ? err.message : "Unbekannter Fehler", logId: null });
  }
});

export default router;
