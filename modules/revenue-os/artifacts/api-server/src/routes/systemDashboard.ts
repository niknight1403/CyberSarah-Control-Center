import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

router.get("/system-dashboard", (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>CyberSarah — System Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
body{background:#0a0a0f;color:#e0e0e0;padding:16px;min-height:100vh}
.container{max-width:800px;margin:0 auto}
.header{text-align:center;padding:20px 0;margin-bottom:24px}
.header h1{font-size:1.5rem;background:linear-gradient(135deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header p{color:#6b7280;font-size:0.85rem;margin-top:4px}
.card{background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:20px;margin-bottom:16px}
.card h2{font-size:0.9rem;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.stat{background:rgba(255,255,255,0.03);border-radius:12px;padding:16px;text-align:center}
.stat .value{font-size:1.8rem;font-weight:700}
.stat .label{font-size:0.75rem;color:#6b7280;margin-top:4px}
.stat .green{color:#22c55e}.stat .yellow{color:#eab308}.stat .red{color:#ef4444}.stat .purple{color:#a855f7}.stat .blue{color:#06b6d4}
.agent-list{display:flex;flex-direction:column;gap:8px}
.agent-item{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:0.85rem}
.agent-name{color:#d1d5db}.agent-status{font-size:0.75rem;padding:2px 10px;border-radius:20px;font-weight:600}
.status-aktiv{background:rgba(34,197,94,0.15);color:#22c55e}
.status-wartend{background:rgba(234,179,8,0.15);color:#eab308}
.status-fehler{background:rgba(239,68,68,0.15);color:#ef4444}
.status-pausiert{background:rgba(107,114,128,0.15);color:#9ca3af}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.btn{flex:1;padding:12px 20px;border:none;border-radius:12px;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.2s;text-align:center;text-decoration:none;display:inline-block}
.btn-primary{background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff}
.btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff}
.btn-success{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}
.btn-outline{background:rgba(255,255,255,0.08);color:#e0e0e0;border:1px solid rgba(255,255,255,0.15)}
.btn:active{transform:scale(0.97)}
#loading{text-align:center;padding:40px;color:#6b7280}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.loading-dots{display:inline-block;animation:pulse 1.5s ease-in-out infinite}
@media(max-width:480px){.grid{grid-template-columns:1fr}.header h1{font-size:1.2rem}}
</style>
</head>
<body>
<div class="container" id="app">
  <div class="header">
    <h1>⚡ CyberSarah System Dashboard</h1>
    <p id="lastUpdate">Wird geladen...</p>
  </div>
  <div id="loading" class="loading-dots">📡 Verbinde zum Server...</div>
</div>

<script>
const API = window.location.origin + '/api';

async function loadStatus() {
  try {
    const [sysRes, adminRes, logRes] = await Promise.all([
      fetch(API + '/system-status').then(r=>r.json()).catch(()=>({})),
      fetch(API + '/admin/status').then(r=>r.json()).catch(()=>({})),
      fetch(API + '/admin/logs?limit=10').then(r=>r.json()).catch(()=>({}))
    ]);

    const data = sysRes;
    const admin = adminRes;
    const logs = logRes.logs || [];

    document.getElementById('loading').style.display = 'none';
    document.getElementById('lastUpdate').textContent = 'Live • ' + new Date().toLocaleTimeString('de-DE');

    const statusColor = data.systemGesund ? 'green' : 'red';
    const health = data.systemGesundheit || 0;
    const healthColor = health >= 80 ? 'green' : health >= 50 ? 'yellow' : 'red';
    const rate = data.erfolgsrate24h || 0;
    const rateColor = rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red';

    document.getElementById('app').innerHTML = \`
      <div class="header">
        <h1>⚡ CyberSarah System Dashboard</h1>
        <p id="lastUpdate">Live • \${new Date().toLocaleTimeString('de-DE')}</p>
      </div>
      
      <div class="grid">
        <div class="stat">
          <div class="value \${statusColor}">\${data.systemGesund ? '✅' : '❌'}</div>
          <div class="label">System Status</div>
        </div>
        <div class="stat">
          <div class="value \${healthColor}">\${health}%</div>
          <div class="label">Gesundheit</div>
        </div>
        <div class="stat">
          <div class="value \${rateColor}">\${rate}%</div>
          <div class="label">Erfolgsrate 24h</div>
        </div>
        <div class="stat">
          <div class="value purple">\${data.agentenGesamt || 0}</div>
          <div class="label">Agenten Gesamt</div>
        </div>
      </div>

      <div class="card">
        <h2>🤖 Agenten-Status</h2>
        <div class="agent-list">
          \${renderAgentList(data.agentenNachStatus || {})}
        </div>
      </div>

      <div class="card">
        <h2>🔌 Dienste</h2>
        <div class="agent-list">
          \${renderServices(data.apiKeyStatus || {})}
        </div>
      </div>

      <div class="card">
        <h2>📋 Letzte Aktivitäten</h2>
        <div class="agent-list">
          \${logs.length > 0 ? logs.slice(0,8).map(l => \`
            <div class="agent-item">
              <span class="agent-name">\${l.nachricht?.slice(0,60) || l.aktion || '?'}</span>
              <span class="agent-status \${l.status === 'erfolgreich' || l.status === 'ok' ? 'status-aktiv' : l.status === 'fehler' ? 'status-fehler' : 'status-wartend'}">\${l.status || '?'}</span>
            </div>
          \`).join('') : '<div class="agent-item">Keine Logs</div>'}
        </div>
      </div>

      <div class="card">
        <h2>🖥️ Server</h2>
        <div class="agent-list">
          \${admin.server ? Object.entries(admin.server).map(([k,v]) => \`
            <div class="agent-item">
              <span class="agent-name">\${k}</span>
              <span style="color:#9ca3af;font-size:0.8rem">\${v || '?'}</span>
            </div>
          \`).join('') : '<div class="agent-item">Keine Server-Info</div>'}
          \${admin.git ? \`
            <div class="agent-item">
              <span class="agent-name">Branch</span>
              <span style="color:#9ca3af;font-size:0.8rem">\${admin.git.branch}</span>
            </div>
            <div class="agent-item">
              <span class="agent-name">Letzte Commits</span>
              <span style="color:#9ca3af;font-size:0.8rem">\${Array.isArray(admin.git.lastCommits) ? admin.git.lastCommits.join(' | ') : ''}</span>
            </div>
          \` : ''}
        </div>
      </div>

      <div class="card">
        <h2>🎮 Aktionen</h2>
        <div class="actions">
          <button class="btn btn-primary" onclick="loadStatus()">🔄 Aktualisieren</button>
          <button class="btn btn-outline" onclick="triggerWatchdog()">⚡ Watchdog</button>
          <button class="btn btn-success" onclick="triggerDeploy()">🚀 Deploy</button>
        </div>
        <div id="actionResult" style="margin-top:12px;font-size:0.85rem;color:#6b7280"></div>
      </div>
    \`;
  } catch(e) {
    document.getElementById('loading').innerHTML = '❌ Server nicht erreichbar';
  }
}

function renderAgentList(status) {
  const items = [];
  if (status.wartend) items.push({label:'Wartend',count:status.wartend,cls:'status-wartend'});
  if (status.aktiv) items.push({label:'Aktiv',count:status.aktiv,cls:'status-aktiv'});
  if (status.fehler) items.push({label:'Fehler',count:status.fehler,cls:'status-fehler'});
  if (status.pausiert) items.push({label:'Pausiert',count:status.pausiert,cls:'status-pausiert'});
  if (items.length === 0) return '<div class="agent-item">Keine Daten</div>';
  return items.map(i => \`
    <div class="agent-item">
      <span class="agent-name">\${i.label}</span>
      <span class="agent-status \${i.cls}">\${i.count}</span>
    </div>
  \`).join('');
}

function renderServices(keys) {
  if (!keys || Object.keys(keys).length === 0) return '<div class="agent-item">Keine Daten</div>';
  return Object.entries(keys).filter(([k]) => k !== '_meta').map(([name, svc]) => \`
    <div class="agent-item">
      <span class="agent-name">\${svc.name || name}</span>
      <span class="agent-status \${svc.verfuegbar ? 'status-aktiv' : 'status-fehler'}">\${svc.verfuegbar ? '✅' : '❌'}</span>
    </div>
  \`).join('');
}

async function triggerWatchdog() {
  const el = document.getElementById('actionResult');
  el.textContent = '⏳ Watchdog wird getriggert...';
  try {
    const r = await fetch(API + '/admin/watchdog-trigger', {method:'POST'});
    const d = await r.json();
    el.textContent = d.success ? '✅ Watchdog ausgeführt' : '❌ Fehler: ' + (d.message || '?');
    setTimeout(loadStatus, 2000);
  } catch(e) {
    el.textContent = '❌ Fehler: ' + e.message;
  }
}

async function triggerDeploy() {
  if (!confirm('🚀 Server neu deployen? (Git Pull + Restart)')) return;
  const el = document.getElementById('actionResult');
  el.textContent = '⏳ Deploy wird ausgeführt...';
  try {
    const r = await fetch(API + '/admin/deploy', {method:'POST', headers:{'X-Deploy-Token': process.env['DEPLOY_TOKEN'] ?? ''}});
    const d = await r.json();
    el.textContent = d.success ? '✅ Deploy gestartet! Server restartet...' : '❌ Fehler: ' + (d.message || '?');
  } catch(e) {
    el.textContent = '❌ Fehler: ' + e.message;
  }
}

loadStatus();
setInterval(loadStatus, 15000);
</script>
</body>
</html>`);
});

export default router;
