# VM-Betrieb (Produktions-VM "CyberSarah-pro")

Alle Wartungsarbeiten laufen über `.github/workflows/villaforge-ops.yml`
(workflow_dispatch, SSH-Bridge über die `PRODUCTION_SSH_*`-Secrets).

| Modus | Zweck | Ändert etwas? |
|---|---|---|
| `status` | VM-Gesundheit: Platte, RAM, Load, Hub-Prozess, DB-Größe | nein |
| `list` | Host-Erkennung, pm2-Prozesse, Villa-Inventar | nein |
| `disk-report` | größte Platzverbraucher (Top-Verzeichnisse, große Dateien) | nein |
| `hub-diag` | Caddyfile, Ports, Hub-Port, Proxy-Ziele | nein |
| `disk-clean` | Caches, rotierte Logs, Installer-Archiv entfernen | ja |
| `swap-shrink` | ungenutztes `/swapfile2` entfernen (mit RAM-Prüfung) | ja |
| `hub-route` | fehlende Caddy-Route für den Hub wiederherstellen | ja |
| `disk-free` | npm-/Gradle-/apt-Caches leeren | ja |
| `delete` | Villa samt Tasks/Agents/Chats löschen (Namensbestätigung) | ja |

Zusätzlich läuft `status` täglich um 06:00 UTC als Wächter. Ein roter Lauf ist
das Alarmsignal: Platte >= 90 %, kein Hub-Prozess, oder die öffentliche Prüfung
von `https://hub.cybersarah-ki.com/` bzw. `/api/health` liefert nicht 200.

## Aufbau der Produktions-VM

- Hub (`/opt/villaforge`, Port **12000**), Prozess `node --experimental-sqlite server/server.mjs`
- CyberSarah-Control-Center unter pm2 (`/opt/cybersarah-control-center`, Port 3000)
- Revenue-Bridge unter pm2 (`/opt/cybersarah-revenue-bridge`)
- Reverse-Proxy: Caddy (`/etc/caddy/Caddyfile`), vhosts für `cybersarah-ki.com`,
  `ollama.cybersarah-ki.com`, `hub.cybersarah-ki.com` sowie die Center-Domain
- Swap: `/swapfile` 2 GB (das frühere 6-GB-`/swapfile2` war zu 96 % ungenutzt und wurde am 02.11.2026 entfernt)

## Befunde vom 02.11.2026

- Platte war zu 93 % belegt; nach Cache-/Archiv-Bereinigung 91 %, nach Entfernen
  des ungenutzten Swapfiles **74 %** (9,3 GB frei).
- `https://hub.cybersarah-ki.com/` lieferte 502, weil im Caddyfile kein vhost
  mehr existierte, während der Hub-Prozess lief. `hub-route` hat die Route
  wiederhergestellt (Backup, `caddy validate`, Reload nur bei gültiger Konfiguration).
- Der erste Wächterlauf meldete fälschlich "kein Hub-Prozess": `pgrep` suchte
  nach dem Pfad, der Prozess heißt aber `node ... server/server.mjs`. Erkennung
  korrigiert, HTTP-Prüfung läuft jetzt von außen statt von der VM.
