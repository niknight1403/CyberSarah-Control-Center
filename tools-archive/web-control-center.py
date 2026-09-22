#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Web Control Center v1.0 — SPRINT 50 MILESTONE          ║
║  Die ultimative Weboberfläche für dein Revenue OS                  ║
║                                                                     ║
║  Alles in einem Browser:                                            ║
║  - 💰 Live-Revenue-Dashboard                                       ║
║  - 🛍️ Produkte + Checkout-Links                                   ║
║  - 📊 Analytics + Charts                                           ║
║  - 🤖 Tool-Launcher für alle Termux-Tools                          ║
║  - ⚡ One-Click-Verkauf                                             ║
║  - 🌐 Server-Status                                                ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 web-control-center.py
Dann:   http://localhost:8765
"""

import os, sys, json, time, socket, threading
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────

STRIPE_KEY = ""
OPENAI_KEY = ""
SERVER_URL = "http://167.233.196.20:3000"

env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line.startswith("STRIPE_SECRET_KEY="): STRIPE_KEY = line.split("=", 1)[1]
            elif line.startswith("OPENAI_API_KEY="): OPENAI_KEY = line.split("=", 1)[1]

PORT = 8765
START_TIME = datetime.now()

# ─── Stripe ─────────────────────────────────────────────────────────

def stripe_get(path):
    try:
        req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=10) as r: return json.loads(r.read())
    except: return {}

def stripe_post(path, data):
    try:
        enc = "&".join(f"{k}={str(v).replace(' ', '+').replace(':', '%3A').replace('/', '%2F')}" for k, v in data.items())
        req = Request(f"https://api.stripe.com/v1/{path}", data=enc.encode())
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urlopen(req, timeout=10) as r: return json.loads(r.read())
    except: return {"error": "API-Fehler"}

def get_stripe_data():
    """Holt Stripe-Daten + bereitet sie auf"""
    balance = stripe_get("balance")
    available = sum(b.get('amount',0) for b in balance.get('available',[]))/100
    pending = sum(b.get('amount',0) for b in balance.get('pending',[]))/100
    
    products = stripe_get("products?limit=50&active=true").get("data", [])
    enriched = []
    for p in products:
        prices = stripe_get(f"prices?product={p['id']}&limit=1&active=true")
        price_data = prices.get("data", [{}])[0]
        amount = price_data.get("unit_amount", 0) or 0
        enriched.append({
            "id": p["id"], "name": p.get("name","?"),
            "desc": (p.get("description") or "Digitalprodukt")[:100],
            "price": amount/100, "price_id": price_data.get("id",""),
        })
    
    charges = stripe_get("charges?limit=20").get("data", [])
    recent = []
    total_24h = 0
    for c in charges:
        amt = c.get('amount',0)/100
        created = datetime.fromtimestamp(c.get('created',0))
        status = c.get('status','')
        if status == 'succeeded':
            if created > datetime.now() - timedelta(hours=24):
                total_24h += amt
            recent.append({"amount": amt, "date": created.strftime("%d.%m."), "status": "✅"})
    
    return {
        "available": available, "pending": pending, "total": available + pending,
        "products": enriched, "product_count": len(enriched),
        "recent_charges": recent[-5:], "revenue_24h": total_24h,
    }

def create_checkout_link(price_id):
    session = stripe_post("checkout/sessions", {
        "success_url": f"http://localhost:{PORT}/success",
        "cancel_url": f"http://localhost:{PORT}",
        "mode": "payment",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    })
    return session.get("url", "")

# ─── HTML Template ─────────────────────────────────────────────────

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh}
nav{position:fixed;top:0;width:100%;z-index:100;background:rgba(10,10,15,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05)}
.nav-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;height:56px;padding:0 1rem;justify-content:space-between}
.nav-logo{font-weight:700;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:1rem}
.nav-links{display:flex;gap:1rem;font-size:0.82rem}
.nav-links a{color:#9ca3af;text-decoration:none;padding:0.3rem 0.6rem;border-radius:6px}
.nav-links a:hover{color:#a855f7;background:rgba(168,85,247,0.08)}
.nav-links a.active{color:#a855f7;background:rgba(168,85,247,0.08)}
.container{max-width:1100px;margin:0 auto;padding:4.5rem 1rem 2rem}
.row{display:flex;gap:1rem;flex-wrap:wrap}
.card{background:linear-gradient(145deg,#111118,#16162a);border:1px solid #1f1f2e;border-radius:14px;padding:1.2rem;flex:1;min-width:200px}
.card h3{color:#a855f7;font-size:0.85rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.4rem}
.val{font-size:1.6rem;font-weight:700}
.val.green{color:#22c55e}
.val.purple{color:#a855f7}
.val.blue{color:#06b6d4}
.sub{color:#6b7280;font-size:0.8rem;margin-top:0.2rem}
.product-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin-top:0.5rem}
.product-card{background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:1rem;transition:all .2s}
.product-card:hover{border-color:#a855f7}
.product-card h4{font-size:0.95rem;margin-bottom:0.3rem}
.product-card .price{font-size:1.3rem;font-weight:700;color:#a855f7;margin:0.3rem 0}
.product-card .desc{color:#9ca3af;font-size:0.78rem;margin-bottom:0.5rem;min-height:30px}
.btn{display:inline-block;padding:0.5rem 1rem;border-radius:8px;font-weight:600;font-size:0.82rem;text-decoration:none;border:none;cursor:pointer;transition:all .2s;text-align:center}
.btn-primary{background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(168,85,247,0.3)}
.btn-sm{padding:0.4rem 0.8rem;font-size:0.75rem}
.tool-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.8rem;margin-top:0.5rem}
.tool-item{background:#111118;border:1px solid #1f1f2e;border-radius:10px;padding:0.8rem;display:flex;align-items:center;gap:0.6rem;font-size:0.82rem}
.tool-item .icon{font-size:1.2rem}
.tool-item .cmd{color:#a855f7;font-family:monospace;font-size:0.72rem;margin-top:0.2rem}
table{width:100%;border-collapse:collapse;font-size:0.82rem}
td,th{padding:0.5rem;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05)}
th{color:#a855f7;font-weight:600;font-size:0.75rem}
td{color:#d0d0d0}
.badge{display:inline-block;padding:0.15rem 0.4rem;border-radius:99px;font-size:0.65rem;font-weight:600}
.badge-green{background:rgba(34,197,94,0.15);color:#22c55e}
.badge-yellow{background:rgba(245,158,11,0.15);color:#f59e0b}
.badge-purple{background:rgba(168,85,247,0.15);color:#a855f7}
footer{text-align:center;padding:2rem;color:#6b7280;font-size:0.75rem}
@keyframes spin{to{transform:rotate(360deg)}}
.loading{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.1);border-top-color:#a855f7;border-radius:50%;animation:spin .8s linear infinite}
@media(max-width:600px){.product-grid{grid-template-columns:1fr}.tool-grid{grid-template-columns:1fr}}
"""

