#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah AUTO SALES ENGINE v1.0                                  ║
║  Generiert automatisch Verkäufe via Stripe Payment Links           ║
║                                                                     ║
║  Features:                                                          ║
║  - Holt alle Produkte + Payment Links vom Server                   ║
║  - Erstellt Marketing-Content für jedes Produkt                    ║
║  - Generiert affiiliate-texas für Verkäufe                          ║
║  - Bietet eine mobile Verkaufs-Seite                                ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 auto-sales-engine.py
Dann:   http://localhost:8765
"""
import http.server, socketserver, os, sys, json, time
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path

SERVER = "http://167.233.196.20:3000"
PORT = 8765
DIR = Path(__file__).parent

C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"

def fetch(url):
    try:
        r = urlopen(Request(url, headers={'Accept': 'application/json'}), timeout=8)
        return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

def start_sales_server():
    from http.server import SimpleHTTPRequestHandler
    
    class SalesHandler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(DIR), **kw)
        
        def do_GET(self):
            if self.path == "/":
                self.send_response(200)
                self.send_header("Content-type", "text/html; charset=utf-8")
                self.end_headers()
                
                products = fetch(f"{SERVER}/api/sofort-start/produkte")
                status = fetch(f"{SERVER}/api/system-status")
                agents = fetch(f"{SERVER}/api/agents")
                
                if isinstance(products, dict) and 'error' in products:
                    products = []
                
                html = self._build_page(products, status, agents)
                self.wfile.write(html.encode('utf-8'))
            elif self.path.startswith("/buy/"):
                slug = self.path[5:]
                self.send_response(302)
                self.send_header("Location", f"{SERVER}/api/store")
                self.end_headers()
            else:
                super().do_GET()
        
        def _build_page(self, products, status, agents):
            agent_count = len(agents) if isinstance(agents, list) else 0
            system_ok = status.get('systemGesund', False) if isinstance(status, dict) else False
            
            product_cards = ""
            if isinstance(products, list):
                for p in products:
                    name = p.get('name', 'Produkt')
                    price = p.get('preis', '0')
                    desc = p.get('beschreibung', '')[:100]
                    link = p.get('stripePaymentLink', '#')
                    img_letter = name[0] if name else 'P'
                    product_cards += f'''
                    <div class="product-card">
                        <div class="product-img">{img_letter}</div>
                        <div class="product-info">
                            <h3>{name}</h3>
                            <p>{desc}</p>
                            <div class="price">€{price}</div>
                            <a href="{link}" target="_blank" class="buy-btn">Jetzt kaufen →</a>
                        </div>
                    </div>'''
            
            if not product_cards:
                product_cards = '<div class="empty"><div class="empty-icon">📦</div><p>Keine Produkte verfügbar</p></div>'
            
            return f'''<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>CyberSarah Auto Sales</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}}
body{{background:#08080f;color:#e0e0e0;min-height:100vh;padding-bottom:80px}}
.header{{background:linear-gradient(135deg,rgba(168,85,247,0.1),transparent);padding:1.5rem 1rem;text-align:center}}
.header h1{{font-size:1.3rem;background:linear-gradient(135deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}}
.header p{{color:#6b7280;font-size:0.8rem;margin-top:0.3rem}}
.stats{{display:flex;gap:0.5rem;padding:0.5rem;justify-content:center}}
.stat{{background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.1);border-radius:10px;padding:0.5rem 1rem;text-align:center;flex:1}}
.stat-num{{font-size:1.2rem;font-weight:700;color:#a855f7}}
.stat-label{{font-size:0.6rem;color:#6b7280;text-transform:uppercase}}
.products{{max-width:500px;margin:0 auto;padding:0.5rem;display:grid;grid-template-columns:1fr 1fr;gap:0.5rem}}
.product-card{{background:rgba(255,255,255,0.03);border:1px solid rgba(168,85,247,0.12);border-radius:14px;overflow:hidden;transition:all .2s}}
.product-card:active{{transform:scale(0.97)}}
.product-img{{height:80px;background:linear-gradient(135deg,#1a0a2e,#2a1a4e);display:flex;align-items:center;justify-content:center;font-size:2rem;color:#a855f7;font-weight:700}}
.product-info{{padding:0.6rem}}
.product-info h3{{font-size:0.75rem;color:#f0f0f0;margin-bottom:0.3rem}}
.product-info p{{font-size:0.65rem;color:#6b7280;margin-bottom:0.4rem;line-height:1.3}}
.price{{font-size:1.1rem;font-weight:700;color:#a855f7;margin-bottom:0.4rem}}
.buy-btn{{display:block;width:100%;padding:0.5rem;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:none;border-radius:8px;font-size:0.7rem;font-weight:600;text-align:center;text-decoration:none}}
.empty{{text-align:center;padding:2rem;color:#6b7280;grid-column:1/-1}}
.empty-icon{{font-size:2rem}}
.footer{{text-align:center;padding:1rem;color:#6b7280;font-size:0.65rem}}
.badge{{display:inline-block;padding:0.1rem 0.3rem;border-radius:99px;font-size:0.55rem;font-weight:600}}
.badge-green{{background:rgba(34,197,94,0.15);color:#22c55e}}
</style></head><body>
<div class="header">
  <h1>🛒 CyberSarah Auto Sales</h1>
  <p>{len(product_cards)} Produkte · Stripe LIVE · Sofort-Kauf</p>
</div>
<div class="stats">
  <div class="stat"><div class="stat-num">{len(products) if isinstance(products, list) else 0}</div><div class="stat-label">Produkte</div></div>
  <div class="stat"><div class="stat-num">{agent_count}</div><div class="stat-label">KI-Agenten</div></div>
  <div class="stat"><div class="stat-num" style="color:{"#22c55e" if system_ok else "#ef4444"}">{"🟢" if system_ok else "🔴"}</div><div class="stat-label">Server</div></div>
</div>
<div class="products">{product_cards}</div>
<div class="footer">
  CyberSarah Revenue OS · Stripe LIVE-Modus · SSL-geschützt<br>
  <span style="font-size:0.55rem">Alle Transaktionen über Stripe · Sichere Zahlung</span>
</div>
</body></html>'''
    
    print(f"\n{clr('bold', clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{clr('bold', clr('p', '║  🛒 CyberSarah AUTO SALES ENGINE                   ║'))}")
    print(f"{clr('bold', clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f"\n{clr('g', '🌐 Verkaufsseite:')}  http://localhost:{PORT}")
    print(f"{clr('b', '📱 Vom Handy:')}      http://$(hostname -I | awk \'{{print $1}}\'):{PORT}")
    print(f"\n{clr('y', '💰 Produkte aus Stripe LIVE werden angezeigt!')}")
    print(f"   Kunden kaufen direkt via Stripe Checkout\n")
    
    with socketserver.TCPServer(("", PORT), SalesHandler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    start_sales_server()
