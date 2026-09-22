#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Revenue Hub v1.0                                        ║
║  Echtzeit-Umsatz-Dashboard + KI-Produkt-Launch-Engine               ║
║                                                                     ║
║  Holt LIVE-Daten vom Server + erstellt KI-gestützte Kampagnen      ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 revenue-hub.py
"""

import os, sys, json, time, random
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

SERVER = "http://167.233.196.20:3000"
API = f"{SERVER}/api"

OPENAI_KEY = os.getenv("OPENAI_API_KEY") or ""
if not OPENAI_KEY:
    try:
        with open(Path(__file__).parent / ".env") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_KEY = line.strip().split("=", 1)[1]
                    break
    except:
        pass

# ─── API Wrapper ──────────────────────────────────────────────────────

def server_api(path):
    try:
        req = Request(f"{API}{path}", method="GET")
        with urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except:
        return None

def call_ai(prompt, max_tokens=2000, temp=0.8):
    if not OPENAI_KEY:
        return "⚠️ Kein OpenAI API Key. Setze OPENAI_API_KEY in .env"
    try:
        data = json.dumps({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temp,
        }).encode()
        req = Request(
            "https://api.openai.com/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {OPENAI_KEY}",
                "Content-Type": "application/json",
            }
        )
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]
    except Exception as e:
        return f"⚠️ Fehler: {str(e)[:150]}"

# ─── Produkte (von Stripe LIVE) ───────────────────────────────────────

PRODUKTE = [
    {"name": "Digitale Networking-Tipps für Berufstätige", "price": "39.00", "desc": "Networking-Strategien"},
    {"name": "Kreative Online-Dienstleistungs-Ideen", "price": "29.00", "desc": "Business-Ideen"},
    {"name": "KI-Content-Erstellung leicht gemacht", "price": "39.00", "desc": "KI-Content-Guide"},
]

# ─── Revenue Hub ──────────────────────────────────────────────────────

class RevenueHub:
    def __init__(self):
        self.running = True
        self.server_data = {}
        self.generated = []
        self.start_time = datetime.now()
        self.load_server_data()
    
    def load_server_data(self):
        """Holt Daten vom LIVE-Server"""
        print(f"\n  {bold('📡 Verbinde zum Server...')}")
        
        status = server_api("/system-status")
        if status:
            self.server_data['status'] = status
            print(f"  ✅ Server verbunden")
            print(f"  💳 Stripe: {clr('g','LIVE') if status.get('stripeVerfuegbar') else clr('r','❌')}")
            print(f"  🤖 OpenAI: {'✅' if status.get('openaiVerfuegbar') else '❌'}")
            print(f"  🔮 Gemini: {'✅' if status.get('geminiVerfuegbar') else '❌'}")
        else:
            print(f"  {clr('y','⚠️ Server nicht erreichbar (Offline-Modus)')}")
        
        agents = server_api("/agents")
        if agents:
            self.server_data['agents'] = agents
            by_status = {}
            for a in agents:
                s = a.get('status', '?')
                by_status[s] = by_status.get(s, 0) + 1
            print(f"  🤖 Agenten: {len(agents)} ({', '.join(f'{k}={v}' for k,v in by_status.items())})")
    
    def show_dashboard(self):
        print(f"{C['cls']}")
        print(f"{clr('p', bold('╔══════════════════════════════════════════════════════╗'))}")
        print(f"{clr('p', bold('║  💰 CyberSarah Revenue Hub v1.0                    ║'))}")
        print(f"{clr('p', bold('╚══════════════════════════════════════════════════════╝'))}")
        print()
        
        # Server Status
        print(f"  {bold('📊 Live-Status')}")
        s = self.server_data.get('status', {})
        print(f"  Stripe:    {clr('g','✅ LIVE') if s.get('stripeVerfuegbar') else clr('r','❌')}  |  OpenAI: {'✅' if s.get('openaiVerfuegbar') else '❌'}  |  Gemini: {'✅' if s.get('geminiVerfuegbar') else '❌'}")
        
        agents = self.server_data.get('agents', [])
        active = sum(1 for a in agents if a.get('status') in ('aktiv', 'online'))
        total = len(agents)
        print(f"  Agenten:   {active}/{total} aktiv  |  Umsatzsystem: {clr('g','✅ Bereit') if s.get('stripeVerfuegbar') else clr('r','❌')}")
        print()
        
        # Produkte
        print(f"  {bold('🛍️  Stripe LIVE Produkte')}")
        for i, p in enumerate(PRODUKTE, 1):
            print(f"  {i}. {p['name']}")
            print(f"     {clr('g',f'€{p[\"price\"]}')} — {p['desc']}")
            print(f"     {dim(f'Checkout: {SERVER}/api/store')}")
        print()
        
        # KI-Aktionen
        print(f"  {bold('🚀 KI-Produkt-Launch-Engine')}")
        print(f"  [{clr('g','1')}] Produkt-Beschreibung optimieren (KI)")
        print(f"  [{clr('g','2')}] Social-Media-Post erstellen")
        print(f"  [{clr('g','3')}] E-Mail-Kampagne generieren")
        print(f"  [{clr('g','4')}] Kompletten Launch-Funnel generieren")
        print(f"  [{clr('g','5')}] Alle Produkte gleichzeitig bewerben")
        print(f"  [{clr('g','6')}] Server-Daten aktualisieren")
        print(f"  [{clr('r','0')}] Beenden")
        
        # Letzte Generierungen
        if self.generated:
            print(f"\n  {bold(f'📁 Letzte {min(3, len(self.generated))} Aktionen')}")
            for g in self.generated[-3:]:
                print(f"  {g['icon']} {g['action']} — {g['time']}")
        
        print(f"\n  {dim('─'*50)}")
    
    def optimize_product(self):
        print(f"\n  {bold('📝 Produktbeschreibung optimieren')}")
        for i, p in enumerate(PRODUKTE, 1):
            print(f"  {i}. {p['name']} ({clr('g',f'€{p[\"price\"]}')})")
        
        try:
            choice = int(input(f"\n  {clr('y','▶')} Produkt (1-3): ").strip())
            if choice < 1 or choice > len(PRODUKTE):
                return
            produkt = PRODUKTE[choice - 1]
        except:
            return
        
        print(f"\n  {bold('🧠 KI optimiert...')}")
        prompt = f"""Du bist ein Copywriter-Experte. Optimiere die Produktbeschreibung für:
