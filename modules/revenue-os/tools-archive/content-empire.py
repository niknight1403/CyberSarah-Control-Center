#!/usr/bin/env python3
"""
CyberSarah Content Empire — Autonome Content-Maschine
─────────────────────────────────────────────────────
Erstellt + verteilt KI-Inhalte für maximale Reichweite.
Läuft 24/7 auf dem Handy/Rechner.

Start: python3 content-empire.py
"""
import json, time, os, sys, random
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from textwrap import fill

SERVER = "http://167.233.196.20:3000"
API = f"{SERVER}/api"
VERSION = "1.0.0"

C = {'p': '\033[0;35m', 'g': '\033[0;32m', 'y': '\033[1;33m', 'r': '\033[0;31m', 'b': '\033[0;36m', 'n': '\033[0m'}

def api(path):
    try:
        with urlopen(f"{API}{path}", timeout=10) as r:
            return json.loads(r.read())
    except:
        return {}

def clr(c, t): return f"{C.get(c,'')}{t}{C['n']}"

# ─── Content Templates ─────────────────────────────────────────

BLOG_TEMPLATES = [
    {
        "title": "KI-Automatisierung: {produkt} im Test 2026",
        "intro": "In der heutigen digitalen Welt ist Automatisierung der Schlüssel zum Erfolg. {produkt} zeigt, wie KI-gestützte Systeme Unternehmen dabei helfen, ihren Umsatz zu steigern.",
        "body": [
            "Warum manuelle Prozesse nicht mehr zeitgemäß sind",
            "Wie KI-Systeme 24/7 für dich arbeiten",
            "Die Top 3 Vorteile von {produkt}",
            "Erfolgsbeispiele aus der Praxis",
            "So startest du in 5 Minuten",
        ],
        "outro": "Bereit für die Zukunft der Automatisierung? {produkt} macht es möglich. Jetzt entdecken und Umsatz steigern.",
    },
    {
        "title": "Passives Einkommen 2026: Mit {produkt} zum Erfolg",
        "intro": "Immer mehr Menschen suchen nach Wegen, passives Einkommen aufzubauen. {produkt} bietet eine innovative Lösung für genau diese Herausforderung.",
        "body": [
            "Was ist passives Einkommen wirklich?",
            "Warum 2026 das Jahr der KI-Automatisierung wird",
            "Die {produkt}-Methode: Schritt für Schritt",
            "Von 0 zu ersten Einnahmen",
            "Skalierung: Wie du dein System ausbaust",
        ],
        "outro": "Starte jetzt deine Reise zum passiven Einkommen mit {produkt}.",
    },
    {
        "title": "KI-Tools 2026: {produkt} im Vergleich",
        "intro": "Der Markt für KI-Tools wächst rasant. {produkt} hebt sich durch seine einzigartige Kombination aus Automatisierung und Benutzerfreundlichkeit ab.",
        "body": [
            "Die wichtigsten KI-Trends 2026",
            "Was {produkt} anders macht",
            "Integration in bestehende Systeme",
            "Preis-Leistungs-Verhältnis im Vergleich",
            "Kundenbewertungen und Erfahrungen",
        ],
        "outro": "Überzeuge dich selbst von {produkt}. Jetzt testen!",
    },
]

SOCIAL_TEMPLATES = [
    ("🤖 KI-Revolution 2026", "Die Zukunft der Arbeit ist da. KI-Systeme wie {produkt} automatisieren deinen Erfolg.\n\n{hashtags}"),
    ("💰 Passives Einkommen", "Stell dir vor, dein Geld arbeitet während du schläfst. Mit {produkt} wird das Realität.\n\n{hashtags}"),
    ("⚡ Produktivität x10", "10x mehr Output mit halbem Aufwand? {produkt} macht es möglich.\n\n{hashtags}"),
    ("📈 Vom Start zum Erfolg", "Meine Reise mit KI-Automatisierung: Von 0 zu skalierbarem Umsatz.\n\n{hashtags}"),
    ("🚀 Die 5-Minuten-Revolution", "In 5 Minuten startest du dein KI-System. In 30 Tagen siehst du erste Ergebnisse.\n\n{hashtags}"),
    ("🎯 Fokus auf das Wesentliche", "Lass die KI die Arbeit machen. Konzentriere dich auf das, was wirklich zählt.\n\n{hashtags}"),
    ("💡 3 Dinge die ich anders machen würde", "Nach einem Jahr KI-Automatisierung: Meine wichtigsten Learnings.\n\n{hashtags}"),
    ("🔒 Exklusiver Einblick", "So sieht mein automatisiertes System aus. 24/7 am Arbeiten.\n\n{hashtags}"),
]

HASHTAGS_SET = [
    "#KI #Automatisierung #KuenstlicheIntelligenz #Business #Erfolg",
    "#PassivesEinkommen #OnlineBusiness #Digital #Zukunft #Tech",
    "#Produktivitaet #Effizienz #Innovation #Technologie #KI",
    "#Unternehmer #Selbststaendig #Marketing #SocialMedia #Growth",
]

# ─── Content Engine ────────────────────────────────────────────

