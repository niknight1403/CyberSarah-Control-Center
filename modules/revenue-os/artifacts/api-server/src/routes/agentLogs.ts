import { Router } from "express";
import { db } from "@workspace/db";
import { agentLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

router.get("/agent-logs", async (req, res) => {
  const { agentId, limit } = req.query;
  const limitNum = Math.min(parseInt(String(limit ?? "50")), 200);

  const conditions = agentId ? [eq(agentLogsTable.agentId, parseInt(String(agentId)))] : [];

  const logs = await db.select().from(agentLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentLogsTable.createdAt))
    .limit(limitNum);

  res.json(logs.map(l => ({
    id: l.id,
    agentId: l.agentId,
    agentName: l.agentName,
    aktion: l.aktion,
    status: l.status,
    nachricht: l.nachricht,
    metadaten: l.metadaten,
    dauer: l.dauer,
    createdAt: l.createdAt.toISOString(),
  })));
});

export default router;
