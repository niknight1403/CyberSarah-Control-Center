# Changelog

Alle nennenswerten Aenderungen am CyberSarah Control Center werden hier
dokumentiert. Releases folgen der Versionierung MAJOR.MINOR.PATCH;
Sprint-Abschnitte darunter liefern die Detailtiefe je Iteration.

## 26.09.2026 — Sprints 364–368: Serie I (Agent-Intelligenz — Batch 17)

- **Sprint 364 (Prompt-Versionierung + A/B-Vergleichsmetrik)**: Verwaltung von Prompt-Varianten (`lib/prompt-versioning-ab-logic.ts`), Erfassung von Ausführungsmetriken (Erfolgsrate, Qualitäts-Score, p95 Latenz, Token-Verbrauch) und statistischer A/B-Evaluierung mit ehrlichen Stichproben-Schwellenwerten (`evaluateABTest`) sowie deterministischem Traffic-Splitting per Hash-Seed.
- **Sprint 365 (Selbst-Kritik-Schritt)**: Deterministische Selbstkritik-Logik (`lib/agent-self-critique-logic.ts`) zur Überprüfung von Agenten-Lösungen gegen vorgegebene Akzeptanzkriterien vor Task-Abschluss. Generiert strukturierte Kriterien-Auswertungen, Qualitäts-Scores und konkrete Nachbesserungs-Instruktionen bei Verfehlungen.
- **Sprint 366 (Werkzeug-Auswahlstatistik)**: Messung der Werkzeug-Nutzung (`lib/tool-usage-stats-logic.ts`) mit Aufrufzählung, Erfolgsraten, Latenzen und Inaktivitätszeiträumen. Erzeugt ehrliche Bereinigungspläne (`generatePruningPlan`) zur Deaktivierung ungenutzter Nicht-Kern-Werkzeuge ("Nie-Nutzung"), während geschützte Kern-Werkzeuge (z. B. `bash`, `read_file`) garantiert unberührt bleiben.
- **Sprint 367 (Gedächtnis-Konsolidierung v2)**: Erweiterte Gedächtnis-Konsolidierung (`lib/agent-memory-consolidation-v2-logic.ts`) mit automatischer Kategorisierung (`UserPreference`, `ProjectRules`, `SystemArchitecture`, `EphemeralTaskState`), Duplikat-Bereinigung und konfliktfreier Zusammenführung zugunsten nutzerbestätigter/neuerer Fakten sowie automatischem Verfall alter flüchtiger Zustände.
- **Sprint 368 (Aufgaben-Zerlegung)**: Zerlegungs-Engine (`lib/task-decomposition-logic.ts`) für komplexe Hauptziele in prüfbare Teilschritte mit expliziten Abhängigkeiten, Akzeptanzkriterien und topologischer Ausführungsreihenfolge. Bietet Fortschrittsverfolgung und automatische Blockade-Propagierung bei Fehlern sowie ehrliche Rückfragen bei vagen Zielformulierungen.
- **Verifikation**: 22 neue deterministische Tests (insgesamt 2.274 Tests in 291 Testdateien 100% grün), `npx tsc --noEmit` 0 Fehler.

## 25.09.2026 — Sprint 374: Volle Regression + Test-Lücken schließen (Serie J)

- **Platzhalter-Sweep (Owner-Gebot)**: Systematischer Audit über `app/`, `components/`, `lib/`, `server/` auf TODOs/FIXMEs, Dummies, Mocks und Platzhalter. Allen Fundstellen echt gelöst oder als ehrlichen Systemzustand ausgezeichnet (z.B. tRPC Router Clean-up in `server/routers.ts`, sicherer Callback-Origin in `app/oauth/callback.tsx`, saubere System-Startup-Logs im Admin Log Viewer `lib/admin-log-viewer-logic.ts`, ehrliche Template-Limit-Beschreibungen in `lib/template-gallery-logic.ts`). Null nutzer- oder produktionssichtbare Platzhalter verbleiben.
- **Volle Regression**: Vitest-Suite über alle 286 Testdateien ohne Flakes oder Zeitabhängigkeiten deterministisch ausgeführt.
- **Kritische Pfade & Test-Lücken (`tests/sprint-374-regression-and-gaps.test.ts`)**: 16 neue deterministische Tests für die 6 kritischen Kernpfade der App:
  1. Auth / Session: Gate-Phase-Determinismus (`resolveAuthGate`) & `SecureSessionStore`-Persistenz/Löschung
  2. Billing / Quota: Fair-Use Tageslimit (`evaluateChatQuota`) & Tier-Entitlements / Admin `QUOTA_EXEMPT`
  3. Publishing Queue: Status-Invarianten (`PUBLISHING_STATUSES`)
  4. Kampagnen-Brücke: Autonome Ideen-zu-Brief-Planung (`planCampaignBridges`) & Budget-Stopps
  5. tRPC Router: Prozeduren-Vollständigkeit (`appRouter` sub-routers)
  6. Draft Engine: Kapazitätsgrenzen (`DRAFT_MAX_PENDING_PER_KIND`) & Payload-Validierung (`validateDraftPayload`)
