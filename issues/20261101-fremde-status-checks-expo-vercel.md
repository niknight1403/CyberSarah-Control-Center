# Fremde Status-Checks: Expo und Vercel halten jeden Commit auf rot

**Datum:** 01.11.2026
**Status:** offen, Ursache ausserhalb des Repos
**Betroffen:** alle Commits auf `main` (mindestens `a85ed4b`, `ab7d363`, `52edc59`, `cc432b6`)

## Symptom

Nach dem Merge von PR #176 sind alle GitHub-Actions-Laeufe gruen
(`CyberSarah Control Center CI`, `Gitleaks Secret Scan`, `GitLab Mirror`,
`CyberSarah Deploy & Sync Secrets`). Trotzdem steht der Commit auf rot:
`mergeable_state` ist `unstable`, und auf der PR-Seite erscheinen zwei
fehlgeschlagene Checks.

```
Vercel                                        failure
create-production-builds.yml (@niko1403/...)  error
```

Beide stammen nicht aus `.github/workflows/` dieses Repos, sondern von
installierten GitHub Apps. Der Ersteller laesst sich ueber die GraphQL-API
auslesen (`Commit.status.contexts.creator`), ueber die REST-API nicht:

- `Vercel` -> `vercel (Bot)`
- `create-production-builds.yml (...)` -> `expo (Bot)`

## Ursache 1: Expo/EAS sucht einen Workflow, den es nicht gibt

Die Statusbeschreibung lautet `Failed to create workflow run. Invalid
workflow definition.` Die EAS-GitHub-Integration versucht beim Push einen
Workflow-Lauf fuer die Datei `create-production-builds.yml` zu erzeugen.
Diese Datei existiert im Repo nicht; EAS erzeugt sie normalerweise selbst,
wenn die Repo-Anbindung eingerichtet wird.

Zusaetzlich haengt dem Status ein veralteter Kontoname an: `@niko1403`.
Dieses Konto existiert nicht mehr (`GET /users/niko1403` -> 404), das Konto
wurde zu `niknight1403` umbenannt (angelegt 2025-07-27). Die App nutzt den
alten Slug weiter.

Im Repo ist EAS durchaus in Gebrauch: `eas.json` mit den Profilen `preview`
und `production`, `app.config.ts` statt `app.json`. `EXPO_TOKEN` liegt als
Repository-Secret vor (31.08.2026), wird aber von keinem Workflow gelesen.
Die APK entsteht ueber `build-apk.yml` (Expo-Web-Export, Capacitor, Gradle),
nicht ueber EAS.

## Ursache 2: Vercel baut, was es nicht bauen kann

`vercel (Bot)` meldet `Deployment has failed`. Im Repo liegt weder
`vercel.json` noch eine Next.js-Struktur; das Projekt ist eine
Expo/React-Native-Web-App, die auf Render laeuft. Das Vercel-Projekt
`cyber-sarah-control-center` ist aber weiter mit dem Repo verbunden und
baut jeden Push.

## Auswirkung

- Kein Blocker: `main` hat keinen Branch-Schutz (`GET /branches/main/protection`
  -> 404), Merges laufen durch.
- Aber: jeder Commit sieht kaputt aus. Ein echter Fehler in der CI ist von
  diesem Grundrauschen nicht mehr zu unterscheiden, und PRs zeigen dauerhaft
  zwei rote Haken.

## Optionen (Entscheidung beim Eigentuemer)

**Expo/EAS**

1. `.github/workflows/create-production-builds.yml` anlegen, mit
   `workflow_dispatch` und einem `eas build`-Job auf Basis von `EXPO_TOKEN`.
   Stellt her, was EAS erwartet, verbraucht aber EAS-Kontingent bei jedem
   ausgeloesten Build.
2. Repo-Anbindung im Expo-Dashboard trennen, wenn EAS nicht mehr genutzt wird.
   Sauberste Variante: `eas.json` und `EXPO_TOKEN` weisen darauf hin, dass EAS
   noch irgendwo benutzt wird.
3. Die Expo-GitHub-App vom Repo entfernen (Konto -> Settings -> Applications).

**Vercel**

1. Im Vercel-Projekt den Ignored Build Step setzen (`exit 0`) oder die
   Git-Integration fuer dieses Projekt deaktivieren.
2. Oder die Vercel-App vom Repo entfernen, wenn dort nichts laufen soll.

Beides braucht Zugriff auf das jeweilige Dashboard, nicht auf das Repo. Von
hier aus ist nur die Diagnose moeglich; es wurde nichts geaendert.

## Abgrenzung

Nicht betroffen: `Render Deploy` ist reines `workflow_dispatch` und wird vom
Merge nicht ausgeloest; der Produktionsdeploy laeuft ueber die
Render-Git-Integration. Produktion antwortet nach dem Merge mit HTTP 200 auf
`/`, `/healthz` und `/api/health` (`{"ok":true}`).
