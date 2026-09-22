#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah LAUNCH KIT v1.0 — SPRINT 61                            ║
║  Alles für deinen ersten Verkauf — Schritt für Schritt             ║
║                                                                     ║
║  1. System-Check: Ist alles bereit?                                ║
║  2. Fehlende Setup-Schritte erledigen                              ║
║  3. Produkt auswählen & verkaufsfertig machen                      ║
║  4. Ersten Kunden gewinnen → erster €                             ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 launch-kit.py
"""
import os, sys, json, time, subprocess
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

SERVER = "http://167.233.196.20:3000"
C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def api(path):
    try:
        req = Request(f"{SERVER}{path}", headers={'Accept': 'application/json'})
        with urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

def step(msg, status):
    icon = clr('g', '✅') if status else clr('r', '❌') if status is False else clr('y', '⏳')
    print(f" {icon} {msg}")

def check_system():
    print(f"\n{clr('bold', '🔍 1/4 SYSTEM-CHECK')}\n")
    
    # Server
    health = api('/api/healthz')
    server_ok = health.get('status') == 'ok'
    step("Server erreichbar", server_ok)
    
    # System Status
    status = api('/api/system-status')
    system_ok = status.get('systemGesund', False) if isinstance(status, dict) else False
    step("System gesund", system_ok)
    
    # Stripe
    stripe_ok = status.get('stripeVerfuegbar', False) if isinstance(status, dict) else False
    stripe_live = status.get('stripeLiveKey', False) if isinstance(status, dict) else False
    step(f"Stripe {'LIVE 💰' if stripe_live else 'TEST'}", stripe_ok)
    
    # Open AI
    openai_ok = status.get('openaiVerfuegbar', False) if isinstance(status, dict) else False
    step("OpenAI verbunden", openai_ok)
    
    # Gemini
    gemini_ok = status.get('geminiAktiv', False) if isinstance(status, dict) else False
    step("Gemini verbunden", gemini_ok)
    
    # Digistore24
    digi_ok = status.get('digistoreAktiv', False) if isinstance(status, dict) else False
    step("Digistore24 verbunden", digi_ok)
    
    # Agents
    agenten = status.get('agentenGesamt', 0) if isinstance(status, dict) else 0
    aktiv = (status.get('agentenNachStatus', {}) or {}).get('aktiv', 0) if isinstance(status, dict) else 0
    step(f"{agenten} Agenten ({aktiv} aktiv)", aktiv > 0)
    
    # Revenue
    rev = api('/api/revenue')
    today_rev = rev.get('heute', 0) if isinstance(rev, dict) else 0
    month_rev = rev.get('letzte30Tage', 0) if isinstance(rev, dict) else 0
    total_rev = rev.get('summe', 0) if isinstance(rev, dict) else 0
    
    print()
    if total_rev > 0:
        print(f" {clr('g', '💰')} Umsatz: €{today_rev:.2f} heute | €{month_rev:.2f} 30 Tage | €{total_rev:.2f} gesamt")
    else:
        print(f" {clr('y', '💰')} Umsatz: €0 — noch keine Verkäufe")
    
    return all([server_ok, system_ok, stripe_ok])

def check_setup():
    print(f"\n{clr('bold', '⚙️ 2/4 SETUP-STATUS')}\n")
    
    setup = api('/api/sofort-start/setup-status')
    if isinstance(setup, list):
        for s in setup:
            name = s.get('name', '?')
            done = s.get('erledigt', False)
            step(name, done)
            if not done:
                if 'gumroad' in str(s.get('schluessel', '')).lower():
                    print(f"    {clr('b', '→ Gehe zu:')} https://gumroad.com/ — Konto erstellen, Produkte hochladen")
                elif 'digistore' in str(s.get('schluessel', '')).lower():
                    print(f"    {clr('b', '→ Gehe zu:')} https://digistore24.com/ — Affiliate-Konto anmelden")
                elif 'coaching' in str(s.get('schluessel', '')).lower():
                    print(f"    {clr('b', '→ richte ein:')} Calendly oder ähnliches für Buchungen")
    else:
        print(f" {clr('y', '⚠️  Setup-Status nicht verfügbar')}")

def list_best_products():
    print(f"\n{clr('bold', '🛍️ 3/4 PRODUKT-EMPFEHLUNGEN')}\n")
    
    data = api('/api/stripe/products')
    products = data.get('products', [])
    
    if not products:
        print(f" {clr('y', 'Keine Produkte verfügbar')}")
        return
    
    # Sort by price (cheapest first for easier first sale)
    sorted_products = sorted(products, key=lambda p: (p.get('price', {}) or {}).get('unitAmount', 999999))
    
    print(f" {clr('bold', 'Beste Produkte für den ersten Verkauf:')}\n")
    
    # Top 3 cheapest products
    for i, p in enumerate(sorted_products[:3], 1):
        name = p.get('name', '?')
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        url = p.get('url', '#')
        print(f" {clr('g', f'{i}.')} {clr('bold', name)} — {clr('g', f'€{price:.2f}')}")
        print(f"    {clr('b', '🔗')} {url}")
        print()

def quick_launch_guide():
    print(f"\n{clr('bold', '🚀 4/4 DEIN ERSTER VERKAUF IN 5 MINUTEN')}\n")
    
    print(f""" {clr('g', 'SCHRITT 1:')} Produkt-Link kopieren
    python3 product-sharer.py
    
 {clr('g', 'SCHRITT 2:')} In Social Media teilen
    python3 social-content-poster.py
    
 {clr('g', 'SCHRITT 3:')} Affiliate-Partner anwerben
    python3 affiliate-center.py
    
 {clr('g', 'SCHRITT 4:')} Warten auf ersten Verkauf 🎉
    python3 stripe-payment-manager.py — Kontostand prüfen
    
 {clr('g', '📱 APK installieren:')}
    Lade CyberSarah-Master-v7.9-release.apk 
    Öffne den Store → Produkt auswählen → Kaufen!
    
 {clr('bold', '💰 Dein erster € wartet!')}
""")

def main():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  🚀 CyberSarah LAUNCH KIT v1.0                   ║'))}")
    print(f"{bold(clr('p', '║  SPRINT 61 — Dein erster Verkauf!               ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', datetime.now().strftime('%d.%m.%Y %H:%M'))}\n")
    
    check_system()
    check_setup()
    list_best_products()
    quick_launch_guide()
    
    print(f"\n{clr('p', '─' * 50)}")
    print(f"\n{clr('bold', '📋 To-Do für deinen ersten Verkauf:')}")
    print(f"  {clr('b', '□')} 1. python3 product-sharer.py — Link kopieren")
    print(f"  {clr('b', '□')} 2. Link an 10 Freunde/Bekannte schicken")
    print(f"  {clr('b', '□')} 3. Auf Social Media posten")
    print(f"  {clr('b', '□')} 4. Warten auf den ersten € 🎉")
    print(f"  {clr('b', '□')} 5. bash termux-deploy.sh — Server updaten")
    print()

if __name__ == "__main__":
    main()
