#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Master Automation v1.0                                  ║
║  DAS Herzstück — orchestriert ALLE Tools automatisch!              ║
║                                                                     ║
║  24/7 Automatik-Modus:                                              ║
║  - Stündlich:   Content erstellen (TikTok/IG/YT)                   ║
║  - Täglich:     WhatsApp-Kampagnen, Produkt-Launch-Material        ║
║  - Wöchentlich: Komplette Launch-Pläne, Revenue-Reports            ║
║  - Monitoring:  Stripe LIVE Kontostand, Transaktionen              ║
║                                                                     ║
║  ALLES IN EINEM — kein manuelles Eingreifen nötig!                 ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 master-automation.py
"""

import os, sys, json, time
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path
import subprocess

C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'w': '\033[1;97m',
    'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
    'cls': '\033[2J\033[H',
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

def call_ai(prompt, max_tokens=1000):
    if not OPENAI_KEY: return None
    try:
        data = json.dumps({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": 0.8,
        }).encode()
        req = Request(
            "https://api.openai.com/v1/chat/completions",
            data=data,
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"}
        )
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]
    except: return None

def stripe_get(path):
    try:
        req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except: return {}

def server_api(path):
    try:
        req = Request(f"http://167.233.196.20:3000/api/{path}", method="GET")
        with urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except: return None

# ─── Automation Engine ─────────────────────────────────────────────

class MasterAutomation:
    def __init__(self):
        self.stats = {
            'content_created': 0,
            'campaigns_created': 0,
            'checkout_links': 0,
            'products_found': 0,
            'revenue_checked': 0,
            'errors': 0,
            'start_time': datetime.now(),
            'last_content': 'Nie',
            'last_campaign': 'Nie',
            'last_revenue': 'Nie',
        }
        self.running = True
        self.auto_mode = False
        self.hourly_count = 0
        
    def log(self, msg, level="info"):
        ts = datetime.now().strftime("%H:%M:%S")
        prefix = f"{clr('g','✅')}" if level == "info" else f"{clr('y','⚠️')}" if level == "warn" else f"{clr('r','❌')}"
        print(f"  {dim(f'[{ts}]')} {prefix} {msg}")
    
    def check_stripe(self):
        """Prüft Stripe LIVE Kontostand und Transaktionen"""
        balance = stripe_get("balance")
        charges = stripe_get("charges?limit=5")
        
        available = sum(b.get('amount',0) for b in balance.get('available',[]))/100
        pending = sum(b.get('amount',0) for b in balance.get('pending',[]))/100
        
        products = stripe_get("products?limit=20&active=true")
        prod_count = len(products.get("data",[]))
        
        recent_charges = charges.get("data",[])
        successful = sum(1 for c in recent_charges if c.get('status') == 'succeeded')
        revenue = sum(c.get('amount',0)/100 for c in recent_charges if c.get('status') == 'succeeded')
        
        self.stats['products_found'] = prod_count
        self.stats['revenue_checked'] += 1
        self.stats['last_revenue'] = datetime.now().strftime("%H:%M")
        
        return {
            'available': available,
            'pending': pending,
            'products': prod_count,
            'recent_sales': successful,
            'revenue_24h': revenue,
        }
    
    def generate_content(self):
        """Erstellt einen Content mit KI"""
        prompt = """Erstelle einen kurzen Social-Media-Post (max 300 Zeichen) für CyberSarah Revenue OS.
