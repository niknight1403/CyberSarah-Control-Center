## Sprint 161 (2026-09-19) — V4.0-Integration: HITL, Vector Memory, Repo Chat, Multi-PSP & System-Verify

### Sicherheit
- `lib/hitl-guard-logic.ts`: Human-in-the-Loop-Guardrail nach Master-Prompt V4.0 — Transaktionen > 50 EUR, destruktive SQL-Befehle (DELETE nur ohne ID-Constraint), kritische System-/SSH-/Flash-Kommandos und Massen-E-Mails > 500 Empfaenger erfordern Operator-Bestaetigung; HARA-Auto-Approve bei ROI > 90, Kosten 0,00 EUR, RiskLevel LOW.
- HITL produktiv verdrahtet: `executeTool()` (server/orchestrator/tool-registry.ts) bewertet jeden Tool-Aufruf zusaetzlich zur Allowlist und blockt bei OPERATOR_CONFIRM_REQUIRED ohne `confirm: true`.

### V4.0-Kernkomponenten (Logik + Tests)
- `lib/vector-memory-logic.ts`: pgvector-faehiges Vektor-Gedaechtnis (Kosinus-Aehnlichkeit, deterministische 256-dim-Offline-Einbettung, injizierbarer Speicher-Vertrag, Best-Practice-Abfrage).
- `lib/repo-chat-logic.ts`: Repo-Chat-Index mit zeilengenauem Symbol-Scanner (function/class/interface/type/const) und Pfad:Zeile-Antworten, Ausschluesse fuer node_modules/.git/dist.
- `lib/payment-fallback-logic.ts`: Multi-PSP-Kaskade Stripe -> LemonSqueezy -> Paddle mit Webhook-Timeout-Failover und ehrlichen Nicht-Konfiguriert-Zustaenden.

### Verifikation
- `scripts/system-verify.ts` + `npm run verify:system`: ein Befehl fuer tsc + volle Suite + Modul-Präsenz, exaktes GREEN-Banner bei Gesamtbetriebsbereitschaft, Exit 1 bei Rot.
- 1123 Tests gruen (56 neu: 19 HITL, 11 Vector Memory, 14 Repo Chat, 12 Payment-Fallback). Bericht: `docs/SPRINT_161_V4_INTEGRATION_HITL.md`.


## Sprint 157 (2026-09-19) — Mega-Sprint: Performance & Professional Polish (v2.3.0)

### Performance
- FlatList-Windowing auf allen Kern-Screens (Chat, Superagent, Agent, Workspace, Quality, Preview, Memory): `initialNumToRender=12`, `maxToRenderPerBatch=8`, `windowSize=9` — schnellere Erst-Erkennung, weniger Render-Arbeit pro Frame, flüssigeres Scrollen in langen Chats und Task-Verlaeufen.
- Fehlende `@types/compression` ergaenzt (TypeCheck-Blocker aus Sprint 156-Nachzug).

### Release
- App-Version 2.2.0 -> 2.3.0 (minor): komplettes Update inkl. Neon-Pulse-Dashboard, einheitlicher Cyber-Neon-Themes, autonomem Provider-/Key-Manager, verstaendlicher Provider-Key-Eskalation, Rate-Limiter-IP-Fix und Superagent-Chat-Composer aus Sprint 138-156.

## Sprint 151 (2026-09-18, Commit c7f02e1) — Bugfix: Superagent-Eskalation bei Tool-Aufrufen

### Problem
- Der Optimizer-/Superagent-Tab eskalierte JEDE Aufgabe mit Tool-Aufrufen nach 3 Iterationen ("Cannot read properties of undefined (reading 'type')"), unabhaengig vom LLM-Anbieter — sichtbar als wiederholte Fehler- und Eskalationsmeldungen in der UI.