PAGE = """<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberSarah Control Center</title><meta name="theme-color" content="#0a0a0f">
<style>{CSS}</style></head>
<body>
<nav><div class="nav-inner">
  <span class="nav-logo">🚀 CyberSarah</span>
  <div class="nav-links">
    <a href="/" class="active">💰 Dashboard</a>
    <a href="/products">🛍️ Produkte</a>
    <a href="/tools">🛠️ Tools</a>
    <a href="/server">🌐 Server</a>
  </div>
</div></nav>
<div class="container" id="app">
  <div style="text-align:center;padding:4rem;color:#6b7280"><div class="loading" style="margin:0 auto 0.5rem"></div>Lade Daten...</div>
</div>
<script>
const API = '';
let stripeData = null;

async function loadJSON(url) {{
  try {{
    const r = await fetch(url, {{cache:'no-cache',signal:AbortSignal.timeout(8000)}});
    return r.ok ? await r.json() : null;
  }} catch {{ return null }}
}}

async function loadDashboard() {{
  const data = await loadJSON('/api/data');
  if (!data) {{ document.getElementById('app').innerHTML = '<div style="text-align:center;padding:4rem;color:#ef4444">❌ Server nicht erreichbar</div>'; return; }}
  stripeData = data;
  
  const html = `
    <div class="row">
      <div class="card"><h3>💰 Verfügbar</h3><div class="val green">€${data.available.toFixed(2)}</div><div class="sub">${data.product_count} Produkte</div></div>
      <div class="card"><h3>⏳ Ausstehend</h3><div class="val purple">€${data.pending.toFixed(2)}</div><div class="sub">24h: €${data.revenue_24h.toFixed(2)}</div></div>
      <div class="card"><h3>📦 Gesamtwert</h3><div class="val blue">€${data.total.toFixed(2)}</div><div class="sub">Stripe LIVE 💰</div></div>
    </div>
    
    <div class="card" style="margin-top:1rem">
      <h3>🛍️ Produkte (${data.product_count})</h3>
      <div class="product-grid">
        ${data.products.map(p => `
          <div class="product-card">
            <h4>${p.name}</h4>
            <div class="price">€${p.price.toFixed(2)}</div>
            <div class="desc">${p.desc}</div>
            <button class="btn btn-primary btn-sm" onclick="createCheckout('${p.price_id}','${p.name.replace(/'/g,"\\\\'")}')">🔗 Checkout-Link</button>
          </div>
        `).join('')}
      </div>
    </div>
    
    ${data.recent_charges.length > 0 ? `
    <div class="card" style="margin-top:1rem">
      <h3>💳 Letzte Transaktionen</h3>
      <table><tr><th>Datum</th><th>Betrag</th><th>Status</th></tr>
      ${data.recent_charges.map(c => `<tr><td>${c.date}</td><td>€${c.amount.toFixed(2)}</td><td>${c.status}</td></tr>`).join('')}
      </table>
    </div>` : ''}
    
    <div class="card" style="margin-top:1rem">
      <h3>⚡ Quick-Aktionen</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
        <button class="btn btn-primary" onclick="window.open('/products','_self')">🛍️ Alle Produkte</button>
        <button class="btn btn-primary" onclick="window.open('/tools','_self')">🛠️ Tools</button>
        <button class="btn btn-primary" onclick="location.reload()">🔄 Aktualisieren</button>
      </div>
    </div>
  `;
  document.getElementById('app').innerHTML = html;
}}

async function createCheckout(priceId, name) {{
  if (!priceId) {{ alert('❌ Kein Preis verfügbar'); return; }}
  const url = await loadJSON('/api/checkout/' + priceId);
  if (url) {{
    const msg = prompt(`✅ Checkout-Link für ${name}:\n${url}\n\nDrücke Enter zum Öffnen im Browser`, url);
    if (msg) window.open(url, '_blank');
  }} else {{
    alert('❌ Fehler beim Erstellen des Links');
  }}
}}

loadDashboard();
</script>
<footer>CyberSarah Web Control Center • Sprint 50 Milestone • Stripe LIVE 💰</footer>
</body></html>
"""