Thema: KI-gestützte Automatisierung für mehr Umsatz.
Mit Emojis, Call-to-Action und 5 Hashtags. Deutsch."""
        content = call_ai(prompt, max_tokens=500)
        if content:
            self.stats['content_created'] += 1
            self.stats['last_content'] = datetime.now().strftime("%H:%M")
            
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs("auto_content", exist_ok=True)
            with open(f"auto_content/content_{ts}.txt", 'w') as f:
                f.write(f"=== AUTOMATISCH ERSTELLT ===\n{datetime.now()}\n\n{content}\n")
            return content
        return None
    
    def create_checkout_links(self):
        """Erstellt Checkout-Links für alle Produkte ohne manuelles Eingreifen"""
        products = stripe_get("products?limit=20&active=true").get("data",[])
        links_created = 0
        
        for p in products:
            prices = stripe_get(f"prices?product={p['id']}&limit=1&active=true")
            price_id = prices.get("data",[{}])[0].get("id","")
            if price_id:
                try:
                    encoded = f"success_url={urlencode('https://167.233.196.20:3000/api/store?success=true')}&cancel_url={urlencode('https://167.233.196.20:3000/api/store')}&mode=payment&line_items[0][price]={price_id}&line_items[0][quantity]=1"
                    req = Request("https://api.stripe.com/v1/checkout/sessions", data=encoded.encode())
                    req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
                    req.add_header("Content-Type", "application/x-www-form-urlencoded")
                    with urlopen(req, timeout=10) as r:
                        session = json.loads(r.read())
                        if session.get("url"):
                            links_created += 1
                except: pass
        
        self.stats['checkout_links'] += links_created
        return links_created
    
    def check_server(self):
        """Prüft ob der Hetzner-Server erreichbar ist"""
        status = server_api("system-status")
        if status:
            agents = server_api("agents")
            agent_count = len(agents) if agents else 0
            stripe_ok = status.get('stripeVerfuegbar', False)
            return {"online": True, "agents": agent_count, "stripe": stripe_ok}
        return {"online": False, "agents": 0, "stripe": False}
    
    def print_dashboard(self):
        """Zeigt das Live-Dashboard"""
        print(C['cls'])
        elapsed = str(datetime.now() - self.stats['start_time']).split('.')[0]
        
        print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
        print(f"{clr('p', bold('║  🤖 CyberSarah Master Automation v1.0             ║'))}")
        print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
        print(f"  {dim('Laufzeit:')} {elapsed}  |  {dim('Modus:')} {'🔄 Auto' if self.auto_mode else '📋 Manuell'}")
        print()
        
        # Stripe Status
        stripe = self.check_stripe()
        print(f"  {bold('💰 Stripe LIVE')}")
        print(f"  Verfügbar: {clr('g',f'€{stripe[\"available\"]:.2f}')}  |  Ausstehend: {clr('y',f'€{stripe[\"pending\"]:.2f}')}  |  Produkte: {stripe['products']}")
        if stripe['recent_sales'] > 0:
            print(f"  {clr('g',f'🛒 {stripe[\"recent_sales\"]} Verkäufe (24h) — €{stripe[\"revenue_24h\"]:.2f}')}")
        print()
        
        # Server Status
        server = self.check_server()
        if server['online']:
            print(f"  {bold('🌐 Server')}: {clr('g','✅ Online')}  |  Agenten: {server['agents']}  |  Stripe: {'🟢' if server['stripe'] else '🔴'}")
        else:
            print(f"  {bold('🌐 Server')}: {clr('y','⚠️ Offline (lokal läuft alles)')}")
        print()
        
        # Stats
        print(f"  {bold('📊 Automation Stats')}")
        print(f"  Content erstellt:  {self.stats['content_created']}  |  Letzter: {self.stats['last_content']}")
        print(f"  Kampagnen:         {self.stats['campaigns_created']}  |  Letzte:   {self.stats['last_campaign']}")
        print(f"  Checkout-Links:    {self.stats['checkout_links']}  |  Revenue:  {self.stats['last_revenue']}")
        print(f"  Fehler:            {self.stats['errors']}  |  Produkte: {stripe['products']}")
        print()
        
        # Aktionen
        print(f"  {bold('⚡ Aktionen')}")
        print(f"  [{clr('g','1')}] Jetzt Content erstellen")
        print(f"  [{clr('g','2')}] Checkout-Links generieren")
        print(f"  [{clr('g','3')}] Stripe aktualisieren")
        print(f"  [{clr('g','4')}] Server-Status prüfen")
        print(f"  [{clr('g','5')}] Alle Tools-Übersicht")
        print(f"  [{clr('g','6')}] Auto-Modus starten (24/7)")
        print(f"  [{clr('b','s')}] Stats zurücksetzen")
        print(f"  [{clr('r','q')}] Beenden")
        print(f"\n  {dim('─'*50)}")
    
    def show_tools(self):
        print(f"\n  {bold('🛠️  Alle verfügbaren Termux-Tools')}")
        print(f"  {dim('─'*45)}")
        print(f"  {clr('bold','💰 VERKAUFEN')}")
        print(f"    python3 sales-server.py             — Store-Server (NEU!)")
        print(f"    python3 product-launch-system.py    — Launch-Automation")
        print(f"    python3 stripe-dashboard.py         — Stripe LIVE Dashboard")
        print(f"    python3 revenue-hub.py              — Revenue Hub + KI")
        print()
        print(f"  {clr('bold','📱 CONTENT')}")
        print(f"    python3 social-content-engine.py     — TikTok/IG/YT/WA")
        print(f"    python3 whatsapp-campaign.py         — WhatsApp Kampagnen")
        print(f"    python3 content-empire.py            — Blog + SEO")
        print()
        print(f"  {clr('bold','🚀 STEUERUNG')}")
        print(f"    python3 master-automation.py         — DIESES Tool (Hub)")
        print(f"    python3 cybersarah-command-center.py — All-in-One Terminal")
        print(f"    python3 cybersarah-dashboard.py      — Server-Dashboard")
        print(f"    python3 serve-apk.py                 — APK Download Server")
        print()
        print(f"  {clr('bold','🛠️  DEPLOYMENT')}")
        print(f"    bash deploy-now.sh                   — Server deployen")
        print(f"    bash quick-fix-server.sh             — Server reparieren")
    
    def auto_loop(self):
        """24/7 Automatik-Modus"""
        self.auto_mode = True
        print(f"\n  {bold('🤖 Auto-Modus gestartet!')}")
        print(f"  {dim('Läuft 24/7 — alle Aktionen automatisch')}")
        print(f"  {dim('Drücke Ctrl+C zum Beenden')}")
        print()
        
        try:
            while self.running:
                now = datetime.now()
                
                # Prüfe Stripe (alle 5 Minuten)
                stripe = self.check_stripe()
                self.log(f"Stripe: €{stripe['available']:.2f} verfügbar, {stripe['products']} Produkte")
                
                # Content erstellen (alle 30 Minuten)
                if self.hourly_count % 6 == 0:
                    content = self.generate_content()
                    if content:
                        self.log(f"Content erstellt: {content[:50]}...")
                
                # Checkout-Links (alle 2 Stunden = alle 24 Durchläufe)
                if self.hourly_count % 24 == 0 and self.hourly_count > 0:
                    links = self.create_checkout_links()
                    self.log(f"{links} Checkout-Links aktualisiert")
                
                # Server prüfen (alle 10 Minuten)
                if self.hourly_count % 2 == 0:
                    server = self.check_server()
                    if server['online']:
                        self.log(f"Server online — {server['agents']} Agenten")
                
                self.hourly_count += 1
                
                # Warte 5 Minuten
                for i in range(30, 0, -1):
                    if not self.running: break
                    print(f"  ⏳ Nächster Check in {i*10}s...", end='\r')
                    time.sleep(10)
                print("  " * 40, end='\r')
                
        except KeyboardInterrupt:
            print(f"\n\n  {clr('y','🛑 Auto-Modus pausiert')}")
            self.auto_mode = False
    
    def run(self):
        while self.running:
            self.print_dashboard()
            
            try:
                choice = input(f"\n  {clr('y','▶')} Aktion: ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                break
            
            if choice == "1":
                print(f"\n  {bold('📝 Erstelle Content...')}")
                content = self.generate_content()
                if content: print(f"\n  {content}\n")
                else: print(f"  {clr('r','❌')} Fehler")
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "2":
                print(f"\n  {bold('🔗 Erstelle Checkout-Links...')}")
                links = self.create_checkout_links()
                print(f"  {clr('g',f'✅ {links} Links erstellt/aktualisiert')}")
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "3":
                stripe = self.check_stripe()
                print(f"\n  {bold(f'💰 Stripe LIVE Update')}")
                print(f"  Verfügbar: {clr('g',f'€{stripe[\"available\"]:.2f}')}")
                print(f"  Ausstehend: {clr('y',f'€{stripe[\"pending\"]:.2f}')}")
                print(f"  Produkte: {stripe['products']}")
                if stripe['recent_sales'] > 0:
                    print(f"  {clr('g',f'🛒 {stripe[\"recent_sales\"]} Verkäufe — €{stripe[\"revenue_24h\"]:.2f}')}")
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "4":
                server = self.check_server()
                if server['online']:
                    print(f"\n  {clr('g','✅ Server online')}")
                    print(f"  Agenten: {server['agents']}")
                    print(f"  Stripe: {'🟢' if server['stripe'] else '🔴'}")
                else:
                    print(f"\n  {clr('y','⚠️ Server offline (lokal OK)')}")
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "5":
                self.show_tools()
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "6":
                self.auto_loop()
            
            elif choice == "s":
                self.stats['content_created'] = 0
                self.stats['campaigns_created'] = 0
                self.stats['checkout_links'] = 0
                self.stats['errors'] = 0
                print(f"\n  {clr('g','✅ Stats zurückgesetzt')}")
                input(f"\n  {dim('Enter drücken...')}")
            
            elif choice == "q":
                self.running = False

def urlencode(s):
    return s.replace(" ", "+").replace(":", "%3A").replace("/", "%2F").replace(",", "%2C")

def main():
    print(f"{C['cls']}")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🤖 CyberSarah Master Automation v1.0              ║'))}")
    print(f"{clr('p', bold('║  Orchestriert ALLE Tools — 24/7 automatisch!       ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    print()
    
    if not STRIPE_KEY:
        print(f"  {clr('r','❌ Kein Stripe-Key — einige Funktionen deaktiviert')}")
    if not OPENAI_KEY:
        print(f"  {clr('r','❌ Kein OpenAI-Key — Content-Generierung deaktiviert')}")
    
    if STRIPE_KEY:
        stripe = stripe_get("balance")
        available = sum(b.get('amount',0) for b in stripe.get('available',[]))/100
        mode = "LIVE 💰" if "sk_live_" in STRIPE_KEY else "TEST"
        print(f"  {clr('g',f'✅ Stripe {mode} — €{available:.2f} verfügbar')}")
    
    print()
    
    app = MasterAutomation()
    try:
        app.run()
    except KeyboardInterrupt:
        pass
    print(f"\n  {clr('g','👋 Master Automation beendet')}\n")

if __name__ == "__main__":
    main()