### Ursache
- Eine Assistant-Antwort mit reinen Tool-Aufrufen traegt oft kein Text-Content (content=null bzw. Feld fehlt). Sobald diese Nachricht in der naechsten Runde erneut normalisiert wurde (server/_core/llm.ts::normalizeMessage), stuerzte ensureArray(null).map(normalizeContentPart) ab.

### Fix
- `ensureArray()` behandelt null/undefined/leeren String jetzt sicher (leeres Array statt Abstuerzen); fehlender Content wird als null uebergeben, wie OpenAI-kompatible APIs es erwarten.
- Neuer Regressionstest in tests/orchestrator-superagent-provider-failover.test.ts: schlaegt ohne Fix nachweislich fehl, gruen mit Fix.

### Verifikation
- 1001 Tests gruen, TypeCheck sauber, Gitleaks bestanden, Render-Deploy erfolgreich; /api/health ok.

## Sprint 152 (2026-09-18) — Bugfix: Rate-Limit traf faelschlich alle Nutzer gemeinsam

### Problem
- Nutzer erhielten im Superagent-/Optimizer-Tab die Fehlermeldung "Unable to transform response from server" beim Senden neuer Aufgaben.

### Ursache
- render.yaml setzt TRUST_PROXY="1", der Server pruefte aber exakt `=== "true"`. Dadurch blieb Express' "trust proxy" in Produktion IMMER deaktiviert. Ohne trust proxy zeigte req.ip fuer JEDEN Nutzer auf dieselbe interne Render-Proxy-Adresse — der IP-basierte Rate-Limiter (server/_core/security.ts) fasste dadurch de facto ALLE Nutzer in einen gemeinsamen Zaehler-Bucket zusammen. Wurde dieser durch intensive Anfragen (z. B. Monitoring) ausgeschoepft, bekamen auch andere Nutzer eine 429-Antwort, die nicht ins tRPC-Envelope passt und im Client als "Unable to transform response from server" auftaucht.

### Fix
- Neue, testbare Helper-Funktion `isTruthyEnvFlag()` (lib/trust-proxy-logic.ts) akzeptiert gaengige Wahrheitswert-Schreibweisen ("1", "true", "yes", "on"); server/_core/index.ts nutzt sie jetzt statt des strikten String-Vergleichs.
- Neuer Regressionstest (tests/trust-proxy-logic.test.ts) deckt genau den render.yaml-Fall ("1") ab.

### Verifikation
- 1004 Tests gruen, TypeCheck sauber.

## Sprint 153 (2026-09-18) — Superagent: verstaendliche Eskalation bei ungueltigen LLM-API-Keys

### Problem
- Der Superagent eskalierte mit kryptischen Roh-Fehlern ("LLM invoke failed: 400 Bad Request – [Please pass a valid API key]"), obwohl die eigentliche Ursache reine Konfiguration war: Alle hinterlegten Provider-Keys (Gemini, OpenAI inkl. Backups) sind ungueltig bzw. erschöpft, Groq/OpenRouter sind nicht konfiguriert.

### Fix
- Neue reine Diagnose-Logik `lib/llm-failure-diagnostics.ts`: Scheitern ALLE Endpunkt-Versuche einer invokeLLM-Runde an Auth-/Guthaben-Fehlern (401/402/403 oder typische Anbieter-Meldungen wie "Please pass a valid API key", "Incorrect API key", "insufficient_quota"), wirft der LLM-Router jetzt eine klare Handlungsanweisung statt des letzten Roh-Fehlers ("Kein Code-Problem: bitte gueltigen API-Key hinterlegen, z. B. AI_GEMINI_API_KEY oder AI_GROQ_API_KEY").
- Die Eskalations-Zusammenfassung des Superagenten zeigt damit verifizierbar die Konfigurationsursache statt Code-Rauschen (end-to-end lokal getestet).
- 6 neue Unit-Tests decken die Klassifikation und die Anwendungsfaelle ab.

### Verifikation
- 1010 Tests gruen (131 Dateien), TypeCheck sauber, End-to-End-Smoke-Test gegen lokale API: Eskalation enthaelt die verstaendliche Anleitung.

