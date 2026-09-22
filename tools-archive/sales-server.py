#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Sales Server v1.0                                        ║
║  Verkaufs-Server für Termux — läuft auf deinem Handy!              ║
║                                                                     ║
║  Stellt bereit:                                                     ║
║  - 🏠 Verkaufsseite mit ALLEN Stripe LIVE Produkten                ║
║  - 🛍️ Einzelne Produktseiten mit Checkout                         ║
║  - 🔗 Stripe Checkout-Links                                        ║
║  - 📊 Verkaufs-Statistiken                                         ║
║                                                                     ║
║  KEIN Hetzner-Server nötig! Läuft komplett lokal in Termux!        ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 sales-server.py
Dann:   http://localhost:8765 (oder http://HANDY_IP:8765 im WLAN)
"""

import os, sys, json, time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import socket

# ─── Config ──────────────────────────────────────────────────────────

STRIPE_KEY = ""
OPENAI_KEY = ""

env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line.startswith("STRIPE_SECRET_KEY="):
                STRIPE_KEY = line.split("=", 1)[1]
            elif line.startswith("OPENAI_API_KEY="):
                OPENAI_KEY = line.split("=", 1)[1]

PORT = 8765
PRODUCTS_CACHE = []
LAST_REFRESH = 0

# ─── Colors ──────────────────────────────────────────────────────────

C = {'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m', 'r': '\033[0;91m', 'b': '\033[0;96m', 'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m'}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

# ─── Stripe API ──────────────────────────────────────────────────────

def stripe_get(path):
    try:
        req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except: return {}

def stripe_post(path, data):
    try:
        encoded = "&".join(f"{k}={urlencode(str(v))}" for k, v in data.items())
        req = Request(f"https://api.stripe.com/v1/{path}", data=encoded.encode())
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except: return {}

def urlencode(s):
    return s.replace(" ", "+").replace(":", "%3A").replace("/", "%2F").replace(",", "%2C")

def get_products():
    global PRODUCTS_CACHE, LAST_REFRESH
    now = time.time()
    if now - LAST_REFRESH < 60 and PRODUCTS_CACHE:
        return PRODUCTS_CACHE
    
    result = stripe_get("products?limit=50&active=true")
    products = result.get("data", [])
    
    enriched = []
    for p in products:
        prices = stripe_get(f"prices?product={p['id']}&limit=1&active=true")
        price_data = prices.get("data", [{}])[0]
        amount = price_data.get("unit_amount", 0) or 0
        enriched.append({
            "id": p["id"],
            "name": p.get("name", "Unbekannt"),
            "description": p.get("description", "") or "Keine Beschreibung",
            "price_cents": amount,
            "price_eur": amount / 100,
            "price_id": price_data.get("id", ""),
            "currency": price_data.get("currency", "eur"),
            "images": p.get("images", []),
        })
    
    PRODUCTS_CACHE = enriched
    LAST_REFRESH = now
    return enriched

def create_checkout(product_id, price_id):
    session = stripe_post("checkout/sessions", {
        "success_url": f"http://localhost:{PORT}/success.html",
        "cancel_url": f"http://localhost:{PORT}/",
        "mode": "payment",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "payment_intent_data[description]": f"CyberSarah Produkt",
    })
    return session.get("url", "")

# ─── HTML Generator ─────────────────────────────────────────────────

CSS = """
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6}
.header{background:linear-gradient(135deg,#1a0a2e,#0d0d1a);padding:2rem 1rem;text-align:center;border-bottom:1px solid #2a1a4e}
.header h1{font-size:1.8rem;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#9ca3af;margin-top:0.5rem}
.container{max-width:900px;margin:0 auto;padding:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem}
.card{background:#111118;border:1px solid #1f1f2e;border-radius:16px;padding:1.5rem;transition:all .3s}
.card:hover{border-color:#a855f7;transform:translateY(-2px)}
.card h3{color:#f0f0f0;font-size:1.1rem;margin-bottom:0.5rem}
.card .price{font-size:1.8rem;font-weight:700;color:#a855f7;margin:0.5rem 0}
.card p{color:#9ca3af;font-size:0.9rem;margin-bottom:1rem;min-height:40px}
.btn{display:inline-block;background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff;padding:0.8rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.95rem;border:none;cursor:pointer;width:100%;text-align:center;transition:all .2s}
.btn:hover{opacity:0.9;transform:scale(1.02)}
.btn:active{transform:scale(0.98)}
.status-bar{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin:1rem 0;padding:1rem;background:#111118;border-radius:12px;border:1px solid #1f1f2e}
.status-item{text-align:center;padding:0.5rem 1rem}
.status-item .label{color:#9ca3af;font-size:0.8rem}
.status-item .value{color:#a855f7;font-size:1.2rem;font-weight:700}
.footer{text-align:center;padding:2rem;color:#6b7280;font-size:0.85rem}
.badge{display:inline-block;padding:0.2rem 0.6rem;border-radius:99px;font-size:0.75rem;font-weight:600;margin-bottom:0.5rem}
.badge-green{background:rgba(34,197,94,0.15);color:#22c55e}
.tag{display:inline-block;background:rgba(168,85,247,0.1);color:#a855f7;padding:0.2rem 0.6rem;border-radius:6px;font-size:0.7rem;margin:0.2rem}
"""

def render_page(title, body):
    return f"""<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>{CSS}</style></head>
<body>
<div class="header">
  <h1>🚀 CyberSarah Store</h1>
  <p>KI-gestützte Produkte für deinen Erfolg</p>
</div>
<div class="container">{body}</div>
<div class="footer">CyberSarah Revenue OS • Stripe LIVE 💰 • {datetime.now().strftime('%d.%m.%Y')}</div>
</body></html>"""

def render_home(products):
    balance = stripe_get("balance")
    available = sum(b.get('amount',0) for b in balance.get('available',[]))/100
    
    product_cards = ""
    for p in products:
        desc = (p['description'][:100] + '...') if len(p['description']) > 100 else p['description']
        product_cards += f"""
        <div class="card">
          <span class="badge badge-green">LIVE</span>
          <h3>{p['name']}</h3>
          <div class="price">€{p['price_eur']:.2f}</div>
          <p>{desc}</p>
          <a class="btn" href="/buy/{p['id']}">🔥 Jetzt kaufen</a>
        </div>"""
    
    return render_page("CyberSarah Store", f"""
    <div class="status-bar">
      <div class="status-item"><div class="label">Stripe</div><div class="value">LIVE 💰</div></div>
      <div class="status-item"><div class="label">Produkte</div><div class="value">{len(products)}</div></div>
      <div class="status-item"><div class="label">Verfügbar</div><div class="value">€{available:.2f}</div></div>
    </div>
    <div class="grid">{product_cards}</div>
    """)

def render_product(products, product_id):
    p = next((p for p in products if p['id'] == product_id), None)
    if not p: return render_page("Nicht gefunden", "<h2>❌ Produkt nicht gefunden</h2><a href='/' class='btn' style='max-width:200px;margin-top:1rem'>Zurück</a>")
    
    checkout_url = create_checkout(p['id'], p['price_id']) if p['price_id'] else ""
    checkout_html = f"<a class='btn' href='{checkout_url}' target='_blank'>🔥 Jetzt kaufen — €{p['price_eur']:.2f}</a>" if checkout_url else "<p style='color:#ef4444'>Kein Checkout-Link verfügbar</p>"
    
    return render_page(p['name'], f"""
    <a href="/" style="color:#a855f7;text-decoration:none;font-size:0.9rem">← Zurück zum Store</a>
    <div class="card" style="max-width:500px;margin:1rem auto;text-align:center">
      <span class="badge badge-green">Stripe LIVE</span>
      <h3 style="font-size:1.3rem;margin-top:0.5rem">{p['name']}</h3>
      <div class="price">€{p['price_eur']:.2f}</div>
      <p style="font-size:1rem">{p['description']}</p>
      <div style="margin:1rem 0">
        <span class="tag">Sofort-Download</span>
        <span class="tag">SSL-gesichert</span>
        <span class="tag">14 Tage Geld-zurück</span>
      </div>
      {checkout_html}
    </div>
    """)

# ─── HTTP Handler ───────────────────────────────────────────────────

class SalesHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        products = get_products()
        path = self.path
        
        if path == "/" or path == "/index.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_home(products).encode())
        elif path.startswith("/buy/"):
            product_id = path[5:]
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_product(products, product_id).encode())
        elif path == "/success.html":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_page(" Kauf erfolgreich!", """
            <div style="text-align:center;padding:3rem 1rem">
              <div style="font-size:4rem;margin-bottom:1rem">🎉</div>
              <h2>Zahlung erfolgreich!</h2>
              <p style="color:#9ca3af;margin:1rem 0">Vielen Dank für deinen Kauf.</p>
              <a class="btn" href="/" style="max-width:200px;margin:0 auto">→ Zum Store</a>
            </div>""").encode())
        elif path == "/api/status":
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            balance = stripe_get("balance")
            available = sum(b.get('amount',0) for b in balance.get('available',[]))/100
            self.wfile.write(json.dumps({
                "stripe": "live",
                "products": len(products),
                "balance": available,
                "uptime": str(datetime.now() - START_TIME).split('.')[0],
            }).encode())
        else:
            self.send_response(404)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_page("404", "<h2>❌ Seite nicht gefunden</h2><a href='/' class='btn' style='max-width:200px;margin-top:1rem'>Zurück zum Store</a>").encode())
    
    def log_message(self, format, *args):
        msg = format % args
        if "GET /api/" not in msg:
            print(f"  {clr('b','📡')} {msg}")

# ─── Main ────────────────────────────────────────────────────────────

START_TIME = datetime.now()

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def main():
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🛍️  CyberSarah Sales Server v1.0                  ║'))}")
    print(f"{clr('p', bold('║  Verkaufs-Server — läuft auf DEINEM Handy!         ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    
    if not STRIPE_KEY or not STRIPE_KEY.startswith("sk_live_"):
        print(f"\n  {clr('r','❌ Kein LIVE Stripe-Key!')}")
        return
    
    products = get_products()
    if not products:
        print(f"\n  {clr('r','❌ Keine Produkte geladen')}")
        return
    
    print(f"\n  {clr('g',bold(f'🔥 Stripe LIVE — {len(products)} Produkte gefunden!'))}")
    print()
    print(f"  ┌─────────────────────────────────────────────┐")
    print(f"  │  {bold('🌐 Server läuft!')}                      │")
    print(f"  │                                             │")
    print(f"  │  {clr('b','Lokal:')}    http://localhost:{PORT}            │")
    print(f"  │  {clr('b','WLAN:')}     http://{get_ip()}:{PORT}     │")
    print(f"  │                                             │")
    print(f"  │  {dim('Im WLAN vom Handy/Tablet öffnen!')}          │")
    print(f"  └─────────────────────────────────────────────┘")
    print()
    print(f"  {bold('Produkte:')}")
    for i, p in enumerate(products, 1):
        print(f"    {i}. {p['name'][:45]:45} €{p['price_eur']:.2f}")
    print()
    print(f"  {clr('dim','Drücke Ctrl+C zum Beenden')}")
    print()
    
    server = HTTPServer(("0.0.0.0", PORT), SalesHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n\n  {clr('g','👋 Server gestoppt')}\n")
        server.server_close()

if __name__ == "__main__":
    main()