Produkt: {produkt['name']}
Preis: €{produkt['price']}

Schreibe eine überzeugende Produktbeschreibung (200 Wörter) mit:
- Aufmerksamkeitsstarker Überschrift
- Schmerzpunkte des Kunden
- Nutzenversprechen
- Social Proof
- Klarem CTA
Zielgruppe: Deutschsprachige Unternehmer, die KI nutzen wollen."""
        
        result = call_ai(prompt)
        print(f"\n  {result}")
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = produkt['name'].replace(' ', '_').lower()[:20]
        os.makedirs("launch_content", exist_ok=True)
        with open(f"launch_content/optimierung_{safe}_{ts}.txt", 'w') as f:
            f.write(f"Produkt: {produkt['name']}\nPreis: €{produkt['price']}\n\n{result}")
        
        self.generated.append({
            'icon': '📝', 'action': f'Optimierung: {produkt["name"][:30]}',
            'time': datetime.now().strftime("%H:%M")
        })
        print(f"\n  {clr('g','✅')} Gespeichert: launch_content/optimierung_{safe}_{ts}.txt")
        input(f"\n  {dim('Enter drücken...')}")
    
    def create_social_post(self):
        print(f"\n  {bold('📱 Social-Media-Post erstellen')}")
        for i, p in enumerate(PRODUKTE, 1):
            print(f"  {i}. {p['name']} ({clr('g',f'€{p[\"price\"]}')})")
        
        try:
            choice = int(input(f"\n  {clr('y','▶')} Produkt (1-3): ").strip())
            if choice < 1 or choice > len(PRODUKTE):
                return
            produkt = PRODUKTE[choice - 1]
        except:
            return
        
        print(f"  Plattform:")
        print(f"  [{clr('g','1')}] TikTok")
        print(f"  [{clr('g','2')}] Instagram")
        print(f"  [{clr('g','3')}] LinkedIn")
        print(f"  [{clr('g','4')}] Alle")
        
        try:
            plat = int(input(f"\n  {clr('y','▶')} Plattform (1-4): ").strip())
        except:
            return
        
        platforms = {1: "TikTok", 2: "Instagram", 3: "LinkedIn", 4: "Alle"}
        platform = platforms.get(plat, "Instagram")
        
        prompt = f"""Erstelle einen {platform}-Post zur Bewerbung von:
Produkt: {produkt['name']}
Preis: €{produkt['price']}

Der Post muss:
- Zum Kauf motivieren
- Auf Deutsch sein
- Emojis enthalten
- Hashtags enthalten
- Einen klaren Call-to-Action haben

{'Erstelle 3 Varianten für jede Plattform.' if platform == 'Alle' else f'Erstelle einen Post für {platform}.'}"""
        
        print(f"\n  {bold('🧠 KI erstellt...')}")
        result = call_ai(prompt, max_tokens=1500)
        print(f"\n  {result}")
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = produkt['name'].replace(' ', '_').lower()[:20]
        os.makedirs("launch_content", exist_ok=True)
        with open(f"launch_content/social_{platform}_{safe}_{ts}.txt", 'w') as f:
            f.write(f"Produkt: {produkt['name']}\nPlattform: {platform}\n\n{result}")
        
        self.generated.append({
            'icon': '📱', 'action': f'Social ({platform}): {produkt["name"][:25]}',
            'time': datetime.now().strftime("%H:%M")
        })
        print(f"\n  {clr('g','✅')} Gespeichert: launch_content/social_{platform}_{safe}_{ts}.txt")
        input(f"\n  {dim('Enter drücken...')}")
    
    def create_email_campaign(self):
        print(f"\n  {bold('📧 E-Mail-Kampagne erstellen')}")
        for i, p in enumerate(PRODUKTE, 1):
            print(f"  {i}. {p['name']} ({clr('g',f'€{p[\"price\"]}')})")
        
        try:
            choice = int(input(f"\n  {clr('y','▶')} Produkt (1-3): ").strip())
            if choice < 1 or choice > len(PRODUKTE):
                return
            produkt = PRODUKTE[choice - 1]
        except:
            return
        
        prompt = f"""Erstelle eine 5-teilige E-Mail-Kampagne (Nurture-Sequence) für:
Produkt: {produkt['name']}
Preis: €{produkt['price']}
Zielgruppe: Deutschsprachige Unternehmer

Jede E-Mail: Betreffzeile + 100-150 Wörter Text + CTA