### Hinweis fuer den Betrieb (kein Code-Fehler)
- Es ist aktuell KEIN gueltiger LLM-Key hinterlegt (Gemini/OpenAI inkl. Backup-Keys geprueft: alle ungueltig). Bis ein gueltiger Key (bevorzugt kostenloser: Gemini-Free-Tier oder Groq) als Umgebungsvariable hinterlegt ist, kann keine LLM-Aufgabe erfolgreich abgeschlossen werden.

## [Unreleased] — Sprint 133: AI-Grafik-Designer-Agent + Autonomer Engineering-Optimizer-Loop

### Neu
- **Designer-Agent** (`app/designer.tsx`, `server/design/`): KI-entwirft App-Icons, Logos, Splash-Screens, Banner, Illustrationen (validiertes SVG) und Design-Tokens (JSON) im Cyber-Design-System. Admin-gated, Galerie mit Loeschen, Drawer-Eintrag "Designer".
- **Engineering-Optimizer-Loop** (`server/orchestrator/optimizer-loop.ts`): kontinuierliche System-Analyse (DB-Health, Runtime-Logs, Uptime, Zyklus-Historie) alle `OPTIMIZER_LOOP_INTERVAL_MIN` Minuten; LLM priorisiert Findings und startet automatisch einen Orchestrator-Task mit dem wichtigsten Optimierungsziel. Status/Trigger im Superagent-Tab ("JETZT ANALYSIEREN & OPTIMIEREN"), Zyklen-Historie in der DB.
- tRPC: `design.generate/gallery/asset/delete`, `orchestrator.optimizerStatus/optimizerCycles/optimizerTrigger`.
- Tests: `tests/designer-logic.test.ts`, `tests/optimizer-logic.test.ts` (Prompt-Bau, Validierung, Cadence, Zielauswahl).

# Changelog — CyberSarah Control Center

## Sprint 127 (2026-09-16, Commits f36f69d + 8b98436)

### Administrator-Autopilot im Chat-Tab (Antwort auf: "nach dem Login einfach loslegen")
- `useAdminGithubTokenSync`, `useAdminAutoRouter` und zwei neue Hooks jetzt direkt im Chat-Tab aktiv:
  - `useAdminDesignThemeSync` — setzt Cyber-Neon-Design automatisch nach Admin-Login
  - `useAdminRepositoryAutoConnect` — verbindet das CyberSarah-revenue-os-Repository (main) automatisch, sobald das GitHub-Token synchronisiert ist; kein manueller Connect-Klick mehr nötig
- Die gleichen Autopilot-Hooks zusätzlich in Agent-Tab und Settings ergänzt (Theme + Repo-Autoconnect fehlten dort)

### Superagent-Entwicklungsfenster
- `runAgentToolLoop` zeichnet jeden Werkzeugaufruf auf (Tool, Argumente, Ergebnis-Summary) und liefert ihn als `devTrace` mit der Chat-Antwort zurück
- Neue UI-Komponente `DevTracePanel` (components/chat/dev-trace-panel.tsx): standardmäßig eingeklappt, per Tap aufklappbar — macht autonome Datei-Edits und Diagnosen in der Agenten-Antwort sichtbar
- `devTrace` wird in der Chat-Historie persistiert (Serialisierung + Parsing incl. Längen- und Typvalidierung)

### Cyber-Neon-Design als Standard
- `DEFAULT_DESIGN_THEME` von "living" auf "neon" (Cyber Neon) umgestellt
- Onboarding-Theme-Auswahl: "neon" steht jetzt an erster Stelle
- Tests an den neuen Standard angepasst (design-theme-logic, onboarding-logic) — alle 815 Tests grün

### Infrastruktur
- Typcheck und `npm run build` sauber; Render-Deploy über den kanonischen GitHub-Workflow (render-deploy.yml) verifiziert: Commit 8b98436 auf Render live
