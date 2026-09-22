#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║  CyberSarah WhatsApp Campaign Engine v1.0                          ║
║  Erstellt KI-gestützte WhatsApp-Marketing-Kampagnen                ║
║  Läuft direkt in Termux — kein Server nötig!                       ║
╚══════════════════════════════════════════════════════════════════════╝

Verwendung:
  python3 whatsapp-campaign.py                   # Interaktiv
  python3 whatsapp-campaign.py --auto            # 5 Kampagnen auf einmal
  python3 whatsapp-campaign.py --list            # Zeigt gespeicherte Kampagnen
"""

import os, sys, json, time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path

C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'n': '\033[0m',
    'bold': '\033[1m', 'dim': '\033[2m'
}
def clr(code, t): return f"{C.get(code,'')}{t}{C['n']}"

# Load API key
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or ""
if not OPENAI_API_KEY:
    try:
        with open(".env") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = line.strip().split("=", 1)[1]
                    break
    except:
        pass

def call_ai(prompt, max_tokens=2000):
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
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        )
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]
    except Exception as e:
        return f"⚠️ Fehler: {str(e)}"

PRODUCTS = [
    ("KI-Workflow Automatisierung Pro", "147€", "25 automatisierte KI-Workflows"),
    ("GeldPilot Trading Signals", "79€", "Daily KI-Trading-Signale"),
    ("UnternehmerGPT Enterprise Suite", "297€", "Komplettes KI-Business-System"),
    ("CyberSarah Content Mastery Pack", "49€", "250+ KI-Content-Vorlagen"),
    ("KI-Video Factory Pro", "67€", "Autonome Faceless-Video-Produktion"),
    ("Funnel Builder Enterprise", "129€", "KI-optimierte Sales-Funnels"),
    ("Affiliate Empire Baukasten", "97€", "30+ Affiliate-Programme"),
    ("KI-Coaching Zertifizierung", "497€", "Werde KI-Business-Coach"),
]

def create_campaign():
    produkt = random.choice(PRODUCTS) if 'random' in dir(__builtins__) else PRODUCTS[0]
    
    prompt = f"""Erstelle eine 7-teilige WhatsApp-Marketing-Kampagne für:
Produkt: {produkt[0]}
Preis: {produkt[1]}
Beschreibung: {produkt[2]}

Jede Nachricht: kurz (<200 Zeichen), persönlich, mit Emoji, handlungsorientiert.
Für deutsches Publikum (du/Sie form).

Format:
```
KAMPAGNE: [Name]
ZIEL: [Konkrete Aktion]
ZIELGRUPPE: [Zielgruppe]

TAG 1 - BEWUSSTSEIN:
[Nachricht]

TAG 2 - PROBLEM:  
[Nachricht]

TAG 3 - LOESUNG:
[Nachricht]

TAG 4 - WERT:
[Nachricht mit konkretem Nutzen]

TAG 5 - SOCIAL PROOF:
[Nachricht mit Ergebnis/Testimonial]

TAG 6 - ANGEBOT:
[Nachricht mit Preis + Link]

TAG 7 - CTA:
[Letzte Chance + Dringlichkeit]
```"""
    return call_ai(prompt)

def create_bulk(anzahl=5):
    print(f"\n{clr('bold','📦 Erstelle ' + str(anzahl) + ' Kampagnen...')}")
    results = []
    for i in range(anzahl):
        print(f"   {i+1}/{anzahl}... ", end="", flush=True)
        content = create_campaign()
        results.append(content)
        print(f"{clr('g','✅')}")
        time.sleep(2)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.makedirs("campaigns", exist_ok=True)
    filename = f"campaigns/whatsapp_bulk_{timestamp}.txt"
    with open(filename, 'w') as f:
        f.write(f"=== WHATSAPP KAMPAGNEN ===\n")
        f.write(f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")
        f.write(f"{'='*40}\n\n")
        for i, c in enumerate(results, 1):
            f.write(f"--- KAMPAGNE {i} ---\n{c}\n{'='*40}\n\n")
    
    print(f"\n{clr('g','✅')} {anzahl} Kampagnen gespeichert in: {filename}")
    return results

def list_campaigns():
    camp_dir = Path("campaigns")
    if not camp_dir.exists():
        print(f"{clr('y','📁 Keine Kampagnen gefunden')}")
        return
    files = list(camp_dir.glob("*.txt"))
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    
    if not files:
        print(f"{clr('y','📁 Keine Kampagnen gefunden')}")
        return
    
    print(f"\n{clr('bold','📁 Gespeicherte WhatsApp-Kampagnen:')}")
    for f in files[:10]:
        size = f.stat().st_size
        mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m.%Y %H:%M")
        print(f"   📄 {f.name} ({size} Bytes, {mtime})")

def main():
    print(f"\n{clr('p',clr('bold','╔══════════════════════════════════════════════╗'))}")
    print(f"{clr('p',clr('bold','║  💬 CyberSarah WhatsApp Campaign Engine      ║'))}")
    print(f"{clr('p',clr('bold','╚══════════════════════════════════════════════╝'))}")
    print()
    
    if "--list" in sys.argv:
        list_campaigns()
        return
    
    if "--auto" in sys.argv:
        create_bulk(5)
        return
    
    while True:
        print(f"\n{clr('bold','📋 WhatsApp Kampagnen-Tool')}")
        print(f"  {clr('g','1')} Einzelne Kampagne erstellen")
        print(f"  {clr('g','2')} 5 Kampagnen auf einmal (Bulk)")
        print(f"  {clr('g','3')} 10 Kampagnen auf einmal")
        print(f"  {clr('g','4')} Gespeicherte Kampagnen anzeigen")
        print(f"  {clr('r','0')} Zurück")
        
        choice = input(f"\n{clr('y','▶')} Auswahl: ").strip()
        
        if choice == "1":
            print(f"\n{clr('bold','📝 Erstelle Kampagne...')}")
            content = create_campaign()
            print(f"\n{content}")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.makedirs("campaigns", exist_ok=True)
            with open(f"campaigns/whatsapp_{timestamp}.txt", 'w') as f:
                f.write(content)
            print(f"\n{clr('g','✅')} Gespeichert")
        
        elif choice == "2":
            create_bulk(5)
        
        elif choice == "3":
            create_bulk(10)
        
        elif choice == "4":
            list_campaigns()
        
        elif choice == "0":
            break

if __name__ == "__main__":
    import random
    main()
