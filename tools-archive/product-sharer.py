#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah PRODUCT SHARER v1.0                                     ║
║  Teile Produkte via WhatsApp / Telegram / E-Mail                    ║
║                                                                     ║
║  - Zeigt alle Produkte aus Stripe LIVE                             ║
║  - Kopiert Links für WhatsApp/Telegram                             ║
║  - Generiert Marketing-Texte                                       ║
║  - Scannt QR-Codes für einfaches Teilen                            ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 product-sharer.py
"""
import os, sys, json, time, webbrowser
from urllib.request import Request, urlopen
from urllib.error import URLError
from datetime import datetime

SERVER = "http://167.233.196.20:3000"
C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def api(path):
    try:
        req = Request(f"{SERVER}{path}", headers={'Accept': 'application/json'})
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

def show_products(products):
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  📤 CyberSarah PRODUCT SHARER                    ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', datetime.now().strftime('%d.%m.%Y %H:%M'))} | {len(products)} Produkte | Stripe LIVE\n")
    
    for i, p in enumerate(products, 1):
        name = p.get('name', '?')
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        url = p.get('url', '#')
        print(f" {clr('g', str(i).rjust(2)+'.')} {clr('bold', name[:50])}")
        print(f"     {clr('g', '€'+str(price).rjust(7))}  {clr('b', url)}")
    
    print(f"\n {clr('y', 'Aktion:')}")
    print(f"   {clr('g', 'Nummer')} = Link kopieren + WhatsApp-Text generieren")
    print(f"   {clr('g', 'a')} = ALLE Links anzeigen")
    print(f"   {clr('g', 'q')} = Beenden")

def main():
    data = api('/api/stripe/products')
    products = data.get('products', [])
    if not products:
        print(f"\n {clr('r', '❌ Keine Produkte oder Server nicht erreichbar')}")
        return
    
    while True:
        show_products(products)
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Produkt-Nr (oder a/q): ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print(f"\n {clr('y', '👋')}")
            break
        
        if choice == 'q':
            break
        elif choice == 'a':
            print(f"\n {clr('bold', '📋 ALLE PRODUKT-LINKS:')}\n")
            for p in products:
                name = p.get('name', '?')
                price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
                url = p.get('url', '#')
                print(f" {clr('g', '€'+str(price).rjust(6))} {name[:60]}")
                print(f"    {clr('b', url)}")
            input(f"\n ⏎ Enter zum Fortfahren...")
        else:
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(products):
                    p = products[idx]
                    name = p.get('name', 'Produkt')
                    price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
                    url = p.get('url', '#')
                    
                    print(f"\n {clr('bold', '📤 TEILEN:')} {clr('g', name)}")
                    print(f"\n {clr('g', '1)')} WhatsApp")
                    print(f" {clr('g', '2)')} Telegram")
                    print(f" {clr('g', '3)')} Link kopieren")
                    print(f" {clr('g', '4)')} Marketing-Text generieren")
                    
                    sub = input(f"\n {bold(clr('p', '➜'))} Option: ").strip()
                    
                    wa_text = f"🔥 {name}\n\n💰 Nur €{price:.2f}\n\n{url}"
                    tg_text = f"🔥 {name} — €{price:.2f}\n{url}"
                    
                    if sub == '1':
                        import urllib.parse
                        webbrowser.open(f"https://wa.me/?text={urllib.parse.quote(wa_text)}")
                        print(f" {clr('g', '✅ WhatsApp geöffnet!')}")
                    elif sub == '2':
                        import urllib.parse
                        webbrowser.open(f"https://t.me/share/url?url={urllib.parse.quote(url)}&text={urllib.parse.quote(name)}")
                        print(f" {clr('g', '✅ Telegram geöffnet!')}")
                    elif sub == '3':
                        import pyperclip
                        try:
                            pyperclip.copy(url)
                            print(f" {clr('g', '✅ Link kopiert!')}")
                        except:
                            print(f"\n {clr('b', url)}")
                            print(f" {clr('y', '📋 Manuell kopieren')}")
                    elif sub == '4':
                        text = f"""🚀 PRODUKT-HIGHLIGHT

🔥 {name}
💰 €{price:.2f}

{p.get('description', '')[:200]}

🔗 Jetzt kaufen: {url}

✨ KI-generiert von CyberSarah — Dein autonomes Revenue OS
"""
                        print(f"\n {clr('bold', '📝 MARKETING-TEXT:')}\n")
                        print(text)
                        input(f"\n ⏎ Enter zum Fortfahren...")
            except (ValueError, IndexError):
                print(f" {clr('r', '❌ Ungültige Auswahl')}")
                time.sleep(1)

if __name__ == "__main__":
    main()