TOOLS_PAGE = """<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tools — CyberSarah</title><meta name="theme-color" content="#0a0a0f">
<style>{CSS}</style></head>
<body>
<nav><div class="nav-inner">
  <span class="nav-logo">🚀 CyberSarah</span>
  <div class="nav-links">
    <a href="/">💰 Dashboard</a>
    <a href="/products">🛍️ Produkte</a>
    <a href="/tools" class="active">🛠️ Tools</a>
    <a href="/server">🌐 Server</a>
  </div>
</div></nav>
<div class="container">
  <h2 style="margin-bottom:0.5rem">🛠️ Termux-Tools</h2>
  <p style="color:#9ca3af;font-size:0.85rem;margin-bottom:1.5rem">Alle Befehle für die Kommandozeile</p>
  <div class="tool-grid">
    <div class="tool-item"><div><div class="icon">⚡</div></div><div><b>One-Click Seller</b><div class="cmd">python3 one-click-seller.py --auto</div></div></div>
    <div class="tool-item"><div><div class="icon">🛍️</div></div><div><b>Sales Server</b><div class="cmd">python3 sales-server.py</div></div></div>
    <div class="tool-item"><div><div class="icon">🚀</div></div><div><b>Product Launch</b><div class="cmd">python3 product-launch-system.py</div></div></div>
    <div class="tool-item"><div><div class="icon">💳</div></div><div><b>Stripe Dashboard</b><div class="cmd">python3 stripe-dashboard.py</div></div></div>
    <div class="tool-item"><div><div class="icon">🤖</div></div><div><b>Master Automation</b><div class="cmd">python3 master-automation.py</div></div></div>
    <div class="tool-item"><div><div class="icon">🎮</div></div><div><b>Command Center</b><div class="cmd">python3 cybersarah-command-center.py</div></div></div>
    <div class="tool-item"><div><div class="icon">📱</div></div><div><b>Content Engine</b><div class="cmd">python3 social-content-engine.py --all</div></div></div>
    <div class="tool-item"><div><div class="icon">💬</div></div><div><b>WhatsApp</b><div class="cmd">python3 whatsapp-campaign.py --auto</div></div></div>
  </div>
</div>
<footer>CyberSarah Web Control Center • Sprint 50 Milestone</footer>
</body></html>
"""

