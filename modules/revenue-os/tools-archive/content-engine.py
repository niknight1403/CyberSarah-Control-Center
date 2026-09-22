#!/usr/bin/env python3
"""
CyberSarah Content Engine — KI-Inhalte für Social Media
───────────────────────────────────────────────────────
Erstellt automatisch Content für TikTok, Instagram & Co.
Nutzt bestehende Server-APIs.

Start: python3 content-engine.py
"""
import json, time, os, sys, random
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

SERVER = "http://167.233.196.20:3000/api"

def api(path):
    try:
        with urlopen(f"{SERVER}{path}", timeout=10) as r:
            return json.loads(r.read())
    except:
        return {}

def clear(): os.system("clear" if os.name == "posix" else "cls")

CONTENT_TEMPLATES = [
    # TikTok/Instagram Kurzvideos
    "⚡ 3 KI-Tools die dein Business automatisieren ({produkt})",
    "💰 So verdienst du mit KI passives Einkommen → ({produkt})",
    "🚀 Automatisiere deinen Umsatz mit {produkt}",
    "📈 Von 0 auf 100 mit KI-gestützter Automatisierung",
    "💡 5 Minuten die dein Business verändern werden",
    "🔒 Exklusiver Einblick: Mein KI-Revenue-System",
    "🎯 Wie ich mit KI 24/7 Umsatz generiere",
    "🔥 Die geheime KI-Strategie der Top-Verdiener",
    "📱 Mein Handy verdient Geld während ich schlafe",
    "⚡ KI-Agenten die für dich arbeiten (während du schläfst)",
    "💪 Warum KI-Systeme die Zukunft der Arbeit sind",
    "🎬 In 3 Schritten zum passiven KI-Einkommen",
    "💰 2026: Das Jahr der KI-Automatisierung",
    "🤖 Dein eigener KI-Mitarbeiter kostet nur {preis}",
    "📊 So sieht echtes KI-Revenue-Tracking aus",
]

HASHTAGS = [
    "#KI #KuenstlicheIntelligenz #Automation #PassivesEinkommen",
    "#Business #OnlineGeld #ECommerce #DigitalBusiness",
    "#AI #Automation #Revenue #SideHustle",
    "#Tech #Innovation #Zukunft #Digitalisierung",
]

def generate_post(products):
    if not products:
        p = {"name": "KI-Toolkit Premium", "price": 47.00}
    else:
        p = random.choice(products)
    
    name = p.get("name", "KI-Produkt")
    price = f"€{((p.get('price',{}) or {}).get('unitAmount',4700)/100):.2f}"
    
    template = random.choice(CONTENT_TEMPLATES)
    post = template.replace("{produkt}", name).replace("{preis}", price)
    
    hashtags = random.choice(HASHTAGS)
    
    return f"{post}\n\n{hashtags}\n\n👉 Jetzt entdecken: {SERVER.replace('/api','')}/api/stripe"

def main():
    clear()
    print("╔══════════════════════════════════════╗")
    print("║  📱 CyberSarah Content Engine       ║")
    print("╚══════════════════════════════════════╝")
    print()
    
    # Get products
    data = api("/stripe/products")
    products = data.get("products", [])
    
    if not products:
        print("📦 Keine Produkte gefunden — verwende Demo-Daten")
        products = [{"name": "KI-Toolkit Premium", "price": {"unitAmount": 4700}}]
    
    print(f"📦 {len(products)} Produkte geladen")
    print()
    
    while True:
        post = generate_post(products)
        
        # Platform simulator
        platforms = ["📱 TikTok", "📸 Instagram", "▶️ YouTube", "🐦 Twitter/X", "📧 Newsletter"]
        platform = random.choice(platforms)
        
        print(f"  {color('p','══════════════════════════════════════')}")
        print(f"  {platform}")
        print(f"  {color('p','──────────────────────────────────────')}")
        print(f"  {post[:80]}...")
        print(f"  {color('p','──────────────────────────────────────')}")
        print(f"  {color('g','✅')} Bereit zum Posten!")
        print()
        print(f"  {color('y','[Enter]')} Nächster Content  {color('y','[Q]')} Beenden")
        
        key = input("  > ").strip().lower()
        if key == "q":
            break
        clear()
        print("  📱 Content Engine läuft...")
        print()

def color(c, text):
    colors = {'p': '\033[1;35m', 'g': '\033[1;32m', 'y': '\033[1;33m', 'r': '\033[1;31m', 'n': '\033[0m'}
    return f"{colors.get(c, '')}{text}{colors['n']}"

if __name__ == "__main__":
    main()