- **Verifikation**: 16 neue deterministische Tests (insgesamt 2.252 Tests in 286 Dateien), `tsc --noEmit` grün, `npm run build` grün.

## 25.09.2026 — Sprint 373: Login-Gate beim App-Start + autonome Ideen→Influencer-Kampagnen-Bruecke

- **Login-Bereich als App-Einstieg**: Neuer Screen app/login.tsx (Login + Registrierung, reale account-Router-Mutations, Session-Token via _core/auth); Auth-Gate (lib/auth-gate-logic.ts, rein + getestet) in (tabs)/_layout.tsx — Login hat Vorrang vor dem einmaligen Onboarding, kein Login-Flackern fuer Angemeldete (Phase "loading" bis die Session-Abfrage entschieden ist)
- **Autonome Kampagnen-Bruecke (kostenlos, nacheinander)**: lib/campaign-bridge-logic.ts leitet aus offenen Inbox-Ideen Kampagnenziel (Keyword-Inferenz), Thema und via Reichweiten-Engine (Sprint 364) Fokus-Persona + Plattform ab — pro Zyklus max. 2 Briefs, sequenziell, Budget gegen die content-Freigabe-Queue
- **Server (server/campaign-bridge.ts + Router)**: queueFromIdeas (admin-only, Zod-validiert, max. 3 Briefs) erzeugt pro Brief echten Persona-Content im Free-Tier-LLM-Pool der Draft-Engine und legt ihn als pending-Entwurf in der Freigabe-Queue ab — LLM-Fehler/ungueltiges JSON werden ehrlich uebersprungen, nie ein Fake-Entwurf; parseLlmJson/insertPendingDraft der Draft-Engine wiederverwendet (nur exportiert)
- **Ledger (lib/campaign-bridge-ledger.ts)**: verbrueckte Ideen-IDs persistent + idempotent — kein Doppel-Brief auch nach App-Neustart; korrupte Daten werden verworfen und gemeldet, nie still repariert
- **Admin-Autonomie nach Login**: useAutonomousCampaignBridge laeuft still auf jedem Screen (via useAdminFullIntegration, 2-Minuten-Zyklen) — Ideen fliessen vollautonom ins Influencer-Marketing; HITL bleibt: veroeffentlicht wird erst nach menschlicher Freigabe (Sprint-346-Regel), die Idee selbst bleibt unangetastet in der Inbox (Sprint-242-Regel)
- **Verifikation**: 24 neue deterministische Tests (Gate-Phasen, Ziel-Inferenz, Thema-Bau, Zyklus-Limits, Budget, Ledger-Roundtrip/-Korruption), Gesamt gruen, tsc --noEmit gruen; Live-Verifikation gegen app.cybersarah-ki.com nach Deploy

## 25.09.2026 — Sprint 371: tRPC-Vollintegration — agents-, system- und revenue-Router

