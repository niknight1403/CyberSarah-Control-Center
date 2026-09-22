#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Social Content Engine v1.0                             ║
║  Erstellt KI-Inhalte für TikTok, Instagram, YouTube & WhatsApp     ║
║  Treibt Traffic + Umsatz — läuft direkt in Termux!                 ║
╚══════════════════════════════════════════════════════════════════════╝

Verwendung:
  python3 social-content-engine.py           # Interaktives Menü
  python3 social-content-engine.py --auto    # Autonomer Modus (erstellt + speichert)
  python3 social-content-engine.py --tiktok  # Nur TikTok-Inhalte
  python3 social-content-engine.py --all     # Alle Plattformen auf einmal
"""

import os
import sys
import json
import time
import random
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

# ─── Farben ───────────────────────────────────────────────────────────
C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'n': '\033[0m',
    'bold': '\033[1m', 'dim': '\033[2m'
}

def clr(code, t): return f"{C.get(code,'')}{t}{C['n']}"

# ─── OpenAI API ──────────────────────────────────────────────────────

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or ""
if not OPENAI_API_KEY:
    # Try loading from .env
    try:
        with open(".env") as f:
            for line in f:
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = line.strip().split("=", 1)[1]
                    break
    except:
        pass

if not OPENAI_API_KEY:
    print(f"{clr('r','❌ Kein OPENAI_API_KEY gefunden!')}")
    print(f"  Setze Umgebungsvariable: export OPENAI_API_KEY=sk-...")
    print(f"  Oder lege eine .env-Datei an")
    sys.exit(1)

def call_openai(prompt, model="gpt-4o-mini", max_tokens=2000, temp=0.8):
    """Ruft OpenAI API auf und gibt Text zurück."""
    try:
        data = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temp,
        }).encode()
        req = Request(
            "https://api.openai.com/v1/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            }
        )
        with urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"]
    except URLError as e:
        return f"⚠️ API-Fehler: {e.reason if hasattr(e,'reason') else str(e)}"
    except Exception as e:
        return f"⚠️ Fehler: {str(e)}"

# ─── Content Generators ──────────────────────────────────────────────

MARKEN = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"]
PRODUKTE = [
    ("KI-Workflow Automatisierung Pro", "147.00"),
    ("GeldPilot Trading Signals", "79.00"),
    ("UnternehmerGPT Enterprise Suite", "297.00"),
    ("CyberSarah Content Mastery Pack", "49.00"),
    ("Affiliate Empire Baukasten", "97.00"),
    ("KI-Video Factory Pro", "67.00"),
    ("Funnel Builder Enterprise", "129.00"),
    ("SEO Empire Builder", "89.00"),
]

def generate_tiktok_script():
    """Erzeugt ein TikTok-Video-Skript mit KI."""
    marke = random.choice(MARKEN)
    produkt = random.choice(PRODUKTE)
    prompt = f"""Du bist ein viraler TikTok-Content-Creator für {marke}.
Erstelle ein 60-Sekunden TikTok-Video-Skript, das für "{produkt[0]}" (€{produkt[1]}) wirbt.

Das Skript muss enthalten:
1. **Hook** (erste 3 Sekunden) — etwas das Aufmerksamkeit erzwingt
2. **Problem** (5-10 Sekunden) — zeige ein echtes Schmerzpunkt
3. **Lösung** (15-20 Sekunden) — präsentiere das Produkt
4. **Social Proof** (10 Sekunden) — zeige Ergebnisse
5. **CTA** (letzte 5 Sekunden) — Call-to-Action

Format:
```
TITEL: [Griffiger Titel]
DURATION: 60s
SPRACHE: Deutsch
HOOK: [Text]
PROBLEM: [Text]
LOESUNG: [Text mit Produkterwähnung]
SOCIAL_PROOF: [Text]
CTA: [Text]
HASHTAGS: [10 relevante Hashtags]
```"""
    return call_openai(prompt, temp=0.9)

def generate_instagram_post():
    """Erzeugt einen Instagram-Post mit KI."""
    marke = random.choice(MARKEN)
    produkt = random.choice(PRODUKTE)
    prompt = f"""Du bist ein Instagram-Content-Stratege für {marke}.
Erstelle einen hochkonvertierenden Instagram-Post für "{produkt[0]}" (€{produkt[1]}).

Format:
```
BILDBESCHREIBUNG: [Beschreibung des Bildes/der Grafik]
UEBERSCHRIFT: [Max 2 Zeilen]
TEXT: [Engagierender Post-Text, 100-150 Wörter]
CTA: [Call-to-Action]
HASHTAGS: [20 relevante Hashtags]
ERWAEHNUNGEN: [3 relevante Accounts zum Verlinken]
```