SERVER_PAGE = """<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Server — CyberSarah</title><meta name="theme-color" content="#0a0a0f">
<style>{CSS}</style></head>
<body>
<nav><div class="nav-inner">
  <span class="nav-logo">🚀 CyberSarah</span>
  <div class="nav-links">
    <a href="/">💰 Dashboard</a>
    <a href="/products">🛍️ Produkte</a>
    <a href="/tools">🛠️ Tools</a>
    <a href="/server" class="active">🌐 Server</a>
  </div>
</div></nav>
<div class="container" id="app">
  <div style="text-align:center;padding:4rem;color:#6b7280"><div class="loading" style="margin:0 auto 0.5rem"></div>Prüfe Server...</div>
</div>
<script>
async function load() {{
  const html = document.getElementById('app');
  try {{
    const s = await (await fetch('http://167.233.196.20:3000/api/system-status',{{signal:AbortSignal.timeout(5000)}})).json();
    const a = await (await fetch('http://167.233.196.20:3000/api/agents',{{signal:AbortSignal.timeout(5000)}})).json();
    html.innerHTML = `
      <div class="row">
        <div class="card"><h3>🌐 Server</h3><div class="val green">Online</div><div class="sub">Hetzner VPS</div></div>
        <div class="card"><h3>🤖 Agenten</h3><div class="val purple">${a.length}</div><div class="sub">registriert</div></div>
        <div class="card"><h3>💳 Stripe</h3><div class="val blue">${s.stripeVerfuegbar ? 'LIVE ✅' : '❌'}</div></div>
        <div class="card"><h3>🧠 OpenAI</h3><div class="val blue">${s.openaiVerfuegbar ? '✅ Aktiv' : '❌'}</div></div>
      </div>
      <div class="card" style="margin-top:1rem">
        <h3>🚀 Deployment</h3>
        <p style="color:#9ca3af;font-size:0.85rem;margin:0.5rem 0">Server aktualisieren:</p>
        <code style="display:block;background:#0a0a0f;padding:0.6rem;border-radius:8px;font-size:0.78rem;color:#a855f7;margin-bottom:0.5rem">bash deploy-now.sh --password=DEIN_PASS</code>
        <a class="btn btn-primary" href="http://167.233.196.20:3000" target="_blank">🌐 Server öffnen</a>
      </div>
    `;
  }} catch {{
    html.innerHTML = '<div class="card" style="text-align:center;padding:3rem"><h3 style="color:#ef4444">❌ Server offline</h3><p style="color:#9ca3af;margin-top:0.5rem">Lokale Tools funktionieren trotzdem!</p></div>';
  }}
}}
load();
</script>
<footer>CyberSarah Web Control Center • Sprint 50 Milestone</footer>
</body></html>
"""

PRODUCTS_PAGE = """<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Produkte — CyberSarah</title><meta name="theme-color" content="#0a0a0f">
<style>{CSS}</style></head>
<body>
<nav><div class="nav-inner">
  <span class="nav-logo">🚀 CyberSarah</span>
  <div class="nav-links">
    <a href="/">💰 Dashboard</a>
    <a href="/products" class="active">🛍️ Produkte</a>
    <a href="/tools">🛠️ Tools</a>
    <a href="/server">🌐 Server</a>
  </div>
</div></nav>
<div class="container" id="app">
  <div style="text-align:center;padding:4rem;color:#6b7280"><div class="loading" style="margin:0 auto 0.5rem"></div>Lade Produkte...</div>
</div>
<script>
async function load() {{
  const data = await (await fetch('/api/data')).json();
  if (!data) return;
  const html = '<h2 style="margin-bottom:1rem">🛍️ Alle Produkte (' + data.product_count + ')</h2><div class="product-grid">' +
    data.products.map(p => `
      <div class="product-card">
        <h4>${p.name}</h4>
        <div class="price">€${p.price.toFixed(2)}</div>
        <div class="desc">${p.desc}</div>
        <button class="btn btn-primary btn-sm" onclick="createCheckout('${p.price_id}','${p.name.replace(/'/g,"\\\\'")}')">🔗 Checkout-Link</button>
      </div>
    `).join('') + '</div>';
  document.getElementById('app').innerHTML = html;
}}
async function createCheckout(priceId, name) {{
  const url = await (await fetch('/api/checkout/' + priceId)).json();
  if (url) {{
    const r = prompt(`✅ Checkout-Link für ${name}:\\n\\n${url}\\n\\nEnter = Im Browser öffnen`, url);
    if (r) window.open(url, '_blank');
  }}
}}
load();
</script>
<footer>CyberSarah Web Control Center • Sprint 50 Milestone</footer>
</body></html>
"""

