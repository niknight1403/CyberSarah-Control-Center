# CyberSarah Control Center – Analyse (Phase A)

Stand: 2026-11-09 · HEAD `026867a` (origin/main) · Branch `agent/openhands-20261109-013448`
Methode: Import-Scan aller `tests/**/*.ts` gegen `lib/*.ts` (410 Dateien), Stichproben in
`server/*-router.ts`, `package.json`/`vitest.config.ts`/`README.md`. Keine Vermutungen als
Befunde. Nichts, was nicht per Datei:Zeile belegt ist, steht unter „Offene Fragen".

Testabdeckung im Überblick: 465 Testdateien, ~3743 `it/test`-Vorkommen. Von 410
`lib/*.ts`-Dateien werden nur 14 von keinem Test importiert (siehe Befund 2).

## Befunde

### 1. `extractJsonObject` ohne Tests, mit verwaistem Docblock
- **Was:** `lib/json-extract-logic.ts:6-42` exportiert `extractJsonObject`, das von
  `lib/agentic-loop-logic.ts:9` und `server/orchestrator/optimizer-loop.ts:32` produktiv
  genutzt wird (LLM-Antworten parsen). Kein Test importiert das Modul. Die Datei endet
  mit einem Docblock über eine SVG-Validierungsfunktion (`lib/json-extract-logic.ts:44-48`),
  zu der keine Funktion existiert – `grep` nach `sanitizeSvg|validateSvg|cleanSvg`
  findet nur diesen Kommentar.
- **Warum:** Ein Parser an der LLM-Schnittstelle ohne Tests und mit irreführendem
  Kommentar ist die höchste Wirkung pro Aufwand.
- **Aufwand:** S · **Risiko:** niedrig
- **Prüfung:** `tests/json-extract-logic.test.ts` existiert und läuft grün; der
  verwaiste Docblock ist entfernt oder die Funktion existiert.

### 2. Nur 14 von 410 `lib/*.ts`-Modulen ohne Testimport – Rest ist abgedeckt
- **Was:** Import-Scan ergibt genau: `graphics-motion-runtime.ts`, `json-extract-logic.ts`,
  `neon-pulse-theme.ts`, `prompt-contract-logic.ts` sowie 10 `use-*.ts`-Hooks
  (`use-admin-*.ts`, `use-animated-value.ts`, `use-autonomous-campaign-bridge.ts`,
  `use-dashboard-data.ts`). Alles andere ist testimportiert, darunter
  `provider-circuit-breaker-logic.ts` (`tests/revenue-os-v2.test.ts:69`),
  `syntax-highlight-logic.ts` (`tests/dev-window-logic.test.ts:3`),
  `legal-company.ts`/`legal-footer-logic.ts` (`tests/legal-texts.test.ts:3-4`).
- **Warum:** Der vermeintlich große Hebel „Logik ohne Tests“ ist fast geschlossen –
  Restarbeit muss gezielt auf diese 14 Module.
- **Aufwand:** S (Analyse) · **Risiko:** niedrig
- **Prüfung:** Diese Liste ist der Stand; Folgeläufe reduzieren sie messbar.

### 3. `neon-pulse-theme.ts` ist toter Token-Duplikat-Code
- **Was:** `lib/neon-pulse-theme.ts:18-47` definiert `neonPulse`-Tokens; `grep -rn neonPulse`
  findet nur die Datei selbst. Maßgebliche Tokens sind `lib/design/future-glass.ts`
  (vgl. `app/settings.tsx:10`, `app/(tabs)/cyber-dashboard.tsx:20` u. a.).
- **Warum:** Ein zweites, ungenutztes Theme lädt zu neuen Hardcodes statt Token-Nutzung ein.
- **Aufwand:** S · **Risiko:** niedrig (beoben nur, falls ein Import auftaucht)
- **Prüfung:** Datei entfernt oder von mindestens einem produktiven Import genutzt;
  `npm run check` bleibt grün.

> ✅ Erledigt 2026-11-09 (Phase B): `lib/neon-pulse-theme.ts` entfernt.
> Defensiv-Grep vor dem Loeschen: nur die Datei selbst; `npm run check`
> und `npm run test` nachher gruen (472/473 Dateien, 3788/3791 Tests).
> Siehe `docs/openhands/STATUS.md`.

### 4. `prompt-contract-logic.ts` ohne Tests, produktiv verdrahtet
- **Was:** `lib/prompt-contract-logic.ts:12-33` (`buildProjectPromptContract`) wird über
  `lib/project-superagent-factory-logic.ts:19` produktiv genutzt, aber von keinem Test importiert.
- **Warum:** Der Vertrag steuert, was generierte Projekt-Agenten tun dürfen – ungetestet
  ist er nur ein Vorschlag ohne Garantie.
