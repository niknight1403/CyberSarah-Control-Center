#!/usr/bin/env python3
"""
╔═══════════════════════════════════════════════════════════════════════╗
║  CyberSarah DB BACKUP v1.0                                          ║
║  PostgreSQL Backup & Restore — direkt auf Neon                      ║
║                                                                     ║
║  - Voll-Backup aller Tabellen                                      ║
║  - Komprimiert als .sql.gz                                         ║
║  - Wiederherstellung im Notfall                                     ║
║  - Cron-Job für automatische Backups                                ║
╚═══════════════════════════════════════════════════════════════════════╝
Start:  python3 db-backup.py
"""
import os, sys, subprocess, gzip, shutil
from datetime import datetime
from pathlib import Path

DB_URL = "postgresql://neondb_owner:npg_fW5jIqBbRvs8@ep-gentle-credit-zamfgpk9-pooler.c-2.eu-west-2.aws.neon.tech/neondb"
BACKUP_DIR = Path(__file__).parent / "backups"

C = {'p': '\033[95m', 'g': '\033[92m', 'y': '\033[93m', 'r': '\033[91m', 'b': '\033[96m', 'n': '\033[0m', 'bold': '\033[1m'}
def clr(c, t): return f"{C.get(c, '')}{t}{C['n']}"
def bold(t): return clr('bold', t)

