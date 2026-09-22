#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Product Launch System v1.0                              ║
║  Komplette Produkt-Launch-Automation für ALLE Stripe-Produkte      ║
║                                                                     ║
║  1. Holt ALLE Produkte aus Stripe LIVE                             ║
║  2. Erstellt KI-Marketing-Materialien für JEDES Produkt            ║
║  3. Generiert Checkout-Links                                       ║
║  4. Speichert alles organisiert                                    ║
║  5. Zeigt kompletten Launch-Plan                                   ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 product-launch-system.py
"""

import os, sys, json, time
from datetime import datetime, timedelta
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

def stripe_get(path):
    try:
        req = Request(f"https://api.stripe.com/v1/{path}")
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except: return {"error": "Stripe API-Fehler"}

def stripe_post(path, data):
    try:
        encoded = "&".join(f"{k}={urlencode(v)}" for k, v in data.items())
        req = Request(f"https://api.stripe.com/v1/{path}", data=encoded.encode())
        req.add_header("Authorization", f"Bearer {STRIPE_KEY}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except: return {"error": "Stripe Post-Fehler"}

def urlencode(s):
    return str(s).replace(" ", "+").replace(":", "%3A").replace("/", "%2F").replace(",", "%2C").replace("'", "%27")

def call_ai(prompt, max_tokens=1500):
    if not OPENAI_KEY: return "⚠️ Kein OpenAI-Key"
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
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]
    except: return "⚠️ KI-Fehler"

# ─── Product Launch System ────────────────────────────────────────

def get_products():
    """Holt ALLE Produkte aus Stripe LIVE"""
    print(f"  {bold('📡 Lade Stripe LIVE Produkte...')}")
    result = stripe_get("products?limit=100&active=true")
    products = result.get("data", [])
    
    enriched = []
    for p in products:
        prices = stripe_get(f"prices?product={p['id']}&limit=1&active=true")
        price_data = prices.get("data", [{}])[0]
        amount = price_data.get("unit_amount", 0) or 0
        enriched.append({
            "id": p["id"],
            "name": p.get("name", "Unbekannt"),
            "description": p.get("description", ""),
            "price_cents": amount,
            "price_eur": amount / 100,
            "price_id": price_data.get("id", ""),
            "created": datetime.fromtimestamp(p.get("created", 0)),
        })
    
    print(f"  ✅ {clr('g',f'{len(enriched)} Produkte')} geladen\n")
    return enriched

def show_products(products):
    """Zeigt alle Produkte in einer Tabelle"""
    print(f"  {bold(f'🛍️  Stripe LIVE Produkte ({len(products)})')}")
    print(f"  {dim('─'*55)}")
    for i, p in enumerate(products, 1):
        price_str = f"€{p['price_eur']:.2f}" if p['price_eur'] > 0 else "Kein Preis"
        print(f"  {i:2}. {p['name'][:40]:40} {clr('g',price_str)}")
    print(f"  {dim('─'*55)}")
    print(f"  {bold(f'💰 Gesamtwert: {clr(\"g\", f\"€{sum(p[\"price_eur\"] for p in products):.2f}\")}')}")
    print()

def generate_marketing(products, indices):
    """Erstellt komplette Marketing-Materialien für ausgewählte Produkte"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_dir = f"product_launch_{timestamp}"
    os.makedirs(base_dir, exist_ok=True)
    
    total = len(indices)
    print(f"\n  {bold(f'🚀 Starte Launch-Vorbereitung für {total} Produkt(e)...')}")
    print(f"  {dim('─'*55)}")
    
    launch_plan = []
    
    for idx, pi in enumerate(indices, 1):
        p = products[pi]
        print(f"\n  {bold(f'[{idx}/{total}] {p[\"name\"]}')}")
        print(f"  {clr('g',f'€{p[\"price_eur\"]:.2f}')}")
        
        prod_dir = f"{base_dir}/{pi+1:02d}_{p['name'][:30].replace(' ','_').replace('/','-')}"
        os.makedirs(prod_dir, exist_ok=True)
        
        # Save product info
        with open(f"{prod_dir}/produkt_info.txt", 'w') as f:
            f.write(f"Produkt: {p['name']}\n")
            f.write(f"Preis: €{p['price_eur']:.2f}\n")
            f.write(f"Stripe-ID: {p['id']}\n")
            f.write(f"Beschreibung: {p['description']}\n\n")
        
        # Generate checkout link
        if p['price_id']:
            print(f"  🔗 Erstelle Checkout-Link...")
            session = stripe_post("checkout/sessions", {
                "success_url": "https://167.233.196.20:3000/api/store?success=true",
                "cancel_url": "https://167.233.196.20:3000/api/store",
                "mode": "payment",
                "line_items[0][price]": p['price_id'],
                "line_items[0][quantity]": "1",
            })
            checkout_url = session.get("url", "❌ Fehler")
            with open(f"{prod_dir}/checkout_link.txt", 'w') as f:
                f.write(f"Checkout-Link für {p['name']}:\n{checkout_url}\n")
            print(f"  {clr('g','✅')} Checkout-Link erstellt")
        else:
            checkout_url = "❌ Kein Preis"
        
        materials = []
        
        # 1. Optimierte Beschreibung
        print(f"  📝 Generiere Produktbeschreibung...")
        desc_prompt = f"Schreibe eine überzeugende Produktbeschreibung (150 Wörter) für:\n{p['name']} (€{p['price_eur']:.2f})\n{p['description']}\nFokus: Nutzen, Schmerzpunkte, Lösung. Deutsch, mit Emojis und CTA."
        desc = call_ai(desc_prompt)
        with open(f"{prod_dir}/01_beschreibung.txt", 'w') as f:
            f.write(f"=== OPTIMIERTE PRODUKTBESCHREIBUNG ===\n\n{desc}\n")
        materials.append("📝 Beschreibung")
        
        # 2. TikTok Script
        print(f"  📱 Generiere TikTok-Skript...")
        tiktok_prompt = f"Erstelle ein 60-Sekunden TikTok-Skript (Deutsch) für:\n{p['name']} (€{p['price_eur']:.2f})\n\nFormat: HOOK, PROBLEM, LOESUNG, SOCIAL_PROOF, CTA, HASHTAGS"
        tiktok = call_ai(tiktok_prompt)
        with open(f"{prod_dir}/02_tiktok_skript.txt", 'w') as f:
            f.write(f"=== TIKTOK SKRIPT ===\n\n{tiktok}\n")
        materials.append("📱 TikTok")
        
        # 3. Instagram Post
        print(f"  📸 Generiere Instagram-Post...")
        ig_prompt = f"Erstelle einen Instagram-Post (Deutsch) für:\n{p['name']} (€{p['price_eur']:.2f})\n\nMit Bildbeschreibung, Text, 20 Hashtags und CTA."
        ig = call_ai(ig_prompt)
        with open(f"{prod_dir}/03_instagram_post.txt", 'w') as f:
            f.write(f"=== INSTAGRAM POST ===\n\n{ig}\n")
        materials.append("📸 Instagram")
        
        # 4. LinkedIn Post
        print(f"  💼 Generiere LinkedIn-Post...")
        li_prompt = f"Erstelle einen professionellen LinkedIn-Post (Deutsch) für:\n{p['name']} (€{p['price_eur']:.2f})\n\nFachlicher Ton, Mehrwert für Unternehmer, mit CTA."
        li = call_ai(li_prompt)
        with open(f"{prod_dir}/04_linkedin_post.txt", 'w') as f:
            f.write(f"=== LINKEDIN POST ===\n\n{li}\n")
        materials.append("💼 LinkedIn")
        
        # 5. Email Campaign (5 Tage)
        print(f"  📧 Generiere 5-tägige E-Mail-Kampagne...")
        email_prompt = f"Erstelle eine 5-teilige E-Mail-Nurture-Sequence (Deutsch) für:\n{p['name']} (€{p['price_eur']:.2f})\n\nTAG1:Bewusstsein TAG2:Problem TAG3:Loesung TAG4:SocialProof TAG5:Angebot\nJede: Betreff + 100 Wörter + CTA"
        email = call_ai(email_prompt, max_tokens=2500)
        with open(f"{prod_dir}/05_email_kampagne.txt", 'w') as f:
            f.write(f"=== 5-TÄGIGE E-MAIL-KAMPAGNE ===\n\n{email}\n")
        materials.append("📧 E-Mail")
        
        # 6. WhatsApp Message
        print(f"  💬 Generiere WhatsApp-Nachricht...")
        wa_prompt = f"Erstelle eine kurze WhatsApp-Verkaufsnachricht (max 300 Zeichen) für:\n{p['name']} (€{p['price_eur']:.2f})\n\nPersönlich, mit Emoji, Link zum Kauf. Deutsch."
        wa = call_ai(wa_prompt, max_tokens=500)
        with open(f"{prod_dir}/06_whatsapp.txt", 'w') as f:
            f.write(f"=== WHATSAPP NACHRICHT ===\n\n{wa}\n")
        materials.append("💬 WhatsApp")
        
        # 7. Sales Page HTML
        print(f"  🏗️  Generiere Sales-Page...")
        sales_prompt = f"Erstelle eine kurze Sales-Page (HTML) für:\n{p['name']} (€{p['price_eur']:.2f})\n{p['description']}\n\nMit: Ueberschrift, Schmerzpunkte, Nutzen, Preis, CTA-Button. Modernes Dark-Design."
        sales = call_ai(sales_prompt, max_tokens=2000)
        with open(f"{prod_dir}/07_sales_page.html", 'w') as f:
            f.write(f"<!-- SALES PAGE: {p['name']} -->\n{sales}\n")
        materials.append("🏗️ Sales-Page")
        
        # Summary
        launch_plan.append({
            "name": p['name'],
            "price": p['price_eur'],
            "checkout_url": checkout_url,
            "materials": materials,
            "dir": prod_dir,
        })
        
        print(f"  {clr('g','✅')} Alle Materialien erstellt ({len(materials)} Dateien)")
        time.sleep(2)  # Rate limiting
    
    # Save complete launch plan
    with open(f"{base_dir}/00_LAUNCH_PLAN.md", 'w') as f:
        f.write(f"# 🚀 CyberSarah Product Launch\n")
        f.write(f"Datum: {datetime.now().strftime('%d.%m.%Y %H:%M')}\n\n")
        f.write(f"## Produkte ({len(launch_plan)})\n\n")
        for i, lp in enumerate(launch_plan, 1):
            f.write(f"### {i}. {lp['name']} — €{lp['price']:.2f}\n")
            f.write(f"- 🔗 Checkout: {lp['checkout_url']}\n")
            for m in lp['materials']:
                f.write(f"- {m}\n")
            f.write(f"- 📁 Ordner: {lp['dir']}\n\n")
        
        f.write("## Launch-Zeitplan (7 Tage)\n\n")
        f.write("| Tag | Aktion |\n|-----|--------|\n")
        f.write("| 1 | LinkedIn-Post + E-Mail TAG1 |\n")
        f.write("| 2 | Instagram-Post + E-Mail TAG2 |\n")
        f.write("| 3 | TikTok-Video + E-Mail TAG3 |\n")
        f.write("| 4 | WhatsApp-Broadcast + E-Mail TAG4 |\n")
        f.write("| 5 | LinkedIn-Post + E-Mail TAG5 |\n")
        f.write("| 6 | Instagram-Story + TikTok Remix |\n")
        f.write("| 7 | Finale WhatsApp + Checkout-Link |\n")
    
    return launch_plan, base_dir

