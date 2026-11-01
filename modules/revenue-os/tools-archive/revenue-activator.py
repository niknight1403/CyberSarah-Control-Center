#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah REVENUE ACTIVATOR v1.0                                  ║
║  Aktiviert Umsatz auf dem LIVE-Server — sofort!                    ║
║                                                                     ║
║  - Triggert HARA Auto-Scans                                        ║
║  - Holt alle Produkte + Payment-Links                              ║
║  - Generiert Marketing-Content                                     ║
║  - Zeigt Verkaufs-Dashboard                                        ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 revenue-activator.py
"""
import os, sys, json, time
from urllib.request import Request, urlopen
from urllib.error import URLError
from datetime import datetime

SERVER = "http://167.233.196.20:3000"
C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def api(method, path, data=None):
    try:
        req = Request(f"{SERVER}{path}", method=method, data=data, headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except URLError as e:
        if hasattr(e, 'read'):
            try: return json.loads(e.read())
            except: return {'error': str(e)}
        return {'error': str(e)}

def show_banner():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  💰 CyberSarah REVENUE ACTIVATOR v1.0              ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', 'Server:')} {SERVER} | {clr('y', datetime.now().strftime('%H:%M:%S'))}\n")

def check_server():
    status = api('GET', '/api/system-status')
    gesund = status.get('systemGesund', False)
    print(f" {clr('g' if gesund else 'r', '●')} System: {clr('g' if gesund else 'r', '✅ Gesund' if gesund else '❌ Kritisch')}")
    print(f"   Stripe: {clr('g' if status.get('stripeVerfuegbar') else 'r', '✅ LIVE' if status.get('stripeLiveKey') else '⚠️ TEST' if status.get('stripeVerfuegbar') else '❌')}")
    print(f"   Agenten: {status.get('agentenGesamt', '?')} | Gesundheit: {status.get('systemGesundheit', '?')}/100")
    agents = api('GET', '/api/agents')
    if isinstance(agents, list):
        aktive = sum(1 for a in agents if a.get('status') == 'aktiv')
        fehler = sum(1 for a in agents if a.get('status') == 'fehler')
        print(f"   Aktiv: {aktive} | Fehler: {fehler}")
    return status

def show_products():
    print(f"\n{clr('y', '📦 PRODUKTE')}")
    data = api('GET', '/api/stripe/products')
    products = data.get('products', [])
    print(f" {len(products)} Produkte in Stripe LIVE:")
    for p in products:
        name = p.get('name', '?')
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        url = p.get('url', '#')
        print(f"   {clr('g', '€'+str(price))} {name}")
        print(f"   {clr('b', '  🔗')} {url}")

def trigger_hara():
    print(f"\n{clr('p', '🤖 HARA SCAN')}")
    result = api('POST', '/api/hara/scan', b'{}')
    print(f"   {result.get('message', 'OK')}")
    time.sleep(3)
    overview = api('GET', '/api/hara/overview')
    proposals = overview.get('proposals', [])
    stats = overview.get('statistik', {})
    print(f"   Vorschläge: {stats.get('gesamtVorschlaege', 0)}")
    print(f"   Offen: {stats.get('offen', 0)} | In Umsetzung: {stats.get('inUmsetzung', 0)}")
    print(f"   Abgeschlossen: {stats.get('abgeschlossen', 0)}")
    return proposals

def show_revenue():
    print(f"\n{clr('g', '💰 UMSATZ')}")
    rev = api('GET', '/api/revenue')
    heute = rev.get('heute', 0)
    monat = rev.get('letzte30Tage', 0)
    print(f"   Heute: {clr('g' if heute > 0 else 'y', '€'+str(heute))}")
    print(f"   30 Tage: {clr('g' if monat > 0 else 'y', '€'+str(monat))}")
    if heute == 0 and monat == 0:
        print(f"\n   {clr('y', '⚠️  Noch kein Umsatz — Produkte existieren aber keine Käufe')}")
        print(f"   {clr('b', '💡 Teile die Stripe-Links mit Kunden!')}")

def show_setup():
    print(f"\n{clr('b', '⚙️ SETUP-STATUS')}")
    setup = api('GET', '/api/sofort-start/setup-status')
    if isinstance(setup, list):
        for s in setup:
            status = clr('g', '✅') if s.get('erledigt') else clr('r', '❌')
            print(f"   {status} {s.get('name', '?')}")

def generate_marketing():
    print(f"\n{clr('p', '📢 MARKETING-TEXTE')}")
    data = api('GET', '/api/stripe/products')
    products = data.get('products', [])
    for p in products[:3]:
        name = p.get('name', 'Produkt')
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        url = p.get('url', '#')
        desc = (p.get('description', '') or '')[:80]
        print(f"\n   {clr('bold', name)} — {clr('g', '€'+str(price))}")
        print(f"   {clr('b', '🔗')} {url}")
        print(f"   {desc}")

def main():
    show_banner()
    print(f" {clr('bold', '📡 Verbinde mit Server...')}\n")
    
    status = check_server()
    show_products()
    show_revenue()
    show_setup()
    
    print(f"\n{clr('p', '─' * 50)}")
    print(f"\n{clr('bold', '🎯 AKTIONEN:')}")
    print(f"  {clr('g', '1)')} HARA-Scan auslösen (neue Umsatz-Chancen)")
    print(f"  {clr('g', '2)')} Alle Produkte + Links anzeigen")
    print(f"  {clr('g', '3)')} Marketing-Texte generieren")
    print(f"  {clr('g', '4)')} Vollständigen System-Check")
    print(f"  {clr(chr(103), chr(53))} Dauerhaft alle 30 Sekunden scannen (Auto-Pilot)")
    print(f"  {clr('r', '0)')} Beenden")
    
    try:
        choice = input(f"\n {clr('bold', '➜')} Auswahl: ").strip()
        if choice == '1':
            trigger_hara()
        elif choice == '2':
            show_products()
        elif choice == '3':
            generate_marketing()
        elif choice == '4':
            pass  # Already shown
        elif choice == '5':
            print(f"\n {clr('y', '🔄 Auto-Pilot aktiv — scannt alle 30 Sekunden...')}")
            print(f" {clr('dim', 'Drücke Strg+C zum Beenden')}\n")
            count = 0
            while True:
                count += 1
                result = api('POST', '/api/hara/scan', b'{}')
                print(f"   [{count}] {result.get('message', 'Scan OK')} — {datetime.now().strftime('%H:%M:%S')}")
                time.sleep(30)
    except KeyboardInterrupt:
        print(f"\n\n {clr('y', '👋 Bis bald!')}")
    except EOFError:
        print()
    
    print(f"\n{clr('g', '✅ Fertig!')}")

if __name__ == "__main__":
    main()