def create_backup():
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"cybersarah-db-backup-{timestamp}.sql"
    filepath = BACKUP_DIR / filename
    
    print(f"\n {clr('bold', '📦 Erstelle Backup...')}")
    
    try:
        with open(filepath, 'w') as f:
            result = subprocess.run(
                ['pg_dump', DB_URL, '--no-owner', '--no-acl', '--format=p'],
                stdout=f, stderr=subprocess.PIPE, timeout=120
            )
        
        if result.returncode != 0:
            print(f" {clr('r', '❌ Backup fehlgeschlagen:')} {result.stderr.decode()[:200]}")
            return None
        
        # Compress
        gz_path = str(filepath) + '.gz'
        with open(filepath, 'rb') as f_in:
            with gzip.open(gz_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        os.unlink(filepath)  # Remove uncompressed
        size_mb = os.path.getsize(gz_path) / 1024 / 1024
        print(f" {clr('g', '✅ Backup erstellt:')} {filename}.gz ({size_mb:.1f} MB)")
        return gz_path
    except Exception as e:
        print(f" {clr('r', '❌ Fehler:')} {str(e)}")
        return None

def list_backups():
    BACKUP_DIR.mkdir(exist_ok=True)
    backups = sorted(BACKUP_DIR.glob("*.sql.gz"), key=os.path.getmtime, reverse=True)
    
    if not backups:
        print(f"\n {clr('y', '📭 Keine Backups vorhanden')}")
        return
    
    print(f"\n {clr('bold', f'📋 {len(backups)} Backup(s):')}")
    for i, b in enumerate(backups, 1):
        size = os.path.getsize(b) / 1024 / 1024
        modified = datetime.fromtimestamp(os.path.getmtime(b)).strftime('%d.%m.%Y %H:%M')
        print(f" {clr('g', str(i).rjust(2)+'.')} {b.name} ({size:.1f} MB) — {modified}")

def restore_backup(filepath):
    print(f"\n {clr('bold', '⚠️  RESTORE WARNUNG!')}")
    print(f" {clr('y', 'Dies überschreibt die aktuelle Datenbank!')}")
    confirm = input(f" {clr('r', '☠️  Wirklich fortfahren? (ja/nein): ')}")
    if confirm.lower() != 'ja':
        print(f" {clr('y', 'Abgebrochen.')}")
        return False
    
    print(f"\n {clr('bold', '🔄 Stelle Backup wieder her...')}")
    try:
        # Decompress
        if str(filepath).endswith('.gz'):
            import gzip
            sql_path = str(filepath)[:-3]
            with gzip.open(filepath, 'rb') as f_in:
                with open(sql_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            filepath = sql_path
        
        result = subprocess.run(
            ['psql', DB_URL, '-f', filepath],
            capture_output=True, text=True, timeout=300
        )
        
        if str(filepath).endswith('.sql') and os.path.exists(filepath):
            os.unlink(filepath)
        
        if result.returncode == 0:
            print(f" {clr('g', '✅ Backup erfolgreich wiederhergestellt!')}")
            return True
        else:
            print(f" {clr('r', '❌ Restore fehlgeschlagen:')} {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f" {clr('r', '❌ Fehler:')} {str(e)}")
        return False

def setup_cron():
    script_path = os.path.abspath(__file__)
    cron_cmd = f"0 */6 * * * cd {os.path.dirname(script_path)} && python3 {script_path} --auto 2>&1 | logger -t cybersarah-backup"
    
    print(f"\n {clr('bold', '⏰ Richte Cron-Job ein (alle 6 Stunden)...')}")
    
    try:
        existing = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=5)
        crontab = existing.stdout if existing.returncode == 0 else ""
        
        if script_path in crontab:
            print(f" {clr('y', '⚠️  Cron-Job existiert bereits')}")
            return
        
        new_crontab = crontab.strip() + "\n" + cron_cmd + "\n"
        proc = subprocess.run(['crontab', '-'], input=new_crontab, text=True, capture_output=True, timeout=5)
        
        if proc.returncode == 0:
            print(f" {clr('g', '✅ Cron-Job eingerichtet: Alle 6 Stunden')}")
        else:
            print(f" {clr('y', '⚠️  Cron nicht verfügbar (Termux?) — manuell einrichten:')}")
            print(f"   {cron_cmd}")
    except:
        print(f" {clr('y', '⚠️  Cron nicht verfügbar — manuell einrichten:')}")
        print(f"   {cron_cmd}")

def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--auto':
        create_backup()
        return
    
    while True:
        os.system('clear' if os.name == 'posix' else 'cls')
        print(f"\n{bold(clr('p', '╔══════════════════════════════════════════════════╗'))}")
        print(f"{bold(clr('p', '║  💾 CyberSarah DB BACKUP v1.0                   ║'))}")
        print(f"{bold(clr('p', '╚══════════════════════════════════════════════════╝'))}")
        print(f" {clr('b', 'Neon PostgreSQL')} — {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")
        
        latest = None
        BACKUP_DIR.mkdir(exist_ok=True)
        backups = sorted(BACKUP_DIR.glob("*.sql.gz"), key=os.path.getmtime, reverse=True)
        if backups:
            latest = backups[0]
            size = os.path.getsize(latest) / 1024 / 1024
            modified = datetime.fromtimestamp(os.path.getmtime(latest)).strftime('%d.%m.%Y %H:%M')
            print(f" {clr('bold', 'Letztes Backup:')} {latest.name} ({size:.1f} MB) — {modified}")
        else:
            print(f" {clr('y', '📭 Kein Backup vorhanden')}")
        
        print(f"\n{clr('p', '─' * 50)}")
        print(f"\n{clr('bold', '🎯 Aktionen:')}")
        print(f"  {clr('g', '1)}')} Backup erstellen")
        print(f"  {clr('g', '2)}')} Backups anzeigen")
        print(f"  {clr('g', '3)}')} Backup wiederherstellen")
        print(f"  {clr('g', '4)}')} Cron-Job einrichten (auto alle 6h)")
        print(f"  {clr('g', '5)}')} Alles in einem Durchgang (1+4)")
        print(f"  {clr('r', '0)}')} Beenden")
        
        try:
            choice = input(f"\n {bold(clr('p', '➜'))} Auswahl: ").strip()
        except (EOFError, KeyboardInterrupt):
            print(f"\n {clr('y', '👋')}")
            break
        
        if choice == '0': break
        elif choice == '1': create_backup()
        elif choice == '2': list_backups()
        elif choice == '3':
            list_backups()
            if backups:
                try:
                    idx = int(input(f"\n {bold(clr('p', '➜'))} Backup-Nummer: ")) - 1
                    if 0 <= idx < len(backups):
                        restore_backup(backups[idx])
                except: pass
        elif choice == '4': setup_cron()
        elif choice == '5':
            create_backup()
            setup_cron()
            print(f"\n {clr('g', '✅ Alles erledigt!')}")
        
        input(f"\n ⏎ Enter zum Fortfahren...")

if __name__ == "__main__":
    main()