def main():
    print(f"{C['cls']}")
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🚀 CyberSarah Product Launch System v1.0          ║'))}")
    print(f"{clr('p', bold('║  Komplette Launch-Automation für Stripe LIVE!      ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
    
    if not STRIPE_KEY or not STRIPE_KEY.startswith("sk_live_"):
        print(f"\n  {clr('r','❌ Kein LIVE Stripe-Key gefunden!')}")
        return
    if not OPENAI_KEY:
        print(f"\n  {clr('y','⚠️ Kein OpenAI-Key — Materialien werden ohne KI erstellt')}")
    
    print(f"\n  {clr('g',bold(f'🔥 Stripe LIVE-Modus — Echte Produkte, echtes Geld!'))}\n")
    
    products = get_products()
    if not products:
        print(f"  {clr('r','❌ Keine Produkte gefunden')}")
        return
    
    show_products(products)
    
    print(f"  {bold('Launch-Optionen:')}")
    print(f"  [{clr('g','1')}] Einzelnes Produkt launchen")
    print(f"  [{clr('g','2')}] {bold('ALLE 10 Produkte gleichzeitig launchen (empfohlen)')}")
    print(f"  [{clr('g','3')}] Mehrere Produkte auswählen")
    print(f"  [{clr('g','4')}] Checkout-Links für ALLE Produkte generieren")
    print(f"  [{clr('r','0')}] Beenden")
    
    try:
        choice = input(f"\n  {clr('y','▶')} Auswahl: ").strip()
    except:
        return
    
    indices = []
    if choice == "1":
        try:
            idx = int(input(f"\n  Produktnummer (1-{len(products)}): ").strip()) - 1
            if 0 <= idx < len(products): indices = [idx]
        except: pass
    elif choice == "2":
        indices = list(range(len(products)))
    elif choice == "3":
        try:
            choices = input(f"\n  Produktnummern (z.B. 1,3,5-8): ").strip()
            parts = choices.replace(" ", "").split(",")
            for part in parts:
                if "-" in part:
                    a, b = part.split("-")
                    indices.extend(range(int(a)-1, int(b)))
                else:
                    indices.append(int(part)-1)
            indices = [i for i in indices if 0 <= i < len(products)]
        except: pass
    elif choice == "4":
        print(f"\n  {bold('🔗 Generiere Checkout-Links für ALLE Produkte...')}")
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs("checkout_links", exist_ok=True)
        with open(f"checkout_links/all_products_{ts}.txt", 'w') as f:
            f.write(f"=== ALLE STRIPE PRODUKTE ===\n")
            f.write(f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')}\n\n")
            for p in products:
                if p['price_id']:
                    session = stripe_post("checkout/sessions", {
                        "success_url": "https://167.233.196.20:3000/api/store?success=true",
                        "cancel_url": "https://167.233.196.20:3000/api/store",
                        "mode": "payment",
                        "line_items[0][price]": p['price_id'],
                        "line_items[0][quantity]": "1",
                    })
                    url = session.get("url", "❌")
                    f.write(f"{p['name']} (€{p['price_eur']:.2f}): {url}\n")
                    print(f"  {clr('g','✅')} {p['name'][:35]:35} → Link erstellt")
                    time.sleep(1)
        print(f"\n  {clr('g','✅')} Alle Links gespeichert in: checkout_links/all_products_{ts}.txt")
        print(f"\n  {dim('Enter drücken...')}")
        input()
        return
    
    if not indices:
        print(f"\n  {clr('y','⚠️ Keine Produkte ausgewählt')}")
        return
    
    launch_plan, base_dir = generate_marketing(products, indices)
    
    print(f"\n  {clr('g',bold('╔══════════════════════════════════════════════════╗'))}")
    print(f"{clr('g',bold('║  ✅ LAUNCH-VORBEREITUNG ABGESCHLOSSEN!           ║'))}")
    print(f"{clr('g',bold('╚══════════════════════════════════════════════════╝'))}")
    print(f"\n  📁 Alle Dateien: {clr('b',base_dir)}/")
    print(f"\n  📋 Launch-Plan: {base_dir}/00_LAUNCH_PLAN.md")
    print()
    
    for lp in launch_plan:
        print(f"  {bold(f'📦 {lp[\"name\"]}')} — {clr('g',f'€{lp[\"price\"]:.2f}')}")
        print(f"  🔗 {lp['checkout_url']}")
        for m in lp['materials']:
            print(f"     {m}")
        print()
    
    print(f"  {bold('🚀 Launch-Zeitplan (7 Tage pro Produkt):')}")
    print(f"  TAG 1: LinkedIn + E-Mail 1  |  TAG 2: Instagram + E-Mail 2")
    print(f"  TAG 3: TikTok + E-Mail 3    |  TAG 4: WhatsApp + E-Mail 4")
    print(f"  TAG 5: LinkedIn + E-Mail 5  |  TAG 6: Instagram Story")
    print(f"  TAG 7: Finale WhatsApp + 🔗 Checkout")
    print()
    print(f"  {dim('Enter drücken...')}")
    input()

if __name__ == "__main__":
    main()