# ─── HTTP Handler ───────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        
        if path == "/" or path == "/dashboard":
            self.send_html(PAGE.format(CSS=CSS))
        elif path == "/tools":
            self.send_html(TOOLS_PAGE.format(CSS=CSS))
        elif path == "/server":
            self.send_html(SERVER_PAGE.format(CSS=CSS))
        elif path == "/products":
            self.send_html(PRODUCTS_PAGE.format(CSS=CSS))
        elif path == "/success":
            self.send_html(f"<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Erfolg!</title><meta name='theme-color' content='#0a0a0f'><style>body{{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh}} .card{{background:#111118;border:1px solid #1f1f2e;border-radius:16px;padding:2rem;text-align:center;max-width:400px}} .btn{{display:inline-block;padding:0.7rem 1.5rem;border-radius:10px;background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;font-weight:600;margin-top:1rem}}</style></head><body><div class='card'><div style='font-size:3rem'>🎉</div><h2 style='margin:0.5rem 0'>Zahlung erfolgreich!</h2><p style='color:#9ca3af'>Vielen Dank für deinen Kauf.</p><a class='btn' href='/'>← Zurück</a></div></body></html>")
        elif path.startswith("/api/data"):
            self.send_json(get_stripe_data())
        elif path.startswith("/api/checkout/"):
            price_id = path[13:]
            url = create_checkout_link(price_id)
            self.send_json(url if url else "")
        else:
            self.send_error(404)
    
    def send_html(self, html):
        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())
    
    def send_json(self, data):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/" not in msg:
            print(f"  {msg}")

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]; s.close(); return ip
    except: return "127.0.0.1"

def main():
    print(f"{chr(27)}[2J{chr(27)}[H")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🌐 CyberSarah Web Control Center v1.0            ║'))}")
    print(f"{clr('p', bold('║  SPRINT 50 MILESTONE                              ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    
    if not STRIPE_KEY or "sk_live_" not in STRIPE_KEY:
        print(f"\n  {clr('r','❌ Kein Stripe LIVE-Key!')}")
        return
    
    data = get_stripe_data()
    print(f"\n  {clr('g',bold(f'🔥 Stripe LIVE — {data[\"product_count\"]} Produkte, €{data[\"available\"]:.2f} verfügbar'))}")
    print()
    
    ip = get_ip()
    print(f"  ┌─────────────────────────────────────────────┐")
    print(f"  │  {'🌐 Web Control Center läuft!':47}│")
    print(f"  │                                             │")
    print(f"  │  {'Lokal:':20} http://localhost:{PORT}             │")
    print(f"  │  {'WLAN:':20} http://{ip}:{PORT}            │")
    print(f"  │                                             │")
    print(f"  │  {'Dashboard:':20} http://localhost:{PORT}/        │")
    print(f"  │  {'Produkte:':20} http://localhost:{PORT}/products │")
    print(f"  │  {'Tools:':20} http://localhost:{PORT}/tools      │")
    print(f"  │  {'Server:':20} http://localhost:{PORT}/server     │")
    print(f"  └─────────────────────────────────────────────┘")
    print(f"\n  {dim('Drücke Ctrl+C zum Beenden')}\n")
    
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    try: server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n  {clr('g','👋 Server gestoppt')}\n")
        server.server_close()

def clr(c, t): 
    C = {'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m', 'r': '\033[0;91m', 'b': '\033[0;96m', 'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m'}
    return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)
def dim(t): return clr('dim', t)

if __name__ == "__main__":
    main()
