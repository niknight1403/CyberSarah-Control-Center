# Sprint 68 — Android-APK-Pipeline (Capacitor) & Release v1.0.0-apk

**Datum:** 2026-09-10 · **Status:** Abgeschlossen · **Build-Run:** #34495645609 (grün)

## Ziel

Das CyberSarah Control Center als native Android-App (APK) verpacken, vollautomatisch auf GitHub Actions bauen und öffentlich als Download bereitstellen.

## Umsetzung

### 1. Capacitor-Wrapper um den Expo-Web-Export

- `capacitor.config.ts`: App-ID `com.cybersarah.controlcenter`, App-Name „CyberSarah Control Center", `webDir: "web-dist"`, `androidScheme: "https"` (sicherer WebView-Kontext für localStorage/fetch-Auth).
- Abhängigkeiten: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (v7).
- `npx expo export -p web --output-dir web-dist` + `npx cap add android` + `npx cap sync android` — INTERNET-Permission im Manifest vom Template mitgeliefert, versionCode 1 / versionName 1.0.
- Die App lädt die Web-Export-Dateien lokal aus dem APK und spricht die Produktiv-API `https://app.cybersarah-ki.com` an (`DEFAULT_API_BASE_URL` in `constants/oauth.ts`).
- Root-`.gitignore`: `/android`-Ausnahme entfernt; der Wrapper wird versioniert (`android/.gitignore` schließt APKs/Build-Outputs aus).

### 2. Workflow `.github/workflows/build-apk.yml`

Ersetzt den alten EAS-Workflow (EXPO_TOKEN-Pflicht) durch einen autarken Build auf `ubuntu-latest`:

`npm ci` → `tsc` → CSS-Interop-Cache-Seed → `expo export` → `cap sync android` → Temurin-JDK 21 → `./gradlew assembleDebug` → APK-Verifikation (`test -s`) → GitHub-Release `v1.0.0-apk` mit APK-Anhang via `gh` (Clobber bei Wiederholungsläufen). `workflow_dispatch` mit `version_name`-Input; `permissions: contents: write`; Concurrency-Gruppe verhindert Parallel-Läufe.

### 3. Selbstkorrektur-Kette (4 Läufe bis grün)

| Lauf | Fehler | Fix |
|------|--------|-----|
| 1 | `Failed to get the SHA-1 for: node_modules/react-native-css-interop/.cache/web.css` — CSS-Interop-Cache fehlt bei frischen npm-ci-Installs (entsteht nur bei Dev-Läufen) | Leerer Cache-Seed (`touch web.css`) vor dem Export; lokal deterministisch verifiziert, Cache regeneriert sich dabei selbst (17 KB) |
| 2 | `error: invalid source release: 21` — Capacitor v7 verlangt Java 21, Workflow hatte JDK 17 | Temurin 21 |
| 3 | `Duplicate class kotlin.collections.jdk8.CollectionsJDK8Kt …` — kotlin-stdlib 1.8.22 enthält inzwischen die jdk7/jdk8-Klassen, alte 1.6.21-Transitives kollidieren | Offizieller Constraint-Fix in `android/app/build.gradle`: jdk7/jdk8 auf 1.8.22 gehoben |
| 4 | — | **Build grün**, APK 7,3 MB, Release veröffentlicht |

Nebenbei gefixt: Flaky-Test `chat-search-logic` (recency-Score hängt an `Date.now()`, Float-Vergleich driftete auf CI) — struktureller Vergleich + `toBeCloseTo(…, 6)`.

## Ergebnis

- **APK:** https://github.com/niknight1403/CyberSarah-Control-Center/releases/download/v1.0.0-apk/CyberSarah-ControlCenter-v1.0.0-debug.apk (7,3 MB, Debug-signiert)
- **Release:** https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v1.0.0-apk
- Download anonym verifiziert: HTTP 206, `application/vnd.android.package-archive`, ZIP-Magic (`PK`).
- CI desselben Commits grün (404 Tests, 65 Dateien).
- Repo ist öffentlich — der Release-Link ist direkt und ohne Auth nutzbar.

## Grenzen & nächste Schritte

- **Debug-APK:** Für Play-Store-Publishing bleibt der EAS-/Signatur-Handoff beim Owner (standing instruction: Service-Account-Schlüssel niemals committen). Für Sideload ist die Debug-APK sofort installierbar.
- **Wiederholte Builds:** `workflow_dispatch` mit neuer `version_name`-Eingabe erzeugt/aktualisiert das Release (Clobber).
- **Native Erweiterungen:** Der Wrapper nutzt den Web-Export; native Module (z. B. SecureStore) laufen als Web-Polyfills — für vollen Nativ-Betrieb wäre ein EAS-Build nötig.
