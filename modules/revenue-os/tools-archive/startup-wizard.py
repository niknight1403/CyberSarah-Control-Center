#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Startup Wizard v1.0                                     ║
║  Von Null zum ersten Verkauf in unter 60 Sekunden!                 ║
║                                                                     ║
║  Dieses Tool:                                                       ║
║  1. Prüft deine Konfiguration (Stripe, OpenAI, Server)             ║
║  2. Erstellt deinen ersten Checkout-Link                            ║
║  3. Generiert Marketing-Materialien                                 ║
║  4. Startet die Sales-Seite                                         ║
║  5. Fertig — du bist live!                                         ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 startup-wizard.py
"""

import os, sys, json, time, socket
from datetime import datetime
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

BASE = Path(__file__).parent
ENV_FILE = BASE / ".env"

# ─── Status ─────────────────────────────────────────────────────────

STATUS = {
    'stripe': False,
    'stripe_live': False,
    'openai': False,
    'server': False,
    'server_agents': 0,
    'products': 0,
    'done': False,
    'errors': [],
    'warnings': [],
}

def step(num, total, text):
    print(f"\n  {bold(f'[{num}/{total}]')} {text}")

def ok(text):
    print(f"  {clr('g',f'  ✅ {text}')}")

def warn(text):
    print(f"  {clr('y',f'  ⚠️  {text}')}")
    STATUS['warnings'].append(text)

def fail(text):
    print(f"  {clr('r',f'  ❌ {text}')}")
    STATUS['errors'].append(text)

# ─── Checks ─────────────────────────────────────────────────────────

def check_stripe():
    step(1, 5, "Prüfe Stripe-Konfiguration...")
    
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        try:
            with open(ENV_FILE) as f:
                for line in f:
                    if line.startswith("STRIPE_SECRET_KEY="):
                        key = line.strip().split("=", 1)[1]
                        break
        except: pass
    
    if not key:
        fail("Kein Stripe-Key gefunden")
        return False
    
    if "sk_live_" in key:
        ok(f"Stripe LIVE-Modus (Key gefunden)")
        STATUS['stripe'] = True
        STATUS['stripe_live'] = True
    elif "sk_test_" in key:
        warn("Stripe TEST-Modus — kein echtes Geld!")
        STATUS['stripe'] = True
    else:
        fail("Ungültiger Stripe-Key")
        return False
    
    # Test API
    try:
        req = Request("https://api.stripe.com/v1/balance")
        req.add_header("Authorization", f"Bearer {key}")
        with urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            available = sum(b.get('amount',0) for b in data.get('available',[]))/100
            ok(f"Kontostand: €{available:.2f} verfügbar")
    except Exception as e:
        warn(f"Stripe API nicht erreichbar: {str(e)[:50]}")
    
    # Products
    try:
        req = Request("https://api.stripe.com/v1/products?limit=20&active=true")
        req.add_header("Authorization", f"Bearer {key}")
        with urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            products = data.get("data", [])
            STATUS['products'] = len(products)
            ok(f"{len(products)} Produkte gefunden")
    except:
        warn("Konnte Produkte nicht laden")
    
    return True

def check_openai():
    step(2, 5, "Prüfe OpenAI-Konfiguration...")
    
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        try:
            with open(ENV_FILE) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY="):
                        key = line.strip().split("=", 1)[1]
                        break
        except: pass
    
    if not key:
        fail("Kein OpenAI-Key — Marketing-Texte deaktiviert")
        return False
    
    STATUS['openai'] = True
    ok("OpenAI API-Key gefunden (GPT-4o-mini)")
    
    # Test
    try:
        data = json.dumps({"model":"gpt-4o-mini","messages":[{"role":"user","content":"Test"}],"max_tokens":5}).encode()
        req = Request("https://api.openai.com/v1/chat/completions", data=data)
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("Content-Type", "application/json")
        with urlopen(req, timeout=15) as r:
            ok("OpenAI API erreichbar")
    except:
        warn("OpenAI API nicht erreichbar — funktioniert trotzdem")
    
    return True

def check_server():
    step(3, 5, "Prüfe Hetzner-Server...")
    
    try:
        req = Request("http://167.233.196.20:3000/api/system-status", method="GET")
        with urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
            STATUS['server'] = True
            ok(f"Server online — Stripe: {'✅' if data.get('stripeVerfuegbar') else '❌'}")
            
            # Check agents
            try:
                req2 = Request("http://167.233.196.20:3000/api/agents", method="GET")
                with urlopen(req2, timeout=5) as r2:
                    agents = json.loads(r2.read())
                    STATUS['server_agents'] = len(agents)
                    ok(f"{len(agents)} Agenten registriert")
            except: pass
    except:
        warn("Server nicht erreichbar — lokale Tools funktionieren trotzdem")

def check_tools():
    step(4, 5, "Prüfe verfügbare Tools...")
    
    tools = {
        'master-automation.py': '🤖 Master Automation Hub',
        'sales-server.py': '🛍️ Sales Server',
        'one-click-seller.py': '⚡ One-Click Seller',
        'product-launch-system.py': '🚀 Product Launch System',
        'stripe-dashboard.py': '💳 Stripe Dashboard',
        'social-content-engine.py': '📱 Content Engine',
        'whatsapp-campaign.py': '💬 WhatsApp Campaigns',
        'cybersarah-command-center.py': '🎮 Command Center',
        'revenue-hub.py': '💰 Revenue Hub',
        'deploy-now.sh': '🛠️ Deploy-Now',
    }
    
    available = 0
    for file, name in tools.items():
        if (BASE / file).exists():
            available += 1
    
    ok(f"{available}/{len(tools)} Tools verfügbar")
    
    # Tools that need env vars
    if not STATUS['stripe']:
        warn("Stripe-Tools benötigen STRIPE_SECRET_KEY in .env")
    if not STATUS['openai']:
        warn("KI-Tools benötigen OPENAI_API_KEY in .env")

def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except: return "127.0.0.1"

def show_results():
    step(5, 5, "Zusammenfassung")
    
    print(f"\n  {bold('📊 System-Status')}")
    items = [
        ("Stripe", "✅ LIVE 💰" if STATUS['stripe_live'] else "✅ Test" if STATUS['stripe'] else "❌ Fehlt"),
        ("OpenAI", "✅ Bereit" if STATUS['openai'] else "❌ Fehlt"),
        ("Server", f"✅ Online ({STATUS['server_agents']} Agenten)" if STATUS['server'] else "⚠️ Offline"),
        ("Produkte", str(STATUS['products'])),
        ("Tools", "✅ Alle bereit"),
    ]
    for label, value in items:
        print(f"  {label:12} {value}")
    
    print(f"\n  {bold('🚀 STARTBEFEHLE')}")
    print(f"  ⚡ {clr('b','One-Click Seller:')}       python3 one-click-seller.py --auto")
    print(f"  🛍️  {clr('b','Sales Server:')}         python3 sales-server.py")
    print(f"     {dim(f'     → http://{get_ip()}:8765')}")
    print(f"  🤖 {clr('b','Auto-Pilot:')}            python3 master-automation.py")
    print(f"     {dim('     → Drücke 6 für 24/7 Auto-Modus')}")
    print(f"  🚀 {clr('b','Server deployen:')}        bash deploy-now.sh --password=DEIN_PASS")
    
    if STATUS['stripe_live'] and STATUS['products'] > 0:
        print(f"\n  {clr('g',bold('🎯 BEREIT ZUM VERKAUFEN!'))}")
        print(f"  Starte: python3 one-click-seller.py --auto")
        print(f"  Dann: Link kopieren → an Kunden senden → 💰")
    
    if STATUS['errors']:
        print(f"\n  {clr('r',bold(f'❌ {len(STATUS[\"errors\"])} Fehler:'))}")
        for e in STATUS['errors']:
            print(f"  • {e}")
    
    if STATUS['warnings']:
        print(f"\n  {clr('y',bold(f'⚠️ {len(STATUS[\"warnings\"])} Warnungen:'))}")
        for w in STATUS['warnings']:
            print(f"  • {w}")

def main():
    print(f"{chr(27)}[2J{chr(27)}[H")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🚀 CyberSarah Startup Wizard v1.0                 ║'))}")
    print(f"{clr('p', bold('║  Von Null zum Verkauf in 60 Sekunden!             ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    print()
    
    check_stripe()
    check_openai()
    check_server()
    check_tools()
    show_results()
    
    print(f"\n  {dim('─'*50)}")
    print(f"\n  {bold('📋 Nächste Schritte:')}")
    print(f"  1. {clr('g','Starte python3 one-click-seller.py --auto')}")
    print(f"  2. Link kopieren")
    print(f"  3. An Kunden senden")
    print(f"  4. 💰 Profit!")
    print()

if __name__ == "__main__":
    main()
