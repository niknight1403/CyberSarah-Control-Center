# APK-Varianten — Entwicklung vs. Admin (Sprint 107-Erweiterung)

**Stand:** 14.09.2026 · **Workflow:** `.github/workflows/build-apk.yml`

Ein einziger Codestand liefert ab sofort **zwei APK-Varianten**. Der Unterschied liegt ausschließlich in der Anzeige von Entwicklungsoberflächen — der Funktionsumfang (Rollen/RBAC, Master-Agent, Business-Tools, Git-Workflow, Dashboard) ist in beiden Varianten vollständig identisch.

## Die zwei Varianten

| Variante | Artefakt | Build-Typ | Was ist anders? |
|---|---|---|---|
| **Entwicklung** | `CyberSarah-ControlCenter-vX.Y.Z-dev.apk` | Debug (unsigned) | Alle Entwicklungsanzeigen sichtbar |
| **Admin (Produktion)** | `CyberSarah-ControlCenter-vX.Y.Z-admin.apk` | Release (signiert) | Entwicklungsanzeigen ausgeblendet — ruhigere, klarere Oberfläche |

Das Play-Store-AAB (`…-release.aab`) entspricht immer der **Admin-Variante**.

## Was in der Admin-Variante ausgeblendet wird

Gesteuert über `lib/app-variant-logic.ts` (reine Logik, Tests in `tests/app-variant-logic.test.ts`):

| Anzeige | Ort | Effekt in der Admin-Variante |
|---|---|---|
| **Service-Diagnose** (Health-Panel mit „Prüfen“-Button) | Workspace-Tab | Weg — die Verbindung läuft still im Hintergrund weiter |
| **Entwicklungs-Guidance** (Next-Step-Leiste) | Workspace-Tab | Weg — die Oberfläche zeigt direkt die Projektinhalte |
| **Theme-Lab** | `app/dev/theme-lab.tsx` | Abfanghinweis statt Werkzeug |

Bewusst **nicht** ausgeblendet: Dashboard, Chat, Agent, Vorschau, Qualität, Konto und alle Admin-Telemetrie — der Administrator behält den vollen Umfang.

## Wie es funktioniert

- Die Variante wird zur Build-Zeit über `EXPO_PUBLIC_APP_VARIANT` eingebrannt (Expo inlines `EXPO_PUBLIC_*` in den Web-Export; Capacitor packt den Export ins APK).
- `resolveAppVariant()` fällt bei fehlenden oder falschen Werten bewusst auf **Entwicklung** zurück — ein Workflow-Fehler kann Produktions-Anzeigen daher nie versehentlich verstecken.
- Der Workflow baut sequenziell: erst Entwicklung (Export → `cap sync` → `assembleDebug`), dann Admin (Export → `cap sync` → `assembleRelease` + `bundleRelease`, signiert). Ein Lauf erzeugt beide APKs und das AAB in **einem** Release.

## Build starten

Im GitHub-Repo: **Actions → Build Android APK → Run workflow** → VersionName setzen (z. B. `2.0.1`). Danach liegen im Release `vX.Y.Z-apk`:

- `…-dev.apk` — für Entwicklung und Gerätetest mit Diagnose
- `…-admin.apk` — für die tägliche Nutzung als Administrator
- `…-release.aab` — für den Play-Store-Upload (Sprint 109)

## Hinweis zu älteren Releases

Releases bis v2.0.0 nennen die Admin-Variante noch `…-release.apk` (inhaltlich identisch, es gab damals nur eine Variante). Dokumente wie `docs/PLAY_STORE_SUBMISSION_GUIDE.md` können noch den alten Namen erwähnen — er wird im Rahmen von Sprint 109 (Play-Store-Einreichung) aktualisiert.

---

*Teil der Roadmap `docs/ROADMAP_AB_SPRINT_107.md` (Sprint 107-Erweiterung, Owner-Wunsch 14.09.2026: Entwicklungs-APK und Admin-APK mit besserer Benutzerfreundlichkeit ohne Entwicklungsanzeigen).*