- **Aufwand:** S · **Risiko:** niedrig
- **Prüfung:** `tests/prompt-contract-logic.test.ts` deckt Goal, Constraints,
  Format und FailureHandling ab und läuft grün.

### 5. `use-*.ts`-Hooks (10) ohne Tests – Teststrategie fehlt
- **Was:** `lib/use-admin-auto-router.ts:20`, `lib/use-admin-autonomous-agent.ts`,
  `lib/use-admin-autosetup.ts`, `lib/use-admin-design-theme-sync.ts`,
  `lib/use-admin-full-integration.ts`, `lib/use-admin-github-token-sync.ts`,
  `lib/use-admin-repository-autoconnect.ts`, `lib/use-animated-value.ts`,
  `lib/use-autonomous-campaign-bridge.ts`, `lib/use-dashboard-data.ts` – kein Testimport.
  `vitest.config.ts` erklärt die Suite zur Logik-Suite mit RN-Stub; `happy-dom` ist
  als DevDependency vorhanden, wird aber für diese Hooks nicht genutzt.
- **Warum:** Admin-Hooks mit Persistenz-/Routing-Seiteneffekten sind ohne Tests riskant.
- **Aufwand:** M · **Risiko:** mittel (Strategieentscheidung nötig, siehe offene Fragen)
- **Prüfung:** Mindestens ein Hook hat einen Test, der ohne Mocks der eigenen Logik läuft,
  oder die Strategie ist in STATUS.md festgehalten.

### 6. `graphics-motion-runtime.ts` ohne Tests, breit genutzt
- **Was:** `lib/graphics-motion-runtime.ts:6` (`decorativeMotionEnabled`) wird u. a. von
  `lib/theme-provider.tsx:20`, `components/living/agent-avatar.tsx:21`,
  `components/glass/glass-primitives.tsx:19` aufgerufen; kein Testimport. Die reine
  Entscheidung `shouldAnimateDecorations` liegt in `lib/graphics-motion-logic.ts`
  (testimportiert) – hier fehlt nur die dünne Runtime-Brücke.
- **Warum:** Eine einzeilige Brücke an 8+ UI-Stellen ohne Test ist leicht zu brechen.
- **Aufwand:** S · **Risiko:** niedrig
- **Prüfung:** Test für `decorativeMotionEnabled` mit gestubbten `matchMedia`/Plattformen läuft grün.

### 7. Dokumentation weicht vom Code ab (Versionen)
- **Was:** `README.md:5` nennt „v2.4.0 (Sprint 193)“, `package.json:3` steht auf `3.1.1`;
  `README.md:52` nennt „1196 Tests in 145 Dateien (Sprint 191)“, real sind es 465
  Testdateien; `NEXT_STEPS.md:3` datiert „2026-09-14, Release v2.0.0“.
- **Warum:** Wer sich an README/NEXT_STEPS orientiert, bekommt ein falsches Bild vom Stand.
- **Aufwand:** S · **Risiko:** niedrig
- **Prüfung:** README-Zeilen 5 und 52 nennen die tatsächliche Version und Testzahl aus
  `package.json` bzw. einem gezählten `tests/`-Stand.

### 8. Kein `AGENTS.md` im Repository-Root
- **Was:** `ls AGENTS.md` → nicht vorhanden; Projektwissen liegt in
  `README.md`, `NEXT_STEPS.md`, `docs/` (156 Dateien) und dem externen Steckbrief.
- **Warum:** Agentenläufe starten ohne persistenten, kurzen Repo-Gedächtnis-Einstieg.
- **Aufwand:** S · **Risiko:** niedrig
- **Prüfung:** `AGENTS.md` im Root verweist auf Steckbrief, Kommandos und
  `docs/openhands/STATUS.md` als Lauf-Gedächtnis, ohne Secrets.

## Offene Fragen (keine Befunde)

- **Router-Validierung aller 48 Router:** Stichproben (`account-router.ts`,
  `app-status-router.ts:55,86,145,270`, `mcp-router.ts:138,196`) sind durchgehend
  `z.object`-validiert. Ob alle 48 Router lückenlos sind, braucht einen vollständigen
  Audit – nicht belegt, daher kein Befund.
- **`extractJsonObject`-Randfälle:** Backslash-Behandlung außerhalb von Strings
  (`lib/json-extract-logic.ts:19-22`) und verschachtelte Arrays sind im Code sichtbar,
  aber ohne Test- oder Fehlertrace keine bewiesene Fehlfunktion.
- **`node_modules/` fehlt:** `npm run check`/`npm run test` konnten in diesem
  Analyselauf nicht laufen. Install + Baseline-Lauf gehören zum Folgelauf.

## Nächster Schritt

Befund 1 umsetzen (siehe `.openhands-plan.md`): Tests für `lib/json-extract-logic.ts`
plus verwaisten Docblock bereinigen, dann `npm run check` und `npm run test` laufen lassen.
