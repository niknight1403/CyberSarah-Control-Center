#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah One-Click Seller v1.0                                   ║
║  Der schnellste Weg zu deinem ersten Verkauf!                      ║
║                                                                     ║
║  Ein Befehl — und du hast:                                          ║
║  - Einen fertigen Checkout-Link                                     ║
║  - Einen KI-generierten Marketing-Text                              ║
║  - Eine professionelle Verkaufsseite                                ║
║  - Alles bereit zum Teilen mit Kunden!                             ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 one-click-seller.py           # Interaktiv
        python3 one-click-seller.py --auto    # Automatisch (bestes Produkt)
        python3 one-click-seller.py --all     # ALLE Produkte auf einmal
"""

import os, sys, json, time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path

C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'w': '\033[1;97m',
    'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)
def dim(t): return clr('dim', t)

# ─── API Keys ──────────────────────────────────────────────────────

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

# ─── API Wrappers ──────────────────────────────────────────────────

def stripe_call(path, data=None):
    try:
        if data:
            encoded = "&".join(f"{k}={_url(v)}" for k, v in data.items())
            req = Request(f"https://api.stripe.com/v1/{path}", data=encoded.encode())
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
        else:
            req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)[:100]}

def _url(s): return str(s).replace(" ", "+").replace(":", "%3A").replace("/", "%2F").replace(",", "%2C")

def call_ai(prompt, max_tokens=1000):
    if not OPENAI_KEY: return None
    try:
        data = json.dumps({"model":"gpt-4o-mini","messages":[{"role":"user","content":prompt}],"max_tokens":max_tokens,"temperature":0.8}).encode()
        req = Request("https://api.openai.com/v1/chat/completions", data=data)
        req.add_header("Authorization", f"Bearer {OPENAI_KEY}")
        req.add_header("Content-Type", "application/json")
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read())["choices"][0]["message"]["content"]
    except: return None

# ─── Core Functions ───────────────────────────────────────────────

def get_products():
    """Holt alle Stripe Produkte"""
    result = stripe_call("products?limit=50&active=true")
    products = []
    for p in result.get("data", []):
        prices = stripe_call(f"prices?product={p['id']}&limit=1&active=true")
        price_data = prices.get("data", [{}])[0]
        amount = price_data.get("unit_amount", 0) or 0
        products.append({
            "id": p["id"],
            "name": p.get("name", "?"),
            "desc": p.get("description", "") or "Digitales Produkt",
            "price": amount / 100,
            "price_id": price_data.get("id", ""),
            "price_cents": amount,
        })
    return products

def create_checkout(price_id, product_name):
    """Erstellt einen Stripe Checkout-Link"""
    session = stripe_call("checkout/sessions", {
        "success_url": "https://167.233.196.20:3000/api/store?success=true",
        "cancel_url": "https://167.233.196.20:3000/api/store",
        "mode": "payment",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
    })
    return session.get("url", "❌ Fehler")

def generate_marketing(name, price, desc):
    """Erstellt KI-Marketing-Text"""
    prompt = f"""Erstelle einen kurzen Verkaufstext (max 200 Wörter) für:
Produkt: {name}
Preis: €{price:.2f}
Beschreibung: {desc}

Schreibe: Aufmerksame Überschrift, 2 Sätze Nutzen, Call-to-Action.
Zielgruppe: Deutschsprachige Unternehmer.
Mit Emojis und Hashtags."""
    return call_ai(prompt) or "KI nicht verfügbar — Produkt ist bereit zum Verkauf!"

def create_sales_page(name, price, desc, checkout_url, marketing_text):
    """Erstellt eine HTML-Verkaufsseite"""
    return f"""<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name} — CyberSarah Store</title>
