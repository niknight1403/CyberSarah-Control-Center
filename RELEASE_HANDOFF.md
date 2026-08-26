# CyberSarah Control Center – Release-Handoff

## Status

Der Release-Kandidat ist für den Android-Publish vorbereitet. Die App ist portrait-orientiert konfiguriert, verwendet das Branding **CyberSarah Control Center** und enthält die Void-Dark-Oberfläche, SecureStore-Key-Verwaltung, lokale Provider-Endpoints, Cloud-Key-Verbindungstests, Agenten-Fallback, Repository-Workflows und tokenfreies Audit-Logging.

## Validierung

| Prüfung | Ergebnis |
|---|---|
| TypeScript `pnpm check` | Erfolgreich |
| Vitest `pnpm test` | 65 bestanden, 1 Auth-Test übersprungen |
| Workspace-Service-Syntax | Erfolgreich mit `node --check` |
| Server-Build `pnpm build` | Erfolgreich |
| Expo-Konfiguration | SDK 54, Portrait, Android-Paket und Branding aufgelöst |
| GitHub-CI | Letzter geprüfter Lauf erfolgreich auf `next-development` |
| Mobile UI | Settings- und Workspace-Flows auf Portrait-Viewport geprüft |

## APK-Erzeugung

Der Android-Build wird ausschließlich über die **Publish-Schaltfläche** der Management-Oberfläche gestartet. Der aktuelle Projektstand muss zuerst als Checkpoint vorliegen. Danach in der Management-Oberfläche **Publish** wählen, den Android-Build anstoßen und das erzeugte APK-Artefakt über den dort angezeigten Download-Link abrufen. Ein manueller APK-Build im Sandbox-Terminal wird nicht ausgeführt, damit der verwaltete Build-Prozess und seine Ressourcenlimits eingehalten werden.

## Realgerät-Test

Nach dem APK-Download die App auf einem Android-Gerät installieren und nacheinander den Workspace-Service, einen Cloud-Key sowie einen LAN- oder VPN-Endpoint für Ollama beziehungsweise LM Studio testen. Für lokale Provider darf nicht automatisch `127.0.0.1` verwendet werden, wenn der Modellserver auf einem anderen Rechner läuft. In diesem Fall ist die erreichbare LAN-, VPN- oder Tailscale-Adresse einzutragen.

## GitHub

Der Zielstand wird zum Repository `niknight1403/CyberSarah-Control-Center` gepusht. Sensible SecureStore-Werte und API-Keys werden nicht in Git committed. Die GitHub-Actions sollen nach dem Push erneut den CI-Lauf und die tokenfreien Audit-Ereignisse prüfen.