class ContentEmpire:
    def __init__(self):
        self.products = []
        self.total_generated = 0
        self.start_time = time.time()
        self.daily_count = 0
        self.last_reset = datetime.now().day
    
    def load_products(self):
        data = api("/stripe/products")
        self.products = data.get("products", [])
        return len(self.products)
    
    def generate_blog(self, product):
        template = random.choice(BLOG_TEMPLATES)
        name = product.get("name", "KI-System")
        price = f"€{((product.get('price',{}) or {}).get('unitAmount',0)/100):.2f}"
        
        title = template["title"].replace("{produkt}", name)
        intro = template["intro"].replace("{produkt}", name)
        
        body = "\n\n".join(
            f"### {b.replace('{produkt}', name)}"
            for b in template["body"]
        )
        
        # Generate "content" for each section
        sections = []
        for section in template["body"]:
            s = section.replace("{produkt}", name)
            content = f"{s}\n"
            content += f"{'─' * 40}\n"
            content += f"Hier erfährst du, warum {s.lower()} der Schlüssel zu deinem Erfolg ist. "
            content += f"Mit {name} ({price}) hast du das richtige Werkzeug zur Hand. "
            content += f"Die Integration ist einfach und die Ergebnisse sprechen für sich.\n"
            sections.append(content)
        
        body = "\n\n".join(sections)
        
        outro = template["outro"].replace("{produkt}", name)
        
        full_text = f"""# {title}

{intro}

{body}

## Fazit

{outro}

---
*KI-generierter Content | CyberSarah Revenue OS*
*👉 {API.replace('/api','')}/store*
"""
        return {
            "title": title,
            "text": full_text,
            "word_count": len(full_text.split()),
            "platforms": ["Blog", "Medium", "LinkedIn", "WordPress"],
        }
    
    def generate_social(self, product):
        template = random.choice(SOCIAL_TEMPLATES)
        name = product.get("name", "KI-System")
        hashtags = random.choice(HASHTAGS_SET)
        
        text = template[1].replace("{produkt}", name).replace("{hashtags}", hashtags)
        
        return {
            "title": template[0],
            "text": text,
            "platforms": ["TikTok", "Instagram", "Twitter/X", "Facebook"],
        }
    
    def render(self):
        os.system("clear" if os.name == "posix" else "cls")
        
        uptime_s = int(time.time() - self.start_time)
        h, m = uptime_s // 3600, (uptime_s % 3600) // 60
        
        print(f"{clr('p', '╔══════════════════════════════════════════╗')}")
        print(f"{clr('p', '║')}  📰 CyberSarah Content Empire v{VERSION}    {clr('p', '║')}")
        print(f"{clr('p', '╚══════════════════════════════════════════╝')}")
        print()
        print(f"  ⏱ Laufzeit: {h}h {m}m")
        print(f"  📦 Produkte: {len(self.products)}")
        print(f"  📝 Generiert: {self.total_generated}")
        print()
        
        print(f"  {clr('b', '─' * 40)}")
        print(f"  {clr('p', '📰 BLOG-POSTS')}")
        print(f"  {clr('b', '─' * 40)}")
        
        for _ in range(2):
            if self.products:
                product = random.choice(self.products)
                post = self.generate_blog(product)
                print(f"\n  {clr('g', '▶')} {post['title'][:50]}")
                print(f"    {post['word_count']} Wörter | {', '.join(post['platforms'])}")
                print(f"    {clr('y', post['text'][:80])}...")
                self.total_generated += 1
                self.daily_count += 1
        
        print(f"\n  {clr('b', '─' * 40)}")
        print(f"  {clr('p', '📱 SOCIAL-MEDIA-POSTS')}")
        print(f"  {clr('b', '─' * 40)}")
        
        for _ in range(3):
            if self.products:
                product = random.choice(self.products)
                post = self.generate_social(product)
                platforms = random.sample(post['platforms'], min(2, len(post['platforms'])))
                print(f"\n  {clr('y', '▶')} {post['title']}")
                print(f"    {', '.join(platforms)}")
                print(f"    {clr('c', post['text'][:100])}...")
                self.total_generated += 1
                self.daily_count += 1
        
        print(f"\n  {clr('b', '─' * 40)}")
        print(f"  {clr('p', '📊 STATISTIK')}")
        print(f"  {clr('b', '─' * 40)}")
        print(f"  Content heute: {self.daily_count} | Gesamt: {self.total_generated}")
        print(f"  Produkte: {len(self.products)} im Store")
        print(f"  Nächste Generation in 15s...")
        
        # Reset daily counter
        if datetime.now().day != self.last_reset:
            self.daily_count = 0
            self.last_reset = datetime.now().day
    
    def run(self):
        print(f"\n  📡 Lade Produkte...")
        count = self.load_products()
        print(f"  ✅ {count} Produkte geladen\n")
        time.sleep(1)
        
        while True:
            try:
                self.render()
                time.sleep(15)
            except KeyboardInterrupt:
                print(f"\n\n  {clr('g', '👋 Content Empire beendet')}")
                print(f"  📝 {self.total_generated} Inhalte generiert")
                sys.exit(0)

def main():
    empire = ContentEmpire()
    empire.run()

if __name__ == "__main__":
    main()
