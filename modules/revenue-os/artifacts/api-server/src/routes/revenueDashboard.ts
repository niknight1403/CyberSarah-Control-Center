import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/revenue-dashboard", async (_req: Request, res: Response) => {
  try {
    const { db } = await import("@workspace/db");
    const { transactionsTable, revenueOpportunitiesTable, produkteTable, agentLogsTable } = await import("@workspace/db");
    const { desc, eq, sql, gte } = await import("drizzle-orm");

    // Gather all data in parallel
    const [transactions, produkte, opportunities, recentLogs, totalRevenue] = await Promise.all([
      db.select({
        count: sql<number>`COUNT(*)`,
        summe: sql<number>`COALESCE(SUM(betrag),0)`,
        datum: sql<string>`DATE(created_at)`,
      }).from(transactionsTable).groupBy(sql`DATE(created_at)`).orderBy(desc(sql`DATE(created_at)`)).limit(30).catch(() => []),

      db.select({ count: sql<number>`COUNT(*)`, aktiv: sql<number>`SUM(CASE WHEN aktiv THEN 1 ELSE 0 END)` }).from(produkteTable).catch(() => [{ count: 0, aktiv: 0 }]),

      db.select({ count: sql<number>`COUNT(*)`, aktiv: sql<number>`SUM(CASE WHEN status='aktiv' THEN 1 ELSE 0 END)` }).from(revenueOpportunitiesTable).catch(() => [{ count: 0, aktiv: 0 }]),

      db.select({ aktion: agentLogsTable.aktion, status: agentLogsTable.status, nachricht: agentLogsTable.nachricht, createdAt: agentLogsTable.createdAt })
        .from(agentLogsTable).orderBy(desc(agentLogsTable.createdAt)).limit(20).catch(() => []),

      db.select({ summe: sql<number>`COALESCE(SUM(betrag),0)` }).from(transactionsTable).catch(() => [{ summe: 0 }]),
    ]);

    // System status check
    let systemOk = true;
    let agentOnline = 0;
    let agentTotal = 0;
    try {
      const { agentsTable } = await import("@workspace/db");
      const agents = await db.select({ status: agentsTable.status }).from(agentsTable);
      agentTotal = agents.length;
      agentOnline = agents.filter(a => a.status === "aktiv" || a.status === "wartend").length;
    } catch {}

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      transactions: transactions || [],
      totalRevenue: totalRevenue[0]?.summe || 0,
      produkte: produkte[0] || { count: 0, aktiv: 0 },
      opportunities: opportunities[0] || { count: 0, aktiv: 0 },
      recentLogs: recentLogs || [],
      system: { status: systemOk ? "online" : "offline", agents: agentTotal, agentOnline },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    res.status(500).json({ success: false, message: msg });
  }
});