Der Post muss zum Kauf/ zur Anmeldung motivieren."""
    return call_openai(prompt, temp=0.85)

def generate_youtube_script():
    """Erzeugt ein YouTube-Video-Skript."""
    marke = random.choice(MARKEN)
    prompt = f"""Du bist ein YouTube-Content-Stratege für {marke}.
Erstelle ein 8-10 Minuten YouTube-Video-Skript zum Thema "Wie KI dein Business automatisiert".

Format:
```
TITEL: [Klickstarker Titel]
THUMBNAIL_TEXT: [Text für Thumbnail]
INTRO: [30 Sekunden Hook]
KAPITEL:
  0:00 - Intro
  0:30 - [Kapitel 1]
  3:00 - [Kapitel 2]  
  5:30 - [Kapitel 3]
  8:00 - CTA & Outro
OUTRO: [Abonnieren + Produkt vorstellen]
BESCHREIBUNG: [SEO-optimierte Beschreibung, 200 Wörter]
TAGS: [15 relevante Tags]
```"""
    return call_openai(prompt, temp=0.85)

def generate_whatsapp_campaign():
    """Erzeugt eine WhatsApp-Marketing-Kampagne."""
    marke = random.choice(MARKEN)
    produkt = random.choice(PRODUKTE)
    prompt = f"""Du bist ein WhatsApp-Marketing-Experte für {marke}.
Erstelle eine 5-teilige WhatsApp-Kampagne für "{produkt[0]}" (€{produkt[1]}).

Jede Nachricht muss kurz, persönlich und handlungsorientiert sein.

