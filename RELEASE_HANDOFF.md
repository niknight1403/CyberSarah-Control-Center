# CyberSarah Control Center – Release-Handoff

## Status

Release **1.3.0** ist gebaut und veröffentlicht. Die App ist portrait-orientiert konfiguriert, verwendet das Branding **CyberSarah Control Center** und enthält die Void-Dark-Oberfläche, SecureStore-Key-Verwaltung, lokale Provider-Endpoints, Cloud-Key-Verbindungstests, Agenten-Fallback, Repository-Workflows und tokenfreies Audit-Logging. Play-Store-Vorbereitung (Listing, Data-Safety, Screenshot-Gerüst) liegt aus Sprint 83 vor (siehe `PLAY_STORE_BEREITSCHAFT.md`).

## APK-Erzeugung (aktuell)

Der Android-Build läuft **nicht mehr über EAS**, sondern vollständig auf GitHub Actions über den Workflow `build-apk.yml` (Expo-Web-Export → Capacitor → Gradle). Er wird manuell per `workflow_dispatch` angestoßen:

- **Start:** GitHub → Repo → *Actions* → **Build Android APK** → *Run workflow* → Branch `main`, optional `version_name` (Standard aus `app.config.ts`, aktuell 1.3.0).
- **Letzter erfolgreicher Lauf:** Run #26 (ID 34612205152) auf `main`, Commit `3eacddb`, 11.09.2026 — per `workflow_dispatch`, Status `success`.
- **Ergebnis:** GitHub-Release [`v1.3.0-apk`](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v1.3.0-apk) mit `CyberSarah-ControlCenter-v1.3.0-release.apk` (signiert, 5.8 MB) und `CyberSarah-ControlCenter-v1.3.0-debug.apk` (7.0 MB); das Play-Store-AAB (`CyberSarah-ControlCenter-aab`, 5.5 MB, R8-obfuskiert, unsigniert — Signierung ist Owner-Handoff) liegt als Workflow-Artefakt bereit.
- **Kein EAS-Kontingent mehr nötig:** Da der Build nicht über EAS läuft, blockiert das ausgeschöpfte EAS-Free-Tier-Kontingent die APK-Erzeugung nicht mehr.

## Manuelle Voraussetzungen (transparent)

| Voraussetzung | Status / Handlung |
|---|---|
| EXPO_TOKEN / EAS-Build | **Nicht mehr erforderlich** — seit der Capacitor-Gradle-Pipeline (`build-apk.yml`) läuft der Build auf GitHub Actions ohne EAS. |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Muss als GitHub-Repo-Secrets vorhanden sein (für die signierte Release-APK). Sind gesetzt — der erfolgreiche Release-APK-Build inkl. `apksigner`-Signaturprüfung bestätigt das. |
| Workflow-Start | `workflow_dispatch` auf `build-apk.yml`, Branch `main`. Kein weiterer Token nötig (`GH_TOKEN` ist in GitHub Actions eingebaut). |
| Echter Android-Gerätetest | **Offener Owner-Schritt** — siehe unten. |
| Play-Store-Einreichung | Service-Account außerhalb des Repos (siehe unten), `PLAY_STORE_EINREICHUNG.sh` vorbereitet. |

## Google-Play-Service-Account

Die Play-Store-Einreichung verwendet den Service-Account `play-uploader@cybersarah-revenue-os.iam.gserviceaccount.com` (Projekt `cybersarah-revenue-os`). Der zugehörige Projektschlüssel (JSON mit privatem Schlüssel) ist ein Geheimnis und darf **niemals** im Repository abgelegt werden — `.gitignore` blockt die gängigen Dateinamen und `PLAY_STORE_EINREICHUNG.sh` prüft vor jeder Einreichung, dass kein privater Schlüssel im Repo liegt. Für die Einreichung wird der Schlüssel ausschließlich lokal außerhalb des Repos bereitgestellt.

## Realgerät-Test (offener Owner-Handoff)

Installation der signierten `CyberSarah-ControlCenter-v1.3.0-release.apk`:

1. APK vom Release `v1.3.0-apk` herunterladen (nicht die Debug-Variante).
2. Auf dem Android-Gerät *Einstellungen → Apps → Spezialzugriff → Unbekannte Quellen* (bzw. *Apps aus unbekannten Quellen installieren*) für den Browser/Dateimanager erlauben.
3. APK öffnen und installieren; bei Play-Protect-Warnung *Trotzdem installieren* wählen (Erstsignierung ist nicht Play-verifiziert).
4. Beim ersten Start nacheinander testen:
   - Workspace-Service-Verbindung (Health/Ready-Status in den Einstellungen).
   - Einen Cloud-Key (OpenAI, Gemini oder OpenRouter) hinterlegen und den Verbindungstest ausführen.
   - Einen LAN-, VPN- oder Tailscale-Endpoint für Ollama beziehungsweise LM Studio. Für lokale Provider darf nicht automatisch `127.0.0.1` verwendet werden, wenn der Modellserver auf einem anderen Rechner läuft — dann die erreichbare LAN-, VPN- oder Tailscale-Adresse eintragen.
5. Ergebnis in der todo.md abhaken (letzter offener Punkt).

## GitHub

Der Zielstand wird zum Repository `niknight1403/CyberSarah-Control-Center` (`main`) gepusht. Sensible SecureStore-Werte und API-Keys werden nicht in Git committed. Nach jedem Push den CI-Lauf und die tokenfreien Audit-Ereignisse prüfen; APK-Builds nur nach grüner CI anstoßen.
