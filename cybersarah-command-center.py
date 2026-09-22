#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah Terminal Command Center v1.0                            ║
║  DAS Kommandozentrum — läuft OHNE Server direkt in Termux!         ║
║                                                                     ║
║  Funktionen: Dashboard • Content • Revenue • Campaigns • Deploy    ║
╚═══════════════════════════════════════════════════════════════════════╝

Start:  python3 cybersarah-command-center.py
Tasten: 1-6 für Tabs, q zum Beenden
"""

import os, sys, json, time, random
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError
from textwrap import fill
from pathlib import Path

# ─── Colors ───────────────────────────────────────────────────────────
C = {
    'p': '\033[0;95m', 'g': '\033[0;92m', 'y': '\033[1;93m',
    'r': '\033[0;91m', 'b': '\033[0;96m', 'w': '\033[1;97m',
    'n': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
    'cls': '\033[2J\033[H', 'home': '\033[H',
}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)
def dim(t): return clr('dim', t)

# ─── API Keys ─────────────────────────────────────────────────────────

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

SERVER_URL = os.getenv("SERVER_URL", "http://167.233.196.20:3000")

# ─── State ────────────────────────────────────────────────────────────

class App:
    def __init__(self):
        self.tab = "dashboard"
        self.running = True
        self.last_refresh = 0
        self.server_online = False
        self.server_data = {}
        self.generated_content = []
        self.campaigns = []
        self.dashboard = self.init_dashboard()
        self.start_time = datetime.now()
    
    def init_dashboard(self):
        return {
            'system': '✅ Bereit',
            'uptime': '0 Min',
            'ai_model': 'gpt-4o-mini',
            'ai_ready': bool(OPENAI_KEY),
            'server': 'Nicht verbunden',
            'content_count': 0,
            'campaign_count': 0,
        }
    
    def refresh_server(self):
        """Prüft Server + sammelt Daten"""
        try:
            req = Request(f"{SERVER_URL}/api/quick-status", method="GET")
            with urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
                self.server_online = True
                self.server_data = data
                self.dashboard['server'] = '✅ Online'
                self.dashboard['system'] = data.get('oneLine', '✅ Verbunden')
                return True
        except:
            self.server_online = False
            self.dashboard['server'] = '⚠️ Offline'
            return False

    def call_ai(self, prompt, max_tokens=1500, temp=0.8):
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
                headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"}
            )
            with urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())["choices"][0]["message"]["content"]
        except Exception as e:
            return f"⚠️ AI Fehler: {str(e)[:100]}"

# ─── UI Components ────────────────────────────────────────────────────

def draw_header(app):
    uptime = str(datetime.now() - app.start_time).split('.')[0]
    print(f"{clr('p', bold('╔══════════════════════════════════════════════════════════════╗'))}")
    print(f"{clr('p', bold('║  🚀 CyberSarah Revenue OS — Terminal Command Center v1.0  ║'))}")
    print(f"{clr('p', bold('╚══════════════════════════════════════════════════════════════╝'))}")
    print(f"  {dim('Laufzeit:')} {uptime}  |  {dim('AI:')} {'✅ GPT-4o-mini' if OPENAI_KEY else '❌ Kein Key'}  |  {dim('Server:')} {app.dashboard['server']}")
    print()

def draw_tabs(app):
    tabs = [
        ('1', 'Dashboard'), ('2', 'Content'), ('3', 'Revenue'),
        ('4', 'WhatsApp'), ('5', 'Deploy'), ('6', 'Tools')
    ]
    tab_line = "  "
    for key, name in tabs:
        marker = '▶' if app.tab == ['dashboard','content','revenue','whatsapp','deploy','tools'][tabs.index((key, name))] else ' '
        if app.tab == ['dashboard','content','revenue','whatsapp','deploy','tools'][tabs.index((key, name))]:
            tab_line += f"{clr('b', bold(f' [{key}] {name} '))}  "
        else:
            tab_line += f"{dim(f' [{key}] {name} ')}  "
    print(tab_line)
    print(f"  {dim('─' * 55)}")
    print()

def draw_dashboard(app):
    """Dashboard Tab"""
    # Links
    print(f"  {bold('🔗 Quick Links')}")
    print(f"  {clr('b','🏠')} Startseite:       {SERVER_URL}")
    print(f"  {clr('b','🛍️')} Store:            {SERVER_URL}/api/store")
    print(f"  {clr('b','💰')} Revenue:          {SERVER_URL}/api/revenue")
    print(f"  {clr('b','📊')} Monitoring:       {SERVER_URL}/api/system-dashboard")
    print(f"  {clr('b','🤖')} Agenten:          {SERVER_URL}/api/agents")
    print(f"  {clr('b','📱')} APK-Download:     {SERVER_URL}/apk/")
    print()
    
    # Status
    print(f"  {bold('📊 Status')}")
    status_items = [
        ('System', app.dashboard['system']),
        ('AI-Modell', 'GPT-4o-mini (bereit)' if OPENAI_KEY else '❌ Kein API-Key'),
        ('Server', app.dashboard['server']),
        ('Content', f"{len(app.generated_content)} erstellt"),
        ('WA-Kampagnen', f"{len(app.campaigns)} erstellt"),
    ]
    for label, value in status_items:
        print(f"  {label:15} {value}")
    
    # Aktionen
    print()
    print(f"  {bold('⚡ Aktionen')}")
    actions = [
        ('c', 'Content erstellen (TikTok/IG/YT)'),
        ('w', 'WhatsApp-Kampagne erstellen'),
        ('r', 'Server-Status prüfen'),
        ('d', 'Server deployen'),
    ]
    for key, desc in actions:
        print(f"    [{clr('g',key)}] {desc}")

def draw_content(app):
    """Content Tab"""
    print(f"  {bold('📱 Content erstellen')}")
    print(f"  {dim('─'*40)}")
    print(f"  [{clr('g','1')}] TikTok Video-Skript")
    print(f"  [{clr('g','2')}] Instagram Post")
    print(f"  [{clr('g','3')}] YouTube Video-Skript")
    print(f"  [{clr('g','4')}] {bold('Alle Plattformen')}")
    print(f"  [{clr('g','5')}] Auto-Modus (alle 30 Min)")
    
    if app.generated_content:
        print(f"\n  {bold(f'📁 Letzte {min(3, len(app.generated_content))} Inhalte')}")
        for c in app.generated_content[-3:]:
            print(f"  📄 {c['platform']} — {c['time']}")

def draw_revenue(app):
    """Revenue Tab"""
    print(f"  {bold('💰 Revenue Dashboard')}")
    print(f"  {dim('─'*40)}")
    
    if app.server_online:
        print(f"  Server verbunden — rufe Live-Daten ab...")
    else:
        print(f"  {clr('y','⚠️  Server offline — zeige lokale Daten')}")
    
    print(f"\n  {bold('📈 Produkte (8 Stripe-fertig)')}")
    products = [
        ("KI-Workflow Automatisierung Pro", "147€"),
        ("GeldPilot Trading Signals", "79€"),
        ("UnternehmerGPT Enterprise Suite", "297€"),
        ("CyberSarah Content Mastery Pack", "49€"),
        ("KI-Video Factory Pro", "67€"),
        ("Funnel Builder Enterprise", "129€"),
        ("Affiliate Empire Baukasten", "97€"),
        ("KI-Coaching Zertifizierung", "497€"),
    ]
    for name, price in products:
        print(f"  💳 {name:40} {clr('g',price)}")
    
    print(f"\n  {bold('📊 Aktionen')}")
    print(f"  [{clr('g','1')}] Revenue-Report generieren (KI)")
    print(f"  [{clr('g','2')}] Neue Produktidee entwickeln (KI)")
    print(f"  [{clr('g','3')}] Server-Revenue prüfen (online)")

def draw_whatsapp(app):
    """WhatsApp Tab"""
    print(f"  {bold('💬 WhatsApp Campaigns')}")
    print(f"  {dim('─'*40)}")
    print(f"  [{clr('g','1')}] Neue 7-Tage-Kampagne erstellen")
    print(f"  [{clr('g','2')}] 5 Kampagnen auf einmal (Bulk)")
    print(f"  [{clr('g','3')}] Gespeicherte Kampagnen anzeigen")
    
    # Check for saved campaigns
    camp_dir = Path("campaigns")
    if camp_dir.exists():
        files = list(camp_dir.glob("*.txt"))
        if files:
            print(f"\n  {bold(f'📁 {len(files)} Kampagnen gespeichert')}")
            for f in files[-3:]:
                mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m. %H:%M")
                print(f"  📄 {f.name} ({mtime})")

def draw_deploy(app):
    """Deploy Tab"""
    print(f"  {bold('🚀 Server Deployment')}")
    print(f"  {dim('─'*40)}")
    app.refresh_server()
    
    if app.server_online:
        print(f"  {clr('g','✅ Server ist online!')}")
        if 'oneLine' in app.server_data:
            print(f"  📊 {app.server_data['oneLine']}")
    else:
        print(f"  {clr('y','⚠️  Server nicht erreichbar')}")
    
    print(f"\n  {bold('📋 Deployment-Optionen')}")
    print(f"  [{clr('g','1')}] Deploy-Now (fragt nach Passwort)")
    print(f"  [{clr('g','2')}] Quick-Fix ausführen (GitHub → Server)")
    print(f"  [{clr('g','3')}] Server-Status prüfen")
    print(f"  [{clr('g','4')}] Logs anzeigen (via SSH)")
    
    print(f"\n  {bold('📱 APK Download')}")
    print(f"  📦 {bold('CyberSarah-Master-v5.3-release.apk')} (3.6 MB)")
    print(f"  {dim(f'  🖥️  python3 serve-apk.py → http://IP:8765')}")

def draw_tools(app):
    """Tools Tab"""
    print(f"  {bold('🛠️  Verfügbare Tools')}")
    print(f"  {dim('─'*40)}")
    
    print(f"\n  {bold('🤖 Content-Tools')}")
    print(f"  📝 {clr('b','social-content-engine.py')} — TikTok/IG/YT/WA Content")
    print(f"  💬 {clr('b','whatsapp-campaign.py')} — WhatsApp Kampagnen")
    print(f"  📰 {clr('b','content-empire.py')} — Blog + SEO Content")
    print(f"  📱 {clr('b','content-engine.py')} — Social Media Ideen")
    
    print(f"\n  {bold('📊 Monitoring-Tools')}")
    print(f"  📊 {clr('b','cybersarah-dashboard.py')} — Ultimate Dashboard")
    print(f"  🤖 {clr('b','autopilot-v2.py')} — Live Terminal Dashboard")
    print(f"  📱 {clr('b','telegram-monitor.py')} — Push aufs Handy")
    
    print(f"\n  {bold('🚀 Deployment-Tools')}")
    print(f"  🚀 {clr('b','deploy-now.sh')} — Zero-Config Deploy")
    print(f"  🔧 {clr('b','quick-fix-server.sh')} — Server-Reparatur")
    print(f"  📦 {clr('b','serve-apk.py')} — APK Download Server")
    
    print(f"\n  {bold('📦 APK Versionen')}")
    print(f"  v5.3 (Build 18) — {clr('g','Aktuell')}  |  v5.2 (Build 17) — Stabil  |  v5.1 (Build 16)")

# ─── Actions ──────────────────────────────────────────────────────────

def generate_content(app, platform="all"):
    print(f"\n  {bold('📱 Generiere Content...')}")
    prompt = f"Erstelle einen hochkonvertierenden {platform.upper()}-Content für CyberSarah Revenue OS (KI-gestütztes Umsatzsystem). Deutsche Sprache, mit Emojis, Call-to-Action und Hashtags."
    result = app.call_ai(prompt)
    if result:
        app.generated_content.append({
            'platform': platform,
            'content': result,
            'time': datetime.now().strftime("%H:%M"),
        })
        print(f"\n  {result[:500]}")
        print(f"\n  {clr('g','✅ Content erstellt!')}")
        # Save
        os.makedirs("content_output", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(f"content_output/{platform}_{ts}.txt", 'w') as f:
            f.write(result)
        print(f"  💾 Gespeichert: content_output/{platform}_{ts}.txt")
    else:
        print(f"  {clr('r','❌ Fehler bei der Generierung')}")

def create_whatsapp_campaign(app, count=1):
    print(f"\n  {bold('💬 Erstelle WhatsApp-Kampagne(n)...')}")
    
    results = []
    for i in range(count):
        print(f"  {i+1}/{count}... ", end="", flush=True)
        prompt = f"""Erstelle eine 7-teilige WhatsApp-Marketing-Kampagne für CyberSarah Revenue OS.