Format:
```
KAMPAGNE: {produkt[0]} Launch
ZIELGRUPPE: Interessenten & Warme Leads

TAG 1 - TEASER:
[Kurze Teasernachricht, max 200 Zeichen]

TAG 2 - PROBLEM:
[Problem-basierte Nachricht]

TAG 3 - LOESUNG:
[Produktvorstellung mit Link]

TAG 4 - SOCIAL PROOF:
[Ergebnisse/Testimonials]

TAG 5 - CTA:
[Letzte Chance Call-to-Action]
```"""
    return call_openai(prompt, temp=0.8)

def generate_all_content():
    """Erzeugt Content für ALLE Plattformen."""
    results = {}
    print(f"\n{clr('bold','📱 Generiere TikTok-Inhalt...')}")
    results['tiktok'] = generate_tiktok_script()
    print(f"   ✅ TikTok-Skript erstellt")
    
    print(f"{clr('bold','📸 Generiere Instagram-Post...')}")
    results['instagram'] = generate_instagram_post()
    print(f"   ✅ Instagram-Post erstellt")
    
    print(f"{clr('bold','🎬 Generiere YouTube-Skript...')}")
    results['youtube'] = generate_youtube_script()
    print(f"   ✅ YouTube-Skript erstellt")
    
    print(f"{clr('bold','💬 Generiere WhatsApp-Kampagne...')}")
    results['whatsapp'] = generate_whatsapp_campaign()
    print(f"   ✅ WhatsApp-Kampagne erstellt")
    
    return results

def save_content(results):
    """Speichert generierten Content in Dateien."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = "content_output"
    os.makedirs(output_dir, exist_ok=True)
    
    saved = []
    for platform, content in results.items():
        filename = f"{output_dir}/{platform}_{timestamp}.txt"
        with open(filename, 'w') as f:
            f.write(f"=== {platform.upper()} CONTENT ===\n")
            f.write(f"Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")
            f.write("=" * 40 + "\n\n")
            f.write(content)
        saved.append(filename)
    
    # Auch JSON speichern für API-Integration
    json_file = f"{output_dir}/all_{timestamp}.json"
    with open(json_file, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    saved.append(json_file)
    
    return saved

def print_banner():
    print(f"\n{clr('p',clr('bold','╔══════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p',clr('bold','║  📱 CyberSarah Social Content Engine v1.0           ║'))}")
    print(f"{clr('p',clr('bold','║  KI-Inhalte für TikTok • Instagram • YouTube • WA   ║'))}")
    print(f"{clr('p',clr('bold','╚══════════════════════════════════════════════════════╝'))}")
    print(f"{clr('dim',f'  OpenAI: gpt-4o-mini | {datetime.now().strftime(\"%d.%m.%Y %H:%M\")}')}")
    print()

def print_content(platform, content):
    """Gibt Content formatiert aus."""
    print(f"\n{clr('b',clr('bold',f'─── {platform.upper()} ───'))}")
    print(content[:800])
    if len(content) > 800:
        print(f"{clr('dim','... (gekürzt, vollständig in Datei)')}")
    print()

def show_menu():
    print(f"\n{clr('bold','Was möchtest du erstellen?')}")
    print(f"  {clr('g','1')} TikTok Video-Skript")
    print(f"  {clr('g','2')} Instagram Post")
    print(f"  {clr('g','3')} YouTube Video-Skript")
    print(f"  {clr('g','4')} WhatsApp Kampagne")
    print(f"  {clr('g','5')} {clr('bold','ALLE Plattformen (empfohlen)')}")
    print(f"  {clr('g','6')} Automatik-Modus (alle 30 Min neuer Content)")
    print(f"  {clr('r','0')} Beenden")
    return input(f"\n{clr('y','▶')} Auswahl: ").strip()

def auto_mode():
    """Autonomer Modus: erstellt alle 30 Min Content."""
    print(f"\n{clr('bold','🤖 Automatik-Modus gestartet!')}")
    print(f"  Erstellt alle 30 Minuten neuen Content für alle Plattformen\n")
    
    count = 0
    try:
        while True:
            count += 1
            print(f"{clr('b',clr('bold',f'[{datetime.now().strftime(\"%H:%M:%S\")}] Runde {count}'))}")
            results = generate_all_content()
            saved = save_content(results)
            print(f"\n{clr('g','✅')} Content gespeichert:")
            for f in saved:
                print(f"   📁 {f}")
            print(f"\n{clr('dim','⏳ Nächste Runde in 30 Minuten...')}")
            time.sleep(30 * 60)
    except KeyboardInterrupt:
        print(f"\n\n{clr('y','🛑 Automatik-Modus beendet')}")
        print(f"{clr('g',f'✅ {count} Runden abgeschlossen')}")

def main():
    print_banner()
    
    if "--auto" in sys.argv or "--all" in sys.argv:
        results = generate_all_content()
        saved = save_content(results)
        print(f"\n{clr('g','✅')} Content gespeichert:")
        for f in saved:
            print(f"   📁 {f}")
        
        # Content anzeigen
        for platform, content in results.items():
            print_content(platform, content)
        return
    
    if "--tiktok" in sys.argv:
        content = generate_tiktok_script()
        print_content("TikTok", content)
        return
    
    if "--instagram" in sys.argv:
        content = generate_instagram_post()
        print_content("Instagram", content)
        return
    
    while True:
        choice = show_menu()
        
        if choice == "1":
            print(f"\n{clr('bold','📱 Generiere TikTok-Skript...')}")
            content = generate_tiktok_script()
            print_content("TikTok", content)
            save = input(f"{clr('y','💾 Speichern? (j/N): ')}").lower()
            if save == 'j':
                saved = save_content({'tiktok': content})
                print(f"{clr('g','✅')} Gespeichert: {saved[0]}")
        
        elif choice == "2":
            print(f"\n{clr('bold','📸 Generiere Instagram-Post...')}")
            content = generate_instagram_post()
            print_content("Instagram", content)
            save = input(f"{clr('y','💾 Speichern? (j/N): ')}").lower()
            if save == 'j':
                saved = save_content({'instagram': content})
                print(f"{clr('g','✅')} Gespeichert: {saved[0]}")
        
        elif choice == "3":
            print(f"\n{clr('bold','🎬 Generiere YouTube-Skript...')}")
            content = generate_youtube_script()
            print_content("YouTube", content)
            save = input(f"{clr('y','💾 Speichern? (j/N): ')}").lower()
            if save == 'j':
                saved = save_content({'youtube': content})
                print(f"{clr('g','✅')} Gespeichert: {saved[0]}")
        
        elif choice == "4":
            print(f"\n{clr('bold','💬 Generiere WhatsApp-Kampagne...')}")
            content = generate_whatsapp_campaign()
            print_content("WhatsApp", content)
            save = input(f"{clr('y','💾 Speichern? (j/N): ')}").lower()
            if save == 'j':
                saved = save_content({'whatsapp': content})
                print(f"{clr('g','✅')} Gespeichert: {saved[0]}")
        
        elif choice == "5":
            print(f"\n{clr('bold','📱 Generiere Content für ALLE Plattformen...')}")
            results = generate_all_content()
            saved = save_content(results)
            print(f"\n{clr('g','✅')} Content gespeichert:")
            for f in saved:
                print(f"   📁 {f}")
            for platform, content in results.items():
                print_content(platform, content)
        
        elif choice == "6":
            auto_mode()
        
        elif choice == "0":
            print(f"\n{clr('g','👋 Bis bald!')}")
            break

if __name__ == "__main__":
    main()
