#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah AFFILIATE CENTER v1.0                                   ║
║  Partner-Programm — andere vermarkten deine Produkte               ║
║                                                                     ║
║  - Partner verwalten (erfassen, Status, Provision)                 ║
║  - Affiliate-Links für jedes Produkt                               ║
║  - Tracking-Dashboard                                               ║
║  - Auszahlungen verwalten                                          ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 affiliate-center.py
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
        body = json.dumps(data).encode() if data else None
        req = Request(f"{SERVER}{path}", method=method, data=body,
                      headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except URLError as e:
        if hasattr(e, 'read'):
            try: return json.loads(e.read())
            except: return {'error': str(e)}
        return {'error': str(e)}

def show_banner():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  🤝 CyberSarah AFFILIATE CENTER v1.0            ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', datetime.now().strftime('%d.%m.%Y %H:%M'))}\n")

def list_partners():
    data = api('GET', '/api/affiliates/partners')
    partners = data.get('partners', [])
    if not partners:
        print(f" {clr('y', '📭 Keine Affiliate-Partner')}")
        return []
    
    print(f" {clr('bold', f'📋 {len(partners)} Partner:')}\n")
    for p in partners:
        status = clr('g', '🟢') if p.get('status') == 'aktiv' else clr('y', '🟡')
        print(f" {status} {clr('bold', p.get('name', '?'))} — {p.get('email', '?')}")
        print(f"     Provision: {p.get('provision_prozentsatz', '?')}% | Umsatz: €{float(p.get('gesamt_umsatz',0)):.2f}")
        print(f"     Klicks: {p.get('klick_anzahl',0)} | Konversionen: {p.get('konversion_anzahl',0)}")
    return partners

def add_partner():
    print(f"\n {clr('bold', '➕ Neuen Affiliate-Partner erfassen:')}\n")
    email = input(f" {clr('b', 'E-Mail:')} ").strip()
    name = input(f" {clr('b', 'Name:')} ").strip()
    prov = input(f" {clr('b', 'Provision % (Standard 10):')} ").strip() or "10"
    
    data = api('POST', '/api/affiliates/partners', {
        'email': email, 'name': name,
        'provisionProzentsatz': prov,
        'cookieTage': 30
    })
    
    if data.get('erfolg'):
        print(f"\n {clr('g', '✅ Partner erfasst!')}")
        partner = data.get('partner', {})
        print(f"   ID: {partner.get('id')}")
    else:
        print(f"\n {clr('r', f'❌ {data.get(\"error\",\"Fehler\")}')}")

def show_products():
    data = api('GET', '/api/stripe/products')
    products = data.get('products', [])
    if not products:
        print(f"\n {clr('y', '📭 Keine Produkte gefunden')}")
        return []
    print(f"\n {clr('bold', f'📦 {len(products)} Produkte:')}\n")
    for i, p in enumerate(products, 1):
        name = p.get('name', '?')[:40]
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        print(f" {clr('g', str(i).rjust(2)+'.')} €{price:>6.2f} {name}")
    return products

def generate_affiliate_links():
    partners = list_partners()
    if not partners:
        print(f"\n {clr('r', '❌ Keine Partner. Erstelle zuerst einen (Option 2).')}")
        return
    
    products = show_products()
    if not products:
        return
    
    print(f"\n {clr('bold', '🔗 Affiliate-Links generieren:')}")
    print(f"   Jeder Produkt-Link kann einen ?ref=AFFILIATE_ID-Parameter haben")
    print(f"   Beispiel: https://buy.stripe.com/...?ref=partner1@email.com")
    print(f"\n   Die Affiliate-IDs sind die E-Mail-Adressen der Partner.\n")
    
    ref = input(f" {clr('b', 'Referrer (Partner-Name):')} ").strip()
    if not ref:
        return
    
    print(f"\n {clr('bold', f'📤 Affiliate-Links für {ref}:')}\n")
    for p in products[:5]:  # Show first 5
        name = p.get('name', '?')[:40]
        url = p.get('url', '#')
        aff_url = url + ('&' if '?' in url else '?') + f'ref={ref}'
        print(f"   {clr('bold', name)}")
        print(f"   {clr('b', '🔗')} {aff_url}")
        print()

def show_stats():
    print(f"\n {clr('bold', '📊 AFFILIATE-STATISTIKEN')}\n")
    data = api('GET', '/api/affiliates/stats')
    
    print(f"   Partner Gesamt: {data.get('partnerAnzahl', 0)}")
    print(f"   Aktive Partner: {data.get('aktivePartner', 0)}")
    print(f"   Gesamt-Umsatz: €{float(data.get('gesamtUmsatz', 0)):.2f}")
    print(f"   Gesamt-Provision: €{float(data.get('gesamtProvision', 0)):.2f}")
    print(f"   Ausstehend: €{float(data.get('ausstehendProvision', 0)):.2f}")
    print(f"   Ausgezahlt: €{float(data.get('ausgezahltProvision', 0)):.2f}")
    print(f"   Klicks Gesamt: {data.get('klickAnzahl', 0)}")
    print(f"   Konversionen: {data.get('konversionAnzahl', 0)}")

def main():
    while True:
        show_banner()
        
        print(f"\n{clr('bold', '🎯 Aktionen:')}")
        print(f"  {clr('g', '1)')} Partner anzeigen")
        print(f"  {clr('g', '2)')} Neuen Partner erfassen")
        print(f"  {clr('g', '3)')} Produkte anzeigen")
        print(f"  {clr('g', '4)')} Affiliate-Links generieren")
        print(f"  {clr('g', '5)')} Statistiken")
        print(f"  {clr('g', '6)')} Marketing-Texte für Partner")
        print(f"  {clr('r', '0)')} Beenden")
        
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Auswahl: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if choice == '0': break
        elif choice == '1': list_partners()
        elif choice == '2': add_partner()
        elif choice == '3': show_products()
        elif choice == '4': generate_affiliate_links()
        elif choice == '5': show_stats()
        elif choice == '6':
            print(f"\n {clr('bold', '📢 MARKETING-TEXTE FÜR PARTNER:')}\n")
            print(f""" {clr('y', 'WhatsApp-Vorlage:')}
   "Hey! Ich hab was cooles für dich: Verdiene Provision mit KI-Produkten!
   Melde dich im CyberSarah Affiliate-Programm an und erhalte 10% auf
   alle Verkäufe. Schreib mir einfach!"

 {clr('y', 'E-Mail-Vorlage:')}
   "Betreff: Partnerschaftsanfrage — CyberSarah Affiliate-Programm
   
   Hallo [NAME],
   
   ich betreibe das CyberSarah Revenue OS — ein KI-gestütztes System,
   das digitale Premium-Produkte erstellt. 100+ Produkte, Preise von
   €0,40 bis €2.400.
   
   Ich suche Affiliate-Partner, die unsere Produkte bewerben.
   Du erhältst 10% Provision auf jeden Verkauf.
   
   Interessiert? Einfach antworten!"
   
 {clr('y', 'Social-Media-Vorlage:')}
   "🔥 KI-Produkte verkaufen & Provision kassieren!
   Das CyberSarah Affiliate-Programm sucht Partner.
   ✓ 100+ Produkte ✓ Stripe LIVE ✓ 10% Provision
   Interesse? DM mich!" 
""")
        
        input(f"\n ⏎ Enter...")

if __name__ == "__main__":
    main()
