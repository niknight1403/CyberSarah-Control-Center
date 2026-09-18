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