// The actual visual dashboard HTML
router.get("/revenue", (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>Revenue Dashboard — CyberSarah</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
body{background:#0a0a0f;color:#e0e0e0;padding:16px;min-height:100vh}
.container{max-width:800px;margin:0 auto}
.header{text-align:center;padding:20px 0}
.header h1{font-size:1.5rem;background:linear-gradient(135deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header p{color:#6b7280;font-size:0.85rem;margin-top:4px}
.card{background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px}
.card h2{font-size:0.85rem;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stat{background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;text-align:center}
.stat .value{font-size:1.5rem;font-weight:700}
.stat .label{font-size:0.7rem;color:#6b7280;margin-top:4px}
.stat .green{color:#22c55e}.stat .yellow{color:#eab308}.stat .purple{color:#a855f7}.stat .blue{color:#06b6d4}
.chart{width:100%;height:200px;display:flex;align-items:flex-end;gap:2px;padding:10px 0}
.chart-bar{flex:1;border-radius:4px 4px 0 0;min-height:2px;transition:height 0.5s;background:linear-gradient(180deg,#a855f7,#7c3aed);position:relative}
.chart-bar:hover{opacity:0.8}
.chart-label{color:#6b7280;font-size:0.6rem;text-align:center;padding-top:4px}
.log-entry{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.8rem}
.log-entry:last-child{border-bottom:none}
.log-status{font-size:0.65rem;padding:2px 8px;border-radius:10px}
.status-ok{background:rgba(34,197,94,0.15);color:#22c55e}
.status-fehler{background:rgba(239,68,68,0.15);color:#ef4444}
#loading{text-align:center;padding:40px;color:#6b7280}
.btn{display:inline-block;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-weight:600;font-size:0.85rem;transition:all 0.2s;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;text-align:center}
.btn:active{transform:scale(0.97)}
@media(max-width:480px){.grid{grid-template-columns:1fr}.header h1{font-size:1.2rem}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>💰 Revenue Dashboard</h1>
    <p id="lastUpdate">Lade Daten...</p>
  </div>
  <div id="loading">📡 Verbinde...</div>
  <div id="content" style="display:none">

    <div class="grid" id="kpiGrid"></div>

    <div class="card">
      <h2>📈 Umsatz (letzte 30 Tage)</h2>
      <div id="revenueChart" class="chart"></div>
    </div>

    <div class="card">
      <h2>📊 Produkte & Chancen</h2>
      <div id="productStats"></div>
    </div>

    <div class="card">
      <h2>📋 Letzte Aktivitäten</h2>
      <div id="recentLogs"></div>
    </div>

    <div style="display:flex;gap:10px">
      <button class="btn" style="flex:1" onclick="loadData()">🔄 Aktualisieren</button>
      <a class="btn" style="flex:1;background:rgba(255,255,255,0.08);color:#e0e0e0" href="/api/system-dashboard">📊 System</a>
    </div>
    <p style="text-align:center;color:#6b7280;font-size:0.7rem;margin-top:16px">
      CyberSarah Revenue OS • Aktualisiert alle 30s
    </p>
  </div>
</div>

<script>
async function loadData() {
  try {
    const r = await fetch('/api/revenue-dashboard');
    const d = await r.json();
    if (!d.success) throw new Error(d.message);
    
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';
    document.getElementById('lastUpdate').textContent = 'Live • ' + new Date().toLocaleTimeString('de-DE');
    
    // KPI Grid
    document.getElementById('kpiGrid').innerHTML = \`
      <div class="stat"><div class="value green">€\${Number(d.totalRevenue).toFixed(2)}</div><div class="label">Gesamtumsatz</div></div>
      <div class="stat"><div class="value purple">\${d.system.agents || 0}</div><div class="label">Agenten</div></div>
      <div class="stat"><div class="value blue">\${d.produkte?.aktiv || 0}</div><div class="label">Aktive Produkte</div></div>
      <div class="stat"><div class="value \${d.system.status === 'online' ? 'green' : 'red'}">\${d.system.status === 'online' ? '✅' : '❌'}</div><div class="label">System</div></div>
    \`;
    
    // Revenue Chart
    const transactions = d.transactions || [];
    const maxVal = Math.max(...transactions.map(t => Number(t.summe)), 1);
    document.getElementById('revenueChart').innerHTML = transactions.length > 0
      ? transactions.slice(0,14).reverse().map(t => \`
        <div style="flex:1;display:flex;flex-direction:column;align-items:center">
          <div class="chart-bar" style="height:\${(Number(t.summe)/maxVal*180)}px" title="€\${Number(t.summe).toFixed(2)}"></div>
          <div class="chart-label">\${t.datum?.slice(5) || ''}</div>
        </div>
      \`).join('')
      : '<p style="color:#6b7280;padding:40px;text-align:center">Noch keine Transaktionen</p>';
    
    // Products & Opportunities
    document.getElementById('productStats').innerHTML = \`
      <div class="grid">
        <div class="stat"><div class="value purple">\${d.produkte?.count || 0}</div><div class="label">Produkte Gesamt</div></div>
        <div class="stat"><div class="value green">\${d.produkte?.aktiv || 0}</div><div class="label">Aktiv</div></div>
        <div class="stat"><div class="value blue">\${d.opportunities?.count || 0}</div><div class="label">Chancen</div></div>
        <div class="stat"><div class="value green">\${d.opportunities?.aktiv || 0}</div><div class="label">Aktive Chancen</div></div>
      </div>
    \`;
    
    // Recent Logs
    const logs = d.recentLogs || [];
    document.getElementById('recentLogs').innerHTML = logs.length > 0
      ? logs.slice(0,10).map(l => \`
        <div class="log-entry">
          <span>\${l.nachricht?.slice(0,60) || l.aktion || '?'}</span>
          <span class="log-status \${l.status === 'erfolgreich' || l.status === 'ok' ? 'status-ok' : 'status-fehler'}">\${l.status || '?'}</span>
        </div>
      \`).join('')
      : '<p style="color:#6b7280;text-align:center;padding:20px">Keine Logs</p>';
      
  } catch(e) {
    document.getElementById('loading').innerHTML = '❌ Fehler: ' + e.message;
  }
}

loadData();
setInterval(loadData, 30000);
</script>
</body>
</html>`);
});

export default router;