<meta name="theme-color" content="#0a0a0f">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}}
.card{{background:linear-gradient(145deg,#111118,#16162a);border:1px solid #1f1f2e;border-radius:20px;padding:2rem;max-width:480px;width:100%;text-align:center}}
.badge{{display:inline-block;padding:0.2rem 0.6rem;border-radius:99px;font-size:0.75rem;font-weight:600;background:rgba(34,197,94,0.15);color:#22c55e;margin-bottom:1rem}}
h1{{font-size:1.4rem;margin-bottom:0.5rem;color:#f0f0f0}}
.price{{font-size:2.8rem;font-weight:800;color:#a855f7;margin:1rem 0;line-height:1}}
.price span{{font-size:1rem;color:#9ca3af;font-weight:400}}
.desc{{color:#9ca3af;font-size:0.9rem;margin-bottom:1.5rem;line-height:1.6}}
.marketing{{background:rgba(168,85,247,0.05);border-radius:12px;padding:1rem;margin:1.5rem 0;text-align:left;font-size:0.85rem;color:#d0d0d0;line-height:1.6}}
.btn{{display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;padding:1rem 2rem;border-radius:12px;font-weight:600;font-size:1.1rem;text-decoration:none;transition:all .2s;border:none;cursor:pointer;width:100%;background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff}}
.btn:hover{{transform:translateY(-2px);box-shadow:0 8px 30px rgba(168,85,247,0.3)}}
.features{{display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin:1.5rem 0;font-size:0.8rem}}
.features span{{padding:0.2rem 0.6rem;background:rgba(168,85,247,0.08);border-radius:99px;color:#a855f7}}
.footer{{margin-top:2rem;font-size:0.75rem;color:#6b7280}}
</style>
</head>
<body>
<div class="card">
  <span class="badge">🔥 Stripe LIVE — Sichere Zahlung</span>
  <h1>{name}</h1>
  <div class="price">€{price:.2f} <span>einmalig</span></div>
  <p class="desc">{desc}</p>
  <div class="marketing">{marketing_text}</div>
  <div class="features">
    <span>⚡ Sofort-Zugriff</span>
    <span>🔒 SSL-Verschlüsselt</span>
    <span>💳 Karte/PayPal</span>
    <span>🔄 14 Tage Geld-zurück</span>
  </div>
  <a class="btn" href="{checkout_url}" target="_blank">💰 Jetzt kaufen — €{price:.2f}</a>
  <div class="footer">CyberSarah Revenue OS • Stripe LIVE • {datetime.now().strftime('%d.%m.%Y')}</div>
</div>
</body>
</html>"""

# ─── Main ─────────────────────────────────────────────────────────

def sell_product(products, index=None, auto=False):
    """Verkauft ein Produkt: Erstellt Link + Marketing + Page"""
    if index is not None:
        p = products[index]
    else:
        # Bestes Produkt wählen (höchster Preis)
        p = max(products, key=lambda x: x['price'])
    
    print(f"\n  {bold(f'🛍️  {p[\"name\"]}')}")
    print(f"  {clr('g',f'💰 €{p[\"price\"]:.2f}')}")
    
    # Checkout-Link
    print(f"  🔗 Erstelle Checkout-Link...")
    checkout_url = create_checkout(p['price_id'], p['name'])
    if checkout_url and checkout_url != "❌ Fehler":
        print(f"  {clr('g','✅')} Link erstellt")
    else:
        print(f"  {clr('y','⚠️')} Kein Stripe-Link (Preis-ID fehlt)")
    
    # Marketing-Text
    print(f"  📝 Generiere Marketing-Text...")
    marketing = generate_marketing(p['name'], p['price'], p['desc'])
    if marketing:
        print(f"  {clr('g','✅')} Text erstellt")
        print(f"\n  {dim('─'*35)}")
        print(f"  {marketing[:300]}...")
        print(f"  {dim('─'*35)}")
    
    # Sales-Page
    print(f"  🏗️  Erstelle Verkaufsseite...")
    sales_page = create_sales_page(p['name'], p['price'], p['desc'], checkout_url, marketing or "")
    
    # Save everything
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe = p['name'].replace(' ', '_').replace('/', '-').lower()[:30]
    os.makedirs("sell_ready", exist_ok=True)
    
    # Save sales page
    page_file = f"sell_ready/{safe}_{ts}.html"
    with open(page_file, 'w') as f:
        f.write(sales_page)
    
    # Save info
    info_file = f"sell_ready/{safe}_{ts}.txt"
    with open(info_file, 'w') as f:
        f.write(f"=== VERKAUFSFERTIG ===\n")
        f.write(f"Produkt: {p['name']}\n")
        f.write(f"Preis: €{p['price']:.2f}\n")
        f.write(f"Checkout-Link: {checkout_url}\n")
        f.write(f"Verkaufsseite: {page_file}\n")
        f.write(f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')}\n\n")
        f.write(f"=== ZUM TEILEN ===\n")
        f.write(f"Checkout-Link:\n{checkout_url}\n\n")
        f.write(f"=== MARKETING-TEXT ===\n{marketing}\n")
    
    print(f"  💾 Gespeichert in: sell_ready/")
    print()
    
    # Show the share link
    print(f"  {bold('📤 ZUM TEILEN MIT KUNDEN:')}")
    print(f"  {clr('b',bold('🔗'))} Checkout: {checkout_url}")
    print(f"  {clr('b',bold('📄'))} Seite:    {page_file}")
    print()
    print(f"  {bold('💡 Einfach den Link kopieren und an Kunden senden!')}")
    
    return {"product": p['name'], "price": p['price'], "checkout": checkout_url, "page": page_file}

def sell_all(products):
    """Verkauft ALLE Produkte"""
    results = []
    for i, p in enumerate(products):
        print(f"\n  {bold(f'[{i+1}/{len(products)}]')} {p['name']}")
        try:
            result = sell_product(products, i, auto=True)
            results.append(result)
            time.sleep(2)
        except Exception as e:
            print(f"  {clr('r','❌')} Fehler: {str(e)[:50]}")
    
    # Create summary
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(f"sell_ready/ALL_PRODUCTS_{ts}.html", 'w') as f:
        f.write("""<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberSarah — Alle Produkte</title><meta name="theme-color" content="#0a0a0f">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;padding:1rem}
h1{text-align:center;font-size:1.4rem;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:1rem 0 2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;max-width:1000px;margin:0 auto}
.card{background:#111118;border:1px solid #1f1f2e;border-radius:14px;padding:1.2rem;text-align:center}
.card h3{font-size:1rem;margin-bottom:0.3rem;color:#f0f0f0}
.price{font-size:1.6rem;font-weight:700;color:#a855f7;margin:0.5rem 0}
.btn{display:block;background:linear-gradient(90deg,#a855f7,#7c3aed);color:#fff;padding:0.7rem;border-radius:10px;text-decoration:none;font-weight:600;font-size:0.9rem;margin-top:0.5rem}
.btn:hover{opacity:0.9}
.footer{text-align:center;padding:2rem;color:#6b7280;font-size:0.8rem}
</style>
</head>
<body>
<h1>🚀 CyberSarah Produkte</h1>
<div class="grid">\n""")
        for r in results:
            f.write(f'<div class="card"><h3>{r["product"]}</h3><div class="price">€{r["price"]:.2f}</div><a class="btn" href="{r["checkout"]}" target="_blank">💰 Jetzt kaufen</a></div>\n')
        f.write(f'</div><div class="footer">Stripe LIVE • {datetime.now().strftime("%d.%m.%Y")}</div></body></html>')
    
    print(f"\n  {clr('g',bold(f'✅ {len(results)} Produkte verkaufsfertig!'))}")
    return results

def main():
    print(f"{chr(27)}[2J{chr(27)}[H")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🛍️  CyberSarah One-Click Seller v1.0              ║'))}")
    print(f"{clr('p', bold('║  Der schnellste Weg zu deinem ersten Verkauf!      ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    
    if not STRIPE_KEY or "sk_live_" not in STRIPE_KEY:
        print(f"\n  {clr('r','❌ Kein LIVE Stripe-Key gefunden!')}")
        return
    
    print(f"\n  {clr('g',bold('🔥 Stripe LIVE-Modus'))}\n")
    
    products = get_products()
    if not products:
        print(f"  {clr('r','❌ Keine Produkte gefunden')}")
        return
    
    print(f"  {len(products)} Produkte geladen\n")
    
    # Auto mode
    if "--auto" in sys.argv:
        result = sell_product(products, auto=True)
        return
    
    if "--all" in sys.argv:
        sell_all(products)
        return
    
    # Interactive
    print(f"  {bold('Produkte:')}")
    for i, p in enumerate(products, 1):
        print(f"  {i}. {p['name'][:40]:40} {clr('g',f'€{p[\"price\"]:.2f}')}")
    
    print(f"\n  {bold('Optionen:')}")
    print(f"  [{clr('g','1')}]-[{clr('g',str(len(products)))}] Einzelnes Produkt verkaufen")
    print(f"  [{clr('g','a')}] {bold('ALLE Produkte verkaufen (empfohlen!)')}")
    print(f"  [{clr('g','b')}] Bestes Produkt automatisch")
    print(f"  [{clr('r','q')}] Beenden")
    
    try:
        choice = input(f"\n  {clr('y','▶')} Auswahl: ").strip().lower()
    except: return
    
    if choice == 'a':
        sell_all(products)
    elif choice == 'b':
        sell_product(products)
    elif choice.isdigit():
        idx = int(choice) - 1
        if 0 <= idx < len(products):
            sell_product(products, idx)
    elif choice == 'q':
        return
    
    print(f"\n  {clr('g','✅')} Dateien gespeichert in: {clr('b','sell_ready/')}")
    print(f"  {bold('📤 Einfach die Checkout-Links teilen und verkaufen!')}")

if __name__ == "__main__":
    main()
