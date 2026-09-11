# SDK-57-Major-Upgrade — Abschlussbericht

**Datum:** 11.09.2026
**Ziel:** Das vollständige Expo-SDK-57-Upgrade als eigener Sprint verifizieren und abschliessen (die Abhaengigkeiten selbst waren im Sicherheitssprint `4085581` bereits auf SDK 57 gehoben; dieser Sprint schliesst Alignment, Web-Export, Capacitor-Sync und Pipeline ab).

## 1. Paket-Alignment auf den SDK-57-Sollstand

`npx expo install --fix` ist in der Sandbox nicht lauffaehig (npm-Child-Prozess); die Soll-Versionen wurden daher direkt gesetzt:

- 23 Expo-Pakete auf die erwarteten Patch-Versionen gehoben (u. a. `expo ~57.0.22`, `expo-router ~57.0.21`, `expo-asset ~57.0.17`)
- `expo-doctor`: **20/21 Checks gruen** — alle Versionsmeldungen behoben. Der eine verbleibende Befund ist der CNG-Check (native Felder in `app.config.ts` bei vorhandenem `android/`): **beabsichtigt und entschieden** (Owner-Entscheidung 11.09.2026: `android/` bleibt eingecheckt und ist Quelle der Wahrheit fuer native Builds; `icon`/`orientation` in `app.config.ts` bleiben bewusst stehen, weil sie der Web-PWA-Manifest dient). Es wird kein EAS Build verwendet; der Befund hat keine Auswirkung auf die Capacitor-Pipeline.
- Kernstack: `expo 57.0.22`, `react 19.2.3`, `react-native 0.86.3`, `typescript ~6.0.3`, `babel-preset-expo ~57.0.0`

## 2. Metro/NativeWind: Web-Export auf SDK 57 gefixt

Der Web-Export (`npx expo export -p web --output-dir web-dist` — Schritt 1 der APK-Pipeline) schlug fehl:

```
Error: Failed to get the SHA-1 for: node_modules/react-native-css-interop/.cache/web.css
```

**Ursache:** `metro.config.js` setzte `forceWriteFileSystem: true` (Legacy-Workaround fuer iOS-Styling im Dev-Modus). Das neuere Metro der SDK 57 hash- die Datei, bevor NativeWind 4.2.6 sie schreibt — export bricht ab. **Fix:** Rueckkehr auf den Standard (virtuelle CSS-Module). Das Projekt ist Android+Web-only; `forceWriteFileSystem` war nicht mehr noetig. Danach laeuft der Export sauber durch (7,3 MB `web-dist`).

## 3. Capacitor-CLI auf v8

`@capacitor/cli` stand auf v7, waehrend `@capacitor/core`/`@capacitor/android` bereits v8 waren:

- `@capacitor/cli ^7.6.9 -> ^8.5.1` (Alignment mit core/android)
- Capacitor CLI v8 verlangt **Node >= 22** → `build-apk.yml` von Node 20 auf **22** angehoben (die CI nutzt bereits 22, Dockerfile ebenfalls `node:22-bookworm-slim`)
- `npx cap sync android` mit CLI v8 real verifiziert (Node 22): Web-Assets aus dem SDK-57-Export werden korrekt nach `android/app/src/main/assets/public` kopiert, `capacitor.config.json` und Plugin-Status aktualisiert

## 4. Verifikation

| Pruefung | Ergebnis |
|---|---|
| TypeScript (`npm run check`) | ✅ |
| Tests (`npm test`) | ✅ 481/482 (nur bekannter, umgebungsbedingter Sandbox-Smoke-Test; CI gruen) |
| Server-Build (`npm run build`) | ✅ `dist/index.js` |
| `expo-doctor` | ✅ 20/21 (1 bewusst akzeptierter CNG-Befund, siehe Abschnitt 1) |
| Expo-Web-Export | ✅ `web-dist`, 7,3 MB, inkl. `index.html`, `favicon.ico`, `metadata.json` |
| `cap sync android` (CLI v8, Node 22) | ✅ copy + update ohne Fehler |
| Gradle-Release-APK | ✅ in der CI verifiziert (Run 34603375200 auf `0e06f3d`, 4,5 min): Web-Export, Capacitor-Sync und Gradle-Build auf SDK 57 erfolgreich; Artefakt `CyberSarah-ControlCenter-aab` (5,8 MB, Release-AAB). Erster Lauf schlug mit TS2882 fehl — Ursache war das gitignore'de `expo-env.d.ts` (TypeScript 6 verlangt die Typdeklaration; die Datei referenziert `expo/types`, das die CSS-Modul-Deklarationen liefert). Fix: `expo-env.d.ts` wird committet statt ignoriert (`0e06f3d`) |

## 5. Offene Punkte

- ~~Der naechste `build-apk.yml`-Lauf~~ Erledigt: Der Release-AAB-Build auf SDK 57 ist verifiziert (11.09.2026).
- NativeWind v4.2.6 ist die letzte v4-Stable (v5 nur Preview); falls Expo kuenftige SDKs Metro erneut aendern, ist ein Umstieg auf NativeWind v5 zu planen.