- **Bestandsaufnahme**: tRPC-Kern (server/_core/trpc.ts mit superjson, Rate-Limit-Guard, protected/adminProcedure), Express-Mount (/api/trpc), Frontend-Client (lib/trpc.ts mit httpBatchLink + Session-Header) und alle Abhängigkeiten (@trpc/server/client/react-query ^11.18.0, @tanstack/react-query, zod) waren bereits vorhanden — der Sprint schließt die im Arbeitsplan fehlenden Router
- **agents-Router (neu)**: getStatus (Agenten des Nutzers inkl. Live-Telemetrie: gepufferte Loop-Events, Live-Abonnenten, Status-Zusammenfassung), control (Zod-validiert: activate/pause/archive auf den super_agent_status-Enum, strikt nutzer-gescoped — fremde IDs sind NOT_FOUND, Aktivierung toucht lastActiveAt), getLogs (Replay des Session-Telemetrie-Bus ab sinceEventId, Limit-Clamp 1..240, Ownership-Check gegen die Agenten-Liste)
- **system.getResourceUsage (neu)**: admin-gateder ehrlicher Prozess-Snapshot — Memory (rss/heap), CPU-Zeit, Uptime, Load-Averages, Node-Version; keine Netzaufrufe, keine Fake-Werte
- **revenue-Router (neu)**: getMetrics kombiniert Kontometrie des Control Centers (Plan/Verbrauch/Credits, Sprint-144-Admin-Elite-Garantie bleibt wirksam) mit dem read-only Revenue-OS-Snapshot — nur fuer Admins; ohne REVENUE_OS_DATABASE_URL ehrlicher not-configured-Zustand
- **Verifikation**: 6 neue Logik-Tests (Aktions-Mapping, Status-Aggregation, Telemetrie-Sicht, ISO-Serialisierung, Limit-Clamp), Gesamt 2.212 Tests gruen (282 Dateien), tsc --noEmit gruen

## 25.09.2026 — Sprint 370: X-OAuth2-Auto-Refresh — Live-Modus haelt dauerhaft

- **Token-Rotations-Persistenz (Migration 0012)**: Neue Tabelle platform_tokens speichert den aktuell gueltigen X-Tokensatz — X rotiert bei JEDEM Refresh den Access- UND Refresh-Token, deshalb ist Env nur der Bootstrap (X_PUBLISH_TOKEN/X_REFRESH_TOKEN) und die DB die Quelle der Wahrheit
- **Automatischer Refresh (Sprint 370)**: resolveXToken frischt den Access-Token 10 Minuten vor Ablauf selbst nach (grant_type=refresh_token, Basic-Auth aus X_CLIENT_ID/X_CLIENT_SECRET) — der Autopilot bleibt ohne manuelles Eingreifen live; fehlgeschlagene Refreshes haben einen 5-Minuten-Cooldown gegen Endpoint-Hammering
- **401-Retry im Publish-Pfad**: Ein X-Post mit abgelaufenem Token rotiert einmal frisch und sendet einmal neu — ein zweiter 401 ist ein ehrlicher Fehler, kein Blind-Retry
- **Ehrliche Fallback-Kette**: Frischer DB-Satz > Refresh > Bestands-/Env-Bootstrap-Token > Sandbox-Modus mit Grund; force-Retry akzeptiert nur ein frisches Ergebnis (kein blindes Wiederholen toter Token)
- **Deploy-Sync erweitert**: render-deploy.mjs/yml uebertragen jetzt auch X_CLIENT_ID, X_CLIENT_SECRET und X_REFRESH_TOKEN an die Render-App
- **E2E verifiziert**: 14 neue Tests (Puffer-, Cooldown-, Fallback- und Endpunkt-Fehlerfaelle gegen Mock-Token-Endpoint), 2.206 Tests gruen (281 Dateien), Typecheck gruen

## 25.09.2026 — Sprint 369: Hugging Face als KI-Provider im Deploy verdrahtet

- **Model-Router-Anbindung**: Der bestehende Model-Router (Zero-Cost + BYO) liest Hugging Face via AI_HUGGINGFACE_API_KEY/HF_TOKEN — der validierte HF-Token des Owners liegt jetzt als GitHub-Secret AI_HUGGINGFACE_API_KEY (whoami verifiziert, Account Niknight1981)
- **Deploy-Sync erweitert**: render-deploy.mjs uebertraegt jetzt optionale KI-Provider-Keys (AI_HUGGINGFACE_API_KEY, HF_TOKEN) nur bei existierendem Secret an die Render-App; render-deploy.yml reicht das GitHub-Secret an den Deploy durch
