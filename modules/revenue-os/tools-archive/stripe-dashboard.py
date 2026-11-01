#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Stripe LIVE Dashboard v1.0                              ║
║  Direkter Stripe-API-Zugriff — KEIN Server nötig!                  ║
║                                                                     ║
║  Zeigt LIVE-Produkte, erstellt neue, generiert Checkout-Links      ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 stripe-dashboard.py
"""

import os, sys, json, time, base64
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path

C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'w': '\033[1;97m',
    'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
    'cls': '\033[2J\033[H',
}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)
def dim(t): return clr('dim', t)

# ─── Stripe API Key ──────────────────────────────────────────────────

STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY") or ""
if not STRIPE_KEY:
    try:
        with open(Path(__file__).parent / ".env") as f:
            for line in f:
                if line.startswith("STRIPE_SECRET_KEY="):
                    STRIPE_KEY = line.strip().split("=", 1)[1]
                    break
    except:
        pass

if not STRIPE_KEY or not STRIPE_KEY.startswith("sk_live_"):
    print(f"{clr('r','❌ Kein LIVE Stripe-Key gefunden!')}")
    print(f"  Setze STRIPE_SECRET_KEY=sk_live_... in .env")
    sys.exit(1)

LIVE_MODE = "sk_live_" in STRIPE_KEY

# ─── Stripe API Wrapper ─────────────────────────────────────────────

def stripe_get(path):
    try:
        req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except URLError as e:
        return {"error": str(e.reason if hasattr(e, 'reason') else e)}
    except Exception as e:
        return {"error": str(e)}

def stripe_post(path, data):
    try:
        encoded = "&".join(f"{k}={urlencode(str(v))}" for k, v in data.items())
        req = Request(f"https://api.stripe.com/v1/{path}", data=encoded.encode())
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except URLError as e:
        body = e.read().decode() if hasattr(e, 'read') else str(e)
        try: return json.loads(body)
        except: return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

def urlencode(s):
    return str(s).replace(" ", "+").replace(",", "%2C").replace(":", "%3A").replace("/", "%2F").replace("'", "%27")

# ─── Dashboard ──────────────────────────────────────────────────────

class StripeDashboard:
    def __init__(self):
        self.products = []
        self.balance = None
        self.charges = []
        self.running = True
        self.generated_links = []
    
    def refresh(self):
        print(f"\n  {bold('📡 Lade Stripe LIVE-Daten...')}")
        self.products = stripe_get("products?limit=20&active=true")
        self.balance = stripe_get("balance")
        self.charges = stripe_get("charges?limit=10")
        print(f"  ✅ {clr('g','LIVE')} — {len(self.products.get('data',[]))} Produkte gefunden")
    
    def show(self):
        print(f"{C['cls']}")
        print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
        print(f"{clr('p', bold('║  💳 CyberSarah Stripe LIVE Dashboard v1.0          ║'))}")
        print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
        print(f"  {clr('g',bold('🔥 LIVE-MODUS — Echte Transaktionen!'))}")
        print()
        
        # Balance
        bal = self.balance or {}
        available = sum(b.get('amount', 0) for b in bal.get('available', [])) / 100
        pending = sum(b.get('amount', 0) for b in bal.get('pending', [])) / 100
        print(f"  {bold('💰 Kontostand')}")
        print(f"  Verfügbar: {clr('g',f'€{available:.2f}')}  |  Ausstehend: {clr('y',f'€{pending:.2f}')}  |  {clr('bold',f'Gesamt: €{available + pending:.2f}')}")
        print()
        
        # Products
        prods = self.products.get('data', [])
        print(f"  {bold(f'🛍️  Produkte ({len(prods)})')}")
        for i, p in enumerate(prods, 1):
            name = p.get('name', '?')
            prices = stripe_get(f"prices?product={p['id']}&limit=1")
            price_data = prices.get('data', [{}])[0]
            unit_amount = price_data.get('unit_amount', 0) or 0
            currency = price_data.get('currency', 'eur')
            price_str = f"€{unit_amount/100:.2f}" if currency == 'eur' else f"{unit_amount/100:.2f} {currency.upper()}"
            print(f"  {i}. {name}")
            print(f"     {clr('g',price_str)} | ID: {p['id'][:20]}... | {p.get('default_price','')[:20] or 'Kein Preis'}")
        
        # Recent charges
        chgs = self.charges.get('data', [])
        print(f"\n  {bold(f'💳 Letzte {len(chgs)} Transaktionen')}")
        total_revenue = 0
        for c in chgs:
            amount = c.get('amount', 0) / 100
            currency = c.get('currency', 'eur')
            status = c.get('status', '?')
            created = datetime.fromtimestamp(c.get('created', 0)).strftime("%d.%m. %H:%M")
            desc = c.get('description', '')[:30] or c.get('payment_method_details', {}).get('type', '?')
            if status == 'succeeded':
                total_revenue += amount
                print(f"  {clr('g','✅')} {clr('g',f'€{amount:.2f}')} — {desc} ({created})")
            elif status == 'pending':
                print(f"  {clr('y','⏳')} €{amount:.2f} — {desc} ({created})")
            else:
                print(f"  {clr('r','❌')} €{amount:.2f} — {desc} ({created})")
        
        if total_revenue > 0:
            print(f"\n  {bold(f'📊 Erfolgreiche Transaktionen: {clr(\"g\", f\"€{total_revenue:.2f}\")}')}")
        
        print(f"\n  {bold('🚀 Aktionen')}")
        print(f"  [{clr('g','1')}] Neue Produkte anzeigen")
        print(f"  [{clr('g','2')}] Neues Produkt erstellen")
        print(f"  [{clr('g','3')}] Checkout-Link generieren")
        print(f"  [{clr('g','4')}] Daten aktualisieren")
        print(f"  [{clr('g','5')}] Stripe Dashboard öffnen")
        print(f"  [{clr('r','0')}] Beenden")
        
        if self.generated_links:
            print(f"\n  {bold('📎 Erstellte Links')}")
            for l in self.generated_links[-3:]:
                print(f"  🔗 {l}")
        
        print(f"\n  {dim('─'*50)}")
    
    def create_product(self):
        print(f"\n  {bold('🆕 Neues Produkt erstellen')}")
        name = input(f"  {clr('y','▶')} Produktname: ").strip()
        if not name: return
        
        try:
            price_str = input(f"  {clr('y','▶')} Preis in € (z.B. 29.99): ").strip()
            price_cents = int(float(price_str.replace(',', '.')) * 100)
        except:
            print(f"  {clr('r','❌')} Ungültiger Preis")
            return
        
        desc = input(f"  {clr('y','▶')} Beschreibung (optional): ").strip()
        
        print(f"\n  {bold('📡 Erstelle in Stripe LIVE...')}")
        
        # Create product
        prod_data = {"name": name, "active": "true"}
        if desc: prod_data["description"] = desc
        prod = stripe_post("products", prod_data)
        
        if prod.get("id"):
            print(f"  {clr('g','✅')} Produkt erstellt: {prod['id']}")
            
            # Create price
            price = stripe_post("prices", {
                "product": prod["id"],
                "unit_amount": str(price_cents),
                "currency": "eur",
            })
            
            if price.get("id"):
                print(f"  {clr('g','✅')} Preis erstellt: {price['id']}")
                print(f"  {clr('g',f'💰 {name} — €{price_cents/100:.2f} (LIVE)')}")
                self.refresh()
            else:
                print(f"  {clr('r','❌')} Preis-Fehler: {price.get('error','?')}")
        else:
            print(f"  {clr('r','❌')} Produkt-Fehler: {prod.get('error','?')}")
        
        input(f"\n  {dim('Enter drücken...')}")
    
    def create_checkout_link(self):
        prods = self.products.get('data', [])
        if not prods:
            print(f"\n  {clr('y','⚠️ Keine Produkte. Erstelle zuerst ein Produkt.')}")
            return
        
        print(f"\n  {bold('🔗 Checkout-Link generieren')}")
        for i, p in enumerate(prods, 1):
            name = p.get('name', '?')
            prices = stripe_get(f"prices?product={p['id']}&limit=1&active=true")
            price_id = prices.get('data', [{}])[0].get('id', '')
            amount = prices.get('data', [{}])[0].get('unit_amount', 0) or 0
            print(f"  {i}. {name} — {clr('g',f'€{amount/100:.2f}')}")
        
        try:
            choice = int(input(f"\n  {clr('y','▶')} Produkt (1-{len(prods)}): ").strip())
            if choice < 1 or choice > len(prods):
                return
            prod = prods[choice - 1]
        except:
            return
        
        prices = stripe_get(f"prices?product={prod['id']}&limit=1&active=true")
        price_id = prices.get('data', [{}])[0].get('id', '')
        
        if not price_id:
            print(f"  {clr('r','❌')} Kein Preis gefunden für {prod['name']}")
            return
        
        quantity = input(f"  {clr('y','▶')} Anzahl (Enter=1): ").strip() or "1"
        
        print(f"\n  {bold('📡 Erstelle Checkout-Session...')}")
        
        session = stripe_post("checkout/sessions", {
            "success_url": "https://167.233.196.20:3000/api/store?success=true",
            "cancel_url": "https://167.233.196.20:3000/api/store?canceled=true",
            "mode": "payment",
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": quantity,
        })
        
        if session.get("url"):
            print(f"\n  {clr('g','✅')} Checkout-Link erstellt!")
            print(f"\n  {clr('bold','🔗')} {session['url']}")
            self.generated_links.append(session['url'])
            
            # Save to file
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs("checkout_links", exist_ok=True)
            with open(f"checkout_links/link_{ts}.txt", 'w') as f:
                f.write(f"Produkt: {prod['name']}\nPreis: €{prod.get('default_price','?')}\nLink: {session['url']}\nErstellt: {datetime.now()}\n")
            print(f"  💾 Gespeichert: checkout_links/link_{ts}.txt")
        else:
            print(f"  {clr('r','❌')} Fehler: {session.get('error',{}).get('message','?')}")
        
        input(f"\n  {dim('Enter drücken...')}")
    
    def run(self):
        self.refresh()
        while self.running:
            self.show()
            try:
                choice = input(f"\n  {clr('y','▶')} Aktion: ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            
            if choice == "1":
                print(f"\n  {bold(f'📦 {len(self.products.get(\"data\",[]))} Produkte geladen')}")
                input(f"\n  {dim('Enter drücken...')}")
            elif choice == "2":
                self.create_product()
            elif choice == "3":
                self.create_checkout_link()
            elif choice == "4":
                self.refresh()
                input(f"\n  {dim('Enter drücken...')}")
            elif choice == "5":
                print(f"\n  {bold('🔗 Öffne Stripe Dashboard...')}")
                print(f"  https://dashboard.stripe.com/")
                input(f"\n  {dim('Enter drücken...')}")
            elif choice == "0":
                self.running = False

def main():
    print(f"{C['cls']}")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  💳 CyberSarah Stripe LIVE Dashboard v1.0          ║'))}")
    print(f"{clr('p', bold('║  Direkter API-Zugriff — KEIN Server nötig!         ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    print(f"  {clr('g',bold('🔥 Stripe LIVE-Modus aktiv'))}")
    print(f"  {dim('Starte Dashboard...')}")
    
    dash = StripeDashboard()
    try:
        dash.run()
    except KeyboardInterrupt:
        pass
    print(f"\n\n{clr('g','👋 Bis zum nächsten Mal!')}\n")

if __name__ == "__main__":
    main()