TAG 1 - Bewusstsein: Das Problem
TAG 2 - Interesse: Die Lösung existiert  
TAG 3 - Entscheidung: Warum unser Produkt
TAG 4 - Wert: Zusätzliche Benefits
TAG 5 - Kauf: Angebot + Dringlichkeit"""
        
        print(f"\n  {bold('🧠 KI erstellt...')}")
        result = call_ai(prompt, max_tokens=2500)
        print(f"\n  {result}")
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = produkt['name'].replace(' ', '_').lower()[:20]
        os.makedirs("launch_content", exist_ok=True)
        with open(f"launch_content/email_{safe}_{ts}.txt", 'w') as f:
            f.write(f"Produkt: {produkt['name']}\nPreis: €{produkt['price']}\n\n{result}")
        
        self.generated.append({
            'icon': '📧', 'action': f'E-Mail: {produkt["name"][:30]}',
            'time': datetime.now().strftime("%H:%M")
        })
        print(f"\n  {clr('g','✅')} Gespeichert: launch_content/email_{safe}_{ts}.txt")
        input(f"\n  {dim('Enter drücken...')}")
    
    def create_launch_funnel(self):
        print(f"\n  {bold('🚀 Kompletter Launch-Funnel')}")
        for i, p in enumerate(PRODUKTE, 1):
            print(f"  {i}. {p['name']} ({clr('g',f'€{p[\"price\"]}')})")
        
        try:
            choice = int(input(f"\n  {clr('y','▶')} Produkt (1-3): ").strip())
            if choice < 1 or choice > len(PRODUKTE):
                return
            produkt = PRODUKTE[choice - 1]
        except:
            return
        
        prompt = f"""Erstelle einen KOMPLETTEN Launch-Funnel für:
Produkt: {produkt['name']}
Preis: €{produkt['price']}

Erstelle:
1. TikTok-Video-Skript (60s)
2. Instagram-Post (+ Story-Idee)
3. 5-teilige E-Mail-Sequenz
4. WhatsApp-CTA-Nachricht
5. 3 LinkedIn-Posts

Alles auf Deutsch, mit Emojis, zielgruppenoptimiert für Unternehmer."""
        
        print(f"\n  {bold('🧠 KI erstellt kompletten Funnel...')}")
        result = call_ai(prompt, max_tokens=3000, temp=0.85)
        print(f"\n  {result}")
        
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = produkt['name'].replace(' ', '_').lower()[:20]
        os.makedirs("launch_content", exist_ok=True)
        with open(f"launch_content/funnel_{safe}_{ts}.txt", 'w') as f:
            f.write(f"Produkt: {produkt['name']}\nPreis: €{produkt['price']}\n\n{result}")
        
        self.generated.append({
            'icon': '🚀', 'action': f'Funnel: {produkt["name"][:30]}',
            'time': datetime.now().strftime("%H:%M")
        })
        print(f"\n  {clr('g','✅')} Kompletter Funnel gespeichert!")
        input(f"\n  {dim('Enter drücken...')}")
    
    def promote_all(self):
        print(f"\n  {bold('📢 Bewerbe ALLE Produkte')}")
        
        for i, produkt in enumerate(PRODUKTE, 1):
            print(f"\n  {bold(f'📦 Produkt {i}: {produkt[\"name\"]}')}")
            print(f"  {clr('g',f'€{produkt[\"price\"]}')}")
            prompt = f"Erstelle einen kurzen Twitter/LinkedIn-Post (max 500 Zeichen) zur Bewerbung von: {produkt['name']} (€{produkt['price']}). Mit Emojis und CTA. Deutsch."
            result = call_ai(prompt, max_tokens=500)
            print(f"  {result[:300]}")
            time.sleep(2)
        
        print(f"\n  {clr('g','✅')} Alle Produkte beworben!")
        input(f"\n  {dim('Enter drücken...')}")

    def run(self):
        while self.running:
            self.show_dashboard()
            
            try:
                choice = input(f"\n  {clr('y','▶')} Aktion: ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            
            if choice == "1":
                self.optimize_product()
            elif choice == "2":
                self.create_social_post()
            elif choice == "3":
                self.create_email_campaign()
            elif choice == "4":
                self.create_launch_funnel()
            elif choice == "5":
                self.promote_all()
            elif choice == "6":
                print(f"\n  {bold('🔄 Aktualisiere...')}")
                self.load_server_data()
                input(f"\n  {dim('Enter drücken...')}")
            elif choice == "0":
                self.running = False
            
def main():
    hub = RevenueHub()
    try:
        hub.run()
    except KeyboardInterrupt:
        pass
    print(f"\n\n{clr('g','👋 Bis zum nächsten Mal!')}\n")

if __name__ == "__main__":
    main()
