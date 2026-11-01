/**
 * 🔔 In-App Notification System
 * Zeigt Echtzeit-Benachrichtigungen über Agent-Aktivitäten, Revenue-Events und System-Status.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { agentLogsTable, haraProposalsTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const router = Router();

export interface AppNotification {
  id: string;
  typ: "revenue" | "hara" | "system" | "agent" | "warning";
  titel: string;
  beschreibung: string;
  zeit: string;
  gelesen: boolean;
  actionUrl?: string;
  prioritaet: number;
}

router.get("/notifications", async (req, res) => {
  if (!db) {
    res.json({ notifications: [], ungelesen: 0 });
    return;
  }

  try {
    const notifikationen: AppNotification[] = [];
    const vor24h = new Date(Date.now() - 86400000);

    // 1. Letzte Agent-Logs
    const warnLogs = await db
      .select()
      .from(agentLogsTable)
      .where(
        and(
          gte(agentLogsTable.createdAt, vor24h),
          sql`status IN ('warning', 'fehler', 'erfolgreich')`
        )
      )
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(20);

    for (const log of (warnLogs ?? [])) {
      notifikationen.push({
        id: "log-" + String(log.id),
        typ: log.status === "fehler" ? "warning" : log.status === "erfolgreich" ? "hara" : "agent",
        titel: String(log.agentName ?? "System"),
        beschreibung: String(log.nachricht ?? "").slice(0, 200),
        zeit: log.createdAt instanceof Date ? log.createdAt.toISOString() : new Date().toISOString(),
        gelesen: false,
        prioritaet: log.status === "fehler" ? 1 : 3,
      });
    }

    // 2. Neue HARA-Vorschläge
    const neueVorschlaege = await db
      .select()
      .from(haraProposalsTable)
      .where(gte(haraProposalsTable.createdAt, vor24h))
      .orderBy(desc(haraProposalsTable.createdAt))
      .limit(10);

    for (const v of (neueVorschlaege ?? [])) {
      const umsatz = Number(v.geschaetzterMonatsumsatz ?? 0);
      notifikationen.push({
        id: "hara-" + String(v.id),
        typ: "hara" as const,
        titel: "\uD83D\uDCB0 HARA: Neue Umsatz-Chance",
        beschreibung: String(v.titel ?? "") + " — geschätzt €" + String(umsatz) + "/Monat",
        zeit: v.createdAt instanceof Date ? v.createdAt.toISOString() : new Date().toISOString(),
        gelesen: false,
        actionUrl: "/hara",
        prioritaet: umsatz >= 1000 ? 1 : 2,
      });
    }

    // 3. Letzte Transaktionen
    const letzteTransaktionen = await db
      .select()
      .from(transactionsTable)
      .where(gte(transactionsTable.createdAt, vor24h))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(10);

    for (const t of (letzteTransaktionen ?? [])) {
      notifikationen.push({
        id: "tx-" + String(t.id),
        typ: "revenue" as const,
        titel: "\uD83D\uDCB6 Zahlung erhalten: €" + Number(t.betrag ?? 0).toFixed(2),
        beschreibung: String(t.produktName ?? "Unbekanntes Produkt"),
        zeit: t.createdAt instanceof Date ? t.createdAt.toISOString() : new Date().toISOString(),
        gelesen: false,
        actionUrl: "/finanzen",
        prioritaet: 1,
      });
    }

    // 4. Fehlerhafte Agenten
    const fehlerAgenten = await db
      .select()
      .from(agentLogsTable)
      .where(
        and(
          gte(agentLogsTable.createdAt, vor24h),
          eq(agentLogsTable.status, "fehler")
        )
      )
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(5);

    for (const f of (fehlerAgenten ?? [])) {
      notifikationen.push({
        id: "err-" + String(f.id),
        typ: "warning" as const,
        titel: "\u26A0\uFE0F Agent-Fehler: " + String(f.agentName ?? "Unbekannt"),
        beschreibung: String(f.nachricht ?? "").slice(0, 200),
        zeit: f.createdAt instanceof Date ? f.createdAt.toISOString() : new Date().toISOString(),
        gelesen: false,
        prioritaet: 1,
      });
    }

    notifikationen.sort((a, b) => a.prioritaet - b.prioritaet || new Date(b.zeit).getTime() - new Date(a.zeit).getTime());
    const begrenzt = notifikationen.slice(0, 50);
    const ungelesen = begrenzt.filter(n => !n.gelesen).length;

    res.json({ notifications: begrenzt, ungelesen });
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der Benachrichtigungen");
    res.status(500).json({ error: "Fehler beim Laden der Benachrichtigungen" });
  }
});

export default router;