Preis: 147€ für die Komplettlösung.
Zielgruppe: Unternehmer, Selbstständige, Kreative.

Format:
TAG 1 - BEWUSSTSEIN bis TAG 7 - CTA.
Jede Nachricht: max 200 Zeichen, mit Emoji, Deutsch."""
        result = app.call_ai(prompt)
        if result:
            results.append(result)
            print(clr('g', '✅'))
        else:
            print(clr('r', '❌'))
        time.sleep(2)
    
    if results:
        app.campaigns.extend(results)
        os.makedirs("campaigns", exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        with open(f"campaigns/whatsapp_{ts}.txt", 'w') as f:
            f.write(f"=== WHATSAPP KAMPAGNEN ({datetime.now().strftime('%d.%m.%Y')}) ===\n\n")
            for i, c in enumerate(results, 1):
                f.write(f"--- KAMPAGNE {i} ---\n{c}\n\n")
        print(f"\n  {clr('g',f'✅ {count} Kampagne(n) erstellt!')}")
        print(f"  💾 Gespeichert: campaigns/whatsapp_{ts}.txt")

# ─── Main Loop ────────────────────────────────────────────────────────

def set_nonblocking():
    import termios, tty, sys
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    tty.setcbreak(fd)
    return old

def restore_terminal(old):
    import termios, sys
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old)

def main():
    app = App()
    
    print(C['cls'])
    
    try:
        old_tty = set_nonblocking()
    except:
        old_tty = None
    
    last_action_time = 0
    
    try:
        while app.running:
            now = time.time()
            
            # Auto-refresh dashboard every 30s
            if now - app.last_refresh > 30:
                app.refresh_server()
                app.last_refresh = now
            
            # Draw UI
            print(C['home'], end='')
            draw_header(app)
            draw_tabs(app)
            
            # Draw current tab
            if app.tab == "dashboard":
                draw_dashboard(app)
            elif app.tab == "content":
                draw_content(app)
            elif app.tab == "revenue":
                draw_revenue(app)
            elif app.tab == "whatsapp":
                draw_whatsapp(app)
            elif app.tab == "deploy":
                draw_deploy(app)
            elif app.tab == "tools":
                draw_tools(app)
            
            # Footer
            print(f"\n  {dim('Tasten: 1-6=Tabs  c=Content  w=WA  r=Refresh  d=Deploy  q=Beenden')}")
            
            # Handle input
            import select
            if select.select([sys.stdin], [], [], 0.5)[0]:
                key = sys.stdin.read(1)
                
                # Tab switching
                if key == '1': app.tab = "dashboard"
                elif key == '2': app.tab = "content"
                elif key == '3': app.tab = "revenue"
                elif key == '4': app.tab = "whatsapp"
                elif key == '5': app.tab = "deploy"
                elif key == '6': app.tab = "tools"
                
                # Quick actions
                elif key == 'c' and app.tab == "content":
                    generate_content(app, "all")
                    input(f"\n  {dim('Enter drücken...')}")
                elif key == 'w' and app.tab == "whatsapp":
                    create_whatsapp_campaign(app, 1)
                    input(f"\n  {dim('Enter drücken...')}")
                elif key == 'r':
                    app.refresh_server()
                elif key == 'd' and app.tab == "deploy":
                    print(f"\n  {bold('Starte Deployment...')}")
                    print(f"  Führe aus: bash deploy-now.sh")
                    print(f"\n  {clr('y','Bitte in separatem Terminal ausführen:')}")
                    print(f"  bash deploy-now.sh --password=DEIN_PASSWORT")
                    input(f"\n  {dim('Enter drücken...')}")
                elif key == 'q':
                    app.running = False
                
                # Sub-actions for content tab
                elif key in '12345' and app.tab == "content":
                    platforms = ['tiktok', 'instagram', 'youtube', 'all', 'auto']
                    idx = int(key) - 1
                    if idx == 4:  # auto mode
                        print(f"\n  {bold('🤖 Auto-Modus gestartet (alle 30 Min)')}")
                        print(f"  Drücke Ctrl+C zum Beenden")
                        try:
                            while True:
                                generate_content(app, "all")
                                for i in range(30):
                                    print(f"  ⏳ Nächste Runde in {30-i} Min...", end='\r')
                                    time.sleep(60)
                        except KeyboardInterrupt:
                            print(f"\n  {clr('y','🛑 Auto-Modus beendet')}")
                    else:
                        generate_content(app, platforms[idx])
                    input(f"\n  {dim('Enter drücken...')}")
                
                # Sub-actions for revenue tab
                elif key in '123' and app.tab == "revenue":
                    if key == '1':
                        print(f"\n  {bold('📈 Generiere Revenue-Report...')}")
                        result = app.call_ai("Erstelle einen detaillierten Revenue-Report für CyberSarah Revenue OS. Analysiere: aktuelle Einnahmequellen, Optimierungspotential, neue Umsatzchancen. Gib konkrete Handlungsempfehlungen.")
                        print(f"\n  {result[:600]}")
                    elif key == '2':
                        print(f"\n  {bold('💡 Entwickle neue Produktidee...')}")
                        result = app.call_ai("Entwickle eine neue digitale Produktidee für CyberSarah (KI-gestütztes Umsatzsystem). Preis zwischen 29-497€. Gib: Name, Beschreibung, Zielgruppe, Preisbegründung, Marketing-Strategie.")
                        print(f"\n  {result[:600]}")
                    elif key == '3':
                        app.refresh_server()
                    input(f"\n  {dim('Enter drücken...')}")
                
                # Sub-actions for whatsapp tab
                elif key in '123' and app.tab == "whatsapp":
                    if key == '1':
                        create_whatsapp_campaign(app, 1)
                    elif key == '2':
                        create_whatsapp_campaign(app, 5)
                    elif key == '3':
                        camp_dir = Path("campaigns")
                        if camp_dir.exists():
                            files = list(camp_dir.glob("*.txt"))
                            if files:
                                print(f"\n  {bold(f'📁 {len(files)} Kampagnen:')}")
                                for f in files[-5:]:
                                    size = f.stat().st_size
                                    mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%d.%m. %H:%M")
                                    print(f"  📄 {f.name} ({size}B, {mtime})")
                            else:
                                print(f"\n  {clr('y','📁 Keine Kampagnen gefunden')}")
                    input(f"\n  {dim('Enter drücken...')}")
                
                # Sub-actions for deploy tab
                elif key in '1234' and app.tab == "deploy":
                    if key == '1':
                        print(f"\n  {bold('🚀 Deploy-Now Starten')}")
                        print(f"  {clr('y','Führe in separatem Terminal aus:')}")
                        print(f"  bash deploy-now.sh")
                    elif key == '2':
                        print(f"\n  {bold('🔧 Quick-Fix ausführen')}")
                        print(f"  {clr('y','Per SSH:')}")
                        print(f"  ssh root@167.233.196.20 \"bash <(curl -sL https://raw.githubusercontent.com/niknight1403/cybersarah-revenue-os/main/quick-fix-server.sh)\"")
                    elif key == '3':
                        app.refresh_server()
                    elif key == '4':
                        print(f"\n  {bold('📋 Server-Logs')}")
                        print(f"  {clr('y','Per SSH:')}")
                        print(f"  ssh root@167.233.196.20 \"pm2 logs cybersarah --lines 30\"")
                    input(f"\n  {dim('Enter drücken...')}")
        
    except KeyboardInterrupt:
        pass
    finally:
        if old_tty:
            restore_terminal(old_tty)
        print(f"\n\n{clr('g','👋 Bis zum nächsten Mal!')}\n")

if __name__ == "__main__":
    main()
