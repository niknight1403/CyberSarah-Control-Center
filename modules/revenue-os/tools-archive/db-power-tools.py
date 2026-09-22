#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah DB POWER TOOLS v1.0                                     ║
║  PostgreSQL-Datenbank Management — direkt auf Neon                  ║
║                                                                     ║
║  - Agenten-Status zurücksetzen                                      ║
║  - HARA-Proposals forcieren                                         ║
║  - System-Übersicht anzeigen                                        ║
║  - Fehler beheben                                                   ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 db-power-tools.py
"""
import os, sys, json, subprocess
from datetime import datetime

DB_URL = "postgresql://neondb_owner:npg_fW5jIqBbRvs8@ep-gentle-credit-zamfgpk9-pooler.c-2.eu-west-2.aws.neon.tech/neondb?sslmode=require"
C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}

def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def sql(query):
    try:
        result = subprocess.run(
            ['psql', DB_URL, '-c', query, '-t', '-A'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return f"Fehler: {result.stderr.strip()[:200]}"
    except Exception as e:
        return f"Fehler: {str(e)}"

def show_banner():
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
    print(f"{bold(clr('p', '║  🗄️  CyberSarah DB POWER TOOLS v1.0              ║'))}")
    print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
    print(f" {clr('b', 'Neon PostgreSQL')} — {datetime.now().strftime('%H:%M:%S')}\n")

def show_overview():
    print(f" {clr('bold', '📊 SYSTEM-ÜBERSICHT')}\n")
    
    queries = [
        ("Agenten Gesamt", "SELECT COUNT(*) FROM agents"),
        ("Agenten Aktiv", "SELECT COUNT(*) FROM agents WHERE status = 'aktiv'"),
        ("Agenten Fehler", "SELECT COUNT(*) FROM agents WHERE fehler_anzahl > 0"),
        ("HARA Proposals", "SELECT COUNT(*) FROM hara_proposals"),
        ("HARA Aktiv", "SELECT COUNT(*) FROM hara_proposals WHERE status = 'aktiv'"),
        ("HARA In Umsetzung", "SELECT COUNT(*) FROM hara_proposals WHERE status = 'in_umsetzung'"),
        ("HARA Fehlgeschlagen", "SELECT COUNT(*) FROM hara_proposals WHERE status = 'fehlgeschlagen'"),
        ("Transaktionen", "SELECT COUNT(*) FROM transactions"),
        ("Coupons", "SELECT COUNT(*) FROM coupons"),
        ("Kampagnen Aktiv", "SELECT COUNT(*) FROM campaigns WHERE status = 'aktiv'"),
        ("Produkte", "SELECT COUNT(*) FROM produkte WHERE aktiv = true"),
        ("Abandoned Carts", "SELECT COUNT(*) FROM abandoned_carts"),
        ("Affiliate Partners", "SELECT COUNT(*) FROM affiliate_partners"),
        ("Webhook Events", "SELECT COUNT(*) FROM webhook_events"),
    ]
    
    for label, query in queries:
        result = sql(query)
        count = result.split('\n')[0] if '\n' in result else result
        print(f"   {clr('b', label.rjust(22))}: {count}")

def reset_agents():
    print(f"\n {clr('bold', '🔄 AGENTEN ZURÜCKSETZEN')}\n")
    result = sql("UPDATE agents SET fehler_anzahl = 0, status = 'aktiv', updated_at = NOW() WHERE fehler_anzahl > 0 OR status != 'aktiv'")
    count = sql("SELECT COUNT(*) FROM agents WHERE status = 'aktiv'")
    print(f"   {clr('g', '✅')} Alle Agenten zurückgesetzt — {count} aktiv")

def fix_hara():
    print(f"\n {clr('bold', '🤖 HARA PROPOSALS FORCIEREN')}\n")
    result = sql("UPDATE hara_proposals SET status = 'in_umsetzung', updated_at = NOW() WHERE status = 'bestaetigt'")
    affected = sql("SELECT COUNT(*) FROM hara_proposals WHERE status = 'in_umsetzung'")
    print(f"   {clr('g', '✅')} {affected} Proposals in Ausführung")

def clear_old_logs():
    print(f"\n {clr('bold', '🗑️  ALTE LOGS LÖSCHEN')}\n")
    result = sql("DELETE FROM agent_logs WHERE created_at < NOW() - INTERVAL '7 days'")
    print(f"   {clr('g', '✅')} Alte Logs gelöscht")

def show_errors():
    print(f"\n {clr('bold', '❌ AKTUELLE FEHLER')}\n")
    result = sql("""
        SELECT agent_name, COUNT(*) as errors 
        FROM agent_logs 
        WHERE (status = 'fehler' OR status = 'error') 
          AND created_at > NOW() - INTERVAL '1 day'
        GROUP BY agent_name 
        ORDER BY errors DESC 
        LIMIT 10
    """)
    lines = result.split('\n')
    for line in lines:
        if line and not line.startswith('('):
            parts = line.split('|')
            if len(parts) >= 2:
                print(f"   {parts[0].strip()}: {clr('r', parts[1].strip())} Fehler")

def show_revenue_opportunities():
    print(f"\n {clr('bold', '💰 UMSATZ-CHANCEN')}\n")
    result = sql("""
        SELECT status, COUNT(*) as count, 
               SUM(geschaeftlicher_monatsumsatz::numeric) as total_revenue
        FROM hara_proposals 
        WHERE status IN ('aktiv', 'in_umsetzung')
        GROUP BY status
    """)
    for line in result.split('\n'):
        if line and '|' in line:
            parts = line.split('|')
            print(f"   {parts[0].strip()}: {parts[1].strip()} Proposals")

def main():
    while True:
        show_banner()
        show_overview()
        
        print(f"\n{clr('p', '─' * 50)}")
        print(f"\n{clr('bold', '🎯 AKTIONEN:')}")
        print(f"  {clr('g', '1)')} Agenten zurücksetzen (Fehler + Status)")
        print(f"  {clr('g', '2)')} HARA-Proposals forcieren")
        print(f"  {clr('g', '3)')} Alte Logs löschen (7+ Tage)")
        print(f"  {clr('g', '4)')} Aktuelle Fehler anzeigen")
        print(f"  {clr('g', '5)')} Komplett-Reset (1+2+3)")
        print(f"  {clr('r', '0)')} Beenden")
        
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Auswahl: ").strip()
        except (EOFError, KeyboardInterrupt):
            print(f"\n {clr('y', '👋')}")
            break
        
        if choice == '0':
            break
        elif choice == '1':
            reset_agents()
        elif choice == '2':
            fix_hara()
        elif choice == '3':
            clear_old_logs()
        elif choice == '4':
            show_errors()
        elif choice == '5':
            reset_agents()
            fix_hara()
            clear_old_logs()
            print(f"\n {clr('g', '✅ Komplett-Reset durchgeführt!')}")
        
        input(f"\n ⏎ Enter zum Fortfahren...")

if __name__ == "__main__":
    main()
