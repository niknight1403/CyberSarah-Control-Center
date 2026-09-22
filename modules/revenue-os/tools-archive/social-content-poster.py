#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah SOCIAL CONTENT POSTER v1.0                              ║
║  Fertige Social-Media-Posts für deine Produkte                     ║
║                                                                     ║
║  - Generiert Posts für TikTok, Instagram, YouTube, Twitter         ║
║  - Enthält Stripe-Links und Affiliate-Tracking                     ║
║  - Kopieren & Einfügen — sofort nutzbar                           ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 social-content-poster.py
"""
import os, sys, json, random
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

POST_TEMPLATES = {
    'tiktok': [
        "🔥 {name} — jetzt {price}!\n{desc[:80]}\n🔗 {url}\n#KI #Business #Produktivität",
        "Du willst {benefit}? {name} hilft dir dabei!\n💰 Nur {price}\n👇 Hier kaufen\n{url}\n#KITools #Business",
        "Stop scrolling! 🛑\n{name} wartet auf dich\n✨ {desc[:60]}\n💳 {price}\n🔗 {url}",
    ],
    'instagram': [
        "✨ PRODUKT-HIGHLIGHT ✨\n\n📌 {name}\n💰 {price}\n📝 {desc[:100]}\n\n👉 Link in Bio oder direkt:\n{url}\n\n#CyberSarah #KI #Business #Produkte",
        "🔥 NEU IM SHOP 🔥\n\n{name}\n\n{desc[:100]}\n\nJetzt sichern für nur {price}!\n🔗 {url}",
    ],
    'twitter': [
        "{name}\n{desc[:80]}\n💰 {price}\n🔗 {url}",
        "Neu: {name}! 🚀\n{desc[:60]}\n{price} — Jetzt kaufen 👇\n{url}",
    ],
    'whatsapp': [
        "🔥 *{name}*\n{desc[:100]}\n💰 *{price}*\n🔗 {url}",
        "📢 *NEUES PRODUKT*\n\n*{name}*\n{desc[:80]}\n▶️ Jetzt kaufen: {url}",
    ]
}

BENEFITS = [
    "dein Business automatisieren", "Zeit sparen", "mehr Umsatz generieren",
    "professionelle Inhalte erstellen", "KI für dich arbeiten lassen",
    "deine Produktivität steigern", "bessere Ergebnisse erzielen",
    "dich vom Wettbewerb abheben", "deine Reichweite erhöhen"
]

def show_banner():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  📢 CyberSarah SOCIAL CONTENT POSTER v1.0        ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', datetime.now().strftime('%d.%m.%Y %H:%M'))}\n")

def show_products():
    data = api('/api/stripe/products')
    products = data.get('products', [])
    if not products:
        print(f" {clr('y', 'Keine Produkte verfügbar')}")
        return []
    
    print(f" {clr('bold', f'📦 {len(products)} Produkte:')}\n")
    for i, p in enumerate(products[:20], 1):
        name = p.get('name', '?')[:45]
        price = (p.get('price', {}) or {}).get('unitAmount', 0) / 100
        print(f" {clr('g', str(i).rjust(2)+'.')} €{price:>6.2f} {name}")
    return products

def generate_posts(products, idx, platform):
    p = products[idx]
    name = p.get('name', 'Produkt')
    price = f"€{(p.get('price',{}) or {}).get('unitAmount',0)/100:.2f}"
    desc = p.get('description', '')
    url = p.get('url', '#')
    benefit = random.choice(BENEFITS)
    
    templates = POST_TEMPLATES.get(platform, POST_TEMPLATES['whatsapp'])
    
    print(f"\n {clr('bold', f'📱 {platform.upper()} — {name}')}")
    print(f" {clr('p', '─' * 50)}\n")
    
    for i, template in enumerate(templates, 1):
        post = template.format(name=name, price=price, desc=desc, url=url, benefit=benefit)
        print(f" {clr('g', f'Post #{i}:')}")
        print(f"{clr('y', post)}")
        print()
    
    print(f" {clr('b', '🔗 Direkter Stripe-Link:')} {url}\n")
    return True

def main():
    products = show_products()
    if not products:
        return
    
    print(f"\n{clr('p', '─' * 50)}")
    print(f"\n{clr('bold', 'Post für welches Produkt? (1-{})' if len(products)<=20 else 'Post für welches Produkt? (1-20)').format(len(products))}")
    
    try:
        choice = input(f"\n {bold(clr('p', '➜'))} Nummer: ").strip()
        idx = int(choice) - 1
        if idx < 0 or idx >= min(len(products), 20):
            print(f" {clr('r', '❌ Ungültige Auswahl')}")
            return
    except (ValueError, EOFError):
        return
    
    p = products[idx]
    name = p.get('name', 'Produkt')
    
    print(f"\n{clr('bold', f'📱 Plattform für \"{name[:40]}\":')}")
    print(f"  {clr('g', '1)')} TikTok")
    print(f"  {clr('g', '2)')} Instagram")
    print(f"  {clr('g', '3)')} Twitter/X")
    print(f"  {clr('g', '4)')} WhatsApp")
    print(f"  {clr('g', '5)')} Alle Plattformen")
    
    try:
        plat = input(f"\n {bold(clr('p', '➜'))} Plattform: ").strip()
        platforms = {'1': ['tiktok'], '2': ['instagram'], '3': ['twitter'], '4': ['whatsapp'], '5': ['tiktok','instagram','twitter','whatsapp']}
        selected = platforms.get(plat, ['whatsapp'])
        for pform in selected:
            generate_posts(products, idx, pform)
            if len(selected) > 1:
                print(f" {clr('p', '─' * 60)}\n")
    except (EOFError, KeyboardInterrupt):
        pass
    
    input(f"\n ⏎ Enter...")

if __name__ == "__main__":
    main()
