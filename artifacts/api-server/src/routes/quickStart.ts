import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /api/quick-start — Resume all agents + trigger full system scan
router.post("/quick-start", async (_req: Request, res: Response) => {
  const results: string[] = [];
  let success = true;

  try {
    const { db } = await import("@workspace/db");
    const { agentsTable, agentLogsTable, produkteTable, revenueOpportunitiesTable } = await import("@workspace/db");
    const { eq, desc } = await import("drizzle-orm");

    // 1. Resume ALL agents to "wartend" status
    const updateResult = await db.update(agentsTable)
      .set({ status: "wartend", fehlerAnzahl: 0, updatedAt: new Date() })
      .where(eq(agentsTable.status, "fehler"));
    results.push(`✅ Alle fehlerhaften Agenten zurückgesetzt`);

    // Also set all "pausiert" agents back to active
    await db.update(agentsTable)
      .set({ status: "wartend", fehlerAnzahl: 0, updatedAt: new Date() })
      .where(eq(agentsTable.status, "pausiert"));
    results.push(`✅ Alle pausierten Agenten reaktiviert`);

    // 2. Count current state
    const allAgents = await db.select().from(agentsTable);
    const aktiv = allAgents.filter(a => a.status === "aktiv" || a.status === "wartend").length;
    const fehler = allAgents.filter(a => a.status === "fehler").length;
    results.push(`📊 Agenten: ${allAgents.length} Gesamt, ${aktiv} Aktiv/Wartend, ${fehler} Fehler`);

    // 3. Create demo products if none exist
    const prodCount = await db.select({ count: () => 0 }).from(produkteTable);
    if (prodCount.length === 0) {
      results.push("📦 Keine Produkte — überspringe (wird von HARA erstellt)");
    }

    // 4. Log the quick-start
    await db.insert(agentLogsTable).values({
      agentId: 0,
      agentName: "System",
      aktion: "quick_start",
      status: "erfolgreich",
      nachricht: `🚀 Quick-Start: ${aktiv} Agenten aktiv, ${fehler} Fehler zurückgesetzt`,
    }).catch(() => {});

    // 5. Trigger all queue jobs via the global queue
    try {
      const { globalQueue } = await import("../agents/JobQueue");
      const jobs = [
        { typ: "hara_scan", aktion: "fast_revenue_scan", prio: 1 },
        { typ: "master_system_analyse", aktion: "system_analyse", prio: 1 },
        { typ: "revenue_analyst_scan", aktion: "chancen_scannen", prio: 2 },
        { typ: "monetization_auto_optimize", aktion: "auto_optimize_all", prio: 2 },
        { typ: "cross_sell_full", aktion: "full_scan", prio: 2 },
        { typ: "conversion_full", aktion: "create_tests", prio: 2 },
      ];
      for (const job of jobs) {
        globalQueue.fuegeHinzu(job.typ, { aktion: job.aktion }, { prioritaet: job.prio as 1|2|3 });
      }
      results.push(`⚡ ${jobs.length} Jobs in die Queue eingereiht`);
    } catch (e) {
      results.push(`⚠️ Queue nicht verfügbar: ${e instanceof Error ? e.message : '?'}`);
    }

    results.push(`✅ Quick-Start abgeschlossen!`);

  } catch (err) {
    success = false;
    results.push(`❌ Fehler: ${err instanceof Error ? err.message : '?'}`);
  }

  res.json({ success, message: results.join(" | "), details: results });
});

// GET /api/quick-status — One-line status for Termux
router.get("/quick-status", async (_req: Request, res: Response) => {
  try {
    const { db } = await import("@workspace/db");
    const { agentsTable, transactionsTable } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");

    const [agentData, revenueData] = await Promise.all([
      db.select({
        gesamt: sql<number>`COUNT(*)`,
        aktiv: sql<number>`SUM(CASE WHEN status='aktiv' THEN 1 ELSE 0 END)`,
        wartend: sql<number>`SUM(CASE WHEN status='wartend' THEN 1 ELSE 0 END)`,
        fehler: sql<number>`SUM(CASE WHEN status='fehler' THEN 1 ELSE 0 END)`,
        pausiert: sql<number>`SUM(CASE WHEN status='pausiert' THEN 1 ELSE 0 END)`,
      }).from(agentsTable).catch(() => [{ gesamt: 0, aktiv: 0, wartend: 0, fehler: 0, pausiert: 0 }]),

      db.select({
        summe: sql<number>`COALESCE(SUM(betrag),0)`,
        anzahl: sql<number>`COUNT(*)`,
      }).from(transactionsTable).catch(() => [{ summe: 0, anzahl: 0 }]),
    ]);

    const a = agentData[0] || { gesamt: 0, aktiv: 0, wartend: 0, fehler: 0, pausiert: 0 };
    const r = revenueData[0] || { summe: 0, anzahl: 0 };

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      oneLine: `Agenten: ${a.aktiv + a.wartend}/${a.gesamt} aktiv | Revenue: €${Number(r.summe).toFixed(2)} (${r.anzahl} TX) | Fehler: ${a.fehler} | Pausiert: ${a.pausiert}`,
      agents: a,
      revenue: { total: r.summe, transactions: r.anzahl },
      health: a.fehler === 0 && a.pausiert === 0 ? "good" : a.fehler > 5 ? "critical" : "warning",
    });
  } catch {
    res.json({ success: false, oneLine: "❌ Server nicht erreichbar" });
  }
});

export default router;
