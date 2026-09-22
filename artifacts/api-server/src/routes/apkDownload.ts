/**
 * APK Download- und Mobile-Dashboard-Seite
 * Zeigt: APK Download, Server-Status, Quick-Links
 * 
 * Erreichbar: GET /apk/
 *             GET /apk/:filename.apk
 */
import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";

const router = Router();
const APK_DIR = process.env["APK_DIR"] || "/opt/cybersarah";

// Mobile Dashboard Seite
router.get("/", (_req: Request, res: Response) => {
  // Verfügbare APKs scannen
  let apkFiles: string[] = [];
  try {
    if (fs.existsSync(APK_DIR)) {
      apkFiles = fs.readdirSync(APK_DIR)
        .filter(f => f.endsWith(".apk"))
        .sort()
        .reverse();
    }
  } catch {
    // Ignorieren
  }

  const apkHtml = apkFiles.map(f => {
    const fullPath = path.join(APK_DIR, f);
    const size = fs.existsSync(fullPath) 
      ? (fs.statSync(fullPath).size / (1024 * 1024)).toFixed(1)
      : "?";
    return `<a class="apk-btn" href="/apk/${f}" download>📦 ${f} (${size} MB)</a>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="theme-color" content="#0a0a0f"/>
<title>CyberSarah — Mobile Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.5;padding:0 0 80px 0}
.header{background:linear-gradient(135deg,#1a0a2e,#0d0d1a);padding:1.2rem 1rem;text-align:center;border-bottom:1px solid #2a1a4e}
.header h1{font-size:1.3rem;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#9ca3af;font-size:0.8rem;margin-top:0.3rem}
.container{padding:0.8rem;max-width:500px;margin:0 auto}
.card{background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:1rem;margin-bottom:0.8rem}
.card h3{color:#a855f7;font-size:0.9rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.4rem}
.row{display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.85rem;border-bottom:1px solid #1a1a2a}
.row:last-child{border-bottom:none}
.label{color:#9ca3af}
.value{color:#e0e0e0;font-weight:500}
.online{color:#22c55e}
.offline{color:#ef4444}
.warning{color:#f59e0b}
.apk-btn{display:block;background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff;padding:0.7rem 1rem;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.9rem;margin-bottom:0.5rem;text-align:center;transition:opacity .2s}
.apk-btn:hover{opacity:0.9}
.apk-btn.alt{background:linear-gradient(90deg,#374151,#4b5563);font-size:0.8rem}
.btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.5rem}
.action-btn{display:block;background:#1f1f2e;color:#e0e0e0;padding:0.6rem;border-radius:8px;text-decoration:none;font-size:0.8rem;text-align:center;border:1px solid #2a2a3e;transition:all .2s}
.action-btn:hover{background:#2a2a3e;border-color:#a855f7}
.action-btn .icon{font-size:1.2rem;display:block;margin-bottom:0.2rem}
.footer{text-align:center;padding:1rem;color:#6b7280;font-size:0.75rem}
.badge{display:inline-block;padding:0.15rem 0.5rem;border-radius:99px;font-size:0.7rem;font-weight:600}
.badge-green{background:rgba(34,197,94,0.15);color:#22c55e}
.badge-red{background:rgba(239,68,68,0.15);color:#ef4444}
</style>
</head>
<body>
<div class="header">
  <h1>🚀 CyberSarah Revenue OS</h1>
  <p>KI-gestütztes Umsatzsystem | v5.2</p>
</div>
<div class="container">
  <div class="card" id="status-card">
    <h3>📊 Server-Status</h3>
    <div class="row"><span class="label">System</span><span class="value" id="health">Prüfe...</span></div>
    <div class="row"><span class="label">Agenten</span><span class="value" id="agents">Lade...</span></div>
    <div class="row"><span class="label">Stripe</span><span class="value" id="stripe">Prüfe...</span></div>
    <div class="row"><span class="label">OpenAI</span><span class="value" id="openai">Prüfe...</span></div>
    <div class="row"><span class="label">Umsatz</span><span class="value" id="revenue">Prüfe...</span></div>
  </div>
  <div class="card">
    <h3>📱 APK Download</h3>
    ${apkHtml || '<p style="color:#6b7280;font-size:0.85rem">Keine APKs gefunden</p>'}
  </div>
  <div class="card">
    <h3>⚡ Schnellzugriff</h3>
    <div class="btn-grid">
      <a class="action-btn" href="/"><span class="icon">🏠</span>Start</a>
      <a class="action-btn" href="/api/store"><span class="icon">🛍️</span>Store</a>
      <a class="action-btn" href="/api/revenue"><span class="icon">💰</span>Revenue</a>
      <a class="action-btn" href="/api/agents"><span class="icon">🤖</span>Agenten</a>
      <a class="action-btn" href="/api/system-dashboard"><span class="icon">📊</span>System</a>
      <a class="action-btn" href="/api/quick-start"><span class="icon">🚀</span>Quick-Start</a>
    </div>
  </div>
</div>
<div class="footer">
  CyberSarah v5.2 — Auto-Update aktiv<br>
  <span style="font-size:0.7rem">Stand: ${new Date().toLocaleString("de-DE")}</span>
</div>
<script>
async function updateStatus() {
  try {
    const r = await fetch("/api/system/status");
    const d = await r.json();
    document.getElementById("health").innerHTML = '<span class="online">● Gesund</span>';
    document.getElementById("stripe").innerHTML = d.stripeVerfuegbar ? '<span class="online">✅ LIVE</span>' : '<span class="offline">❌ Fehler</span>';
    document.getElementById("openai").innerHTML = d.openaiVerfuegbar ? '<span class="online">✅ Aktiv</span>' : '<span class="offline">❌ Fehler</span>';
    document.getElementById("agents").textContent = (d.agentStatus?.aktiv || 0) + "/" + (d.agentStatus?.gesamt || 0) + " aktiv";
  } catch {}
  try {
    const r = await fetch("/api/revenue/status");
    const d = await r.json();
    document.getElementById("revenue").textContent = (d.tatsaechlicherUmsatz || 0).toFixed(2) + " €";
  } catch {}
}
updateStatus();
setInterval(updateStatus, 15000);
</script>
</body>
</html>`;
  res.send(html);
});

// APK-Dateien ausliefern
router.get("/:filename", (req: Request, res: Response) => {
  const filename = req.params["filename"];
  if (!filename || !filename.endsWith(".apk")) {
    res.status(404).send("Nur APK-Dateien");
    return;
  }
  // Sicherheitscheck: nur Dateiname, kein Pfad
  const safeName = path.basename(filename);
  const filepath = path.join(APK_DIR, safeName);
  
  if (fs.existsSync(filepath)) {
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + safeName + "\"");
    res.sendFile(filepath);
  } else {
    res.status(404).send("APK nicht gefunden: " + safeName);
  }
});

export default router;
