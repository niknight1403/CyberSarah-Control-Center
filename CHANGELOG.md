# Changelog

Alle nennenswerten Aenderungen am CyberSarah Control Center werden hier
dokumentiert. Releases folgen der Versionierung MAJOR.MINOR.PATCH;
Sprint-Abschnitte darunter liefern die Detailtiefe je Iteration.
## 25.09.2026 — Sprints 349–353: Serie G Rest + Abschluss (Batch 14)

- Android Predictive Back & Animationen (Sprint 349): Gesten-Lifecycle, Karten-Skalierung, Abrundung, Opazität & Modal-Verschiebung, Haptik-Schwellenwerte (`lib/predictive-back-logic.ts`)
- Tastatur-Handling & Focus-Scrolling (Sprint 350): Inset- & Sichtbarkeitssteuerung, automatische Scroll-Offsets, Sticky Chat-Toolbars, Formular-Fokus-Sequenzen (`lib/keyboard-handling-logic.ts`)
- Tablet-Layout & Dual-Pane (Sprint 351): Breakpoint-Klassifizierung, Master-Detail Spaltenaufteilung, Einklapp-Steuerung, Schwellenwert-Schutz (`lib/tablet-layout-logic.ts`)
- App-Icon, Splash & Store-Screenshots (Sprint 352): Splash-Lifecycle mit Flackern-Schutz und Timeout-Fallback, Icon-Asset-Validierung, Store-Screenshot Checklisten (`lib/app-icon-splash-logic.ts`)
- Serie-G-Abschluss & Validierung (Sprint 353): Qualitäts- & Abdeckungsprüfung für Sprints 344–353, Verifikation aller Ehrlichkeits-Grenzen der Mobile-App-Politur (`lib/serie-g-validation-logic.ts`)
- 34 neue Tests (2.021 Tests grün in 255 Testdateien)

## 25.09.2026 — Sprints 344–348: Serie G Mobile-App-Politur (Batch 13)

- Navigation-Pass (Sprint 344): Per-Tab-Routen-Stacks, ehrliche Zurück-Kette, Deep-Link-Parsing (`lib/navigation-pass-logic.ts`)
- Offline-Zustände (Sprint 345): Konnektivitäts-Entprellung, Reconnect-Plan, Offline-Banner (`lib/offline-connectivity-logic.ts`)
- Skeleton-Lade-Erlebnis (Sprint 346): Screen-spezifische Skeleton-Presets statt universeller Spinner, Hybrid-Modus für Teil-Daten (`lib/skeleton-loading-logic.ts`)
- Lokale Push-Benachrichtigungen (Sprint 347): 5 Kategorien, Wiederholungs-Intervalle, ehrlich ohne FCM (`lib/local-notifications-logic.ts`)
- APK-Größen- und Startzeit-Metriken (Sprint 348): Asset-Breakdown, Budget-Bewertung, Optimierungs-Empfehlungen (`lib/apk-size-metrics-logic.ts`)
- 30 neue Tests (1.987 Tests grün in 250 Testdateien)


## 25.09.2026 — Sprint 345: Offline-Zustaende (Serie G)

- `lib/offline-connectivity-logic.ts`: Verbindungs-Entprellung (3 Samples), Reconnect-Plan mit dedupliziertem Einmal-Refresh + Queue-Resume, ehrlicher Offline-/Reconnect-Banner (Dauer nie aufgerundet), Queue-Resume nur bei stabilem Online
- 6 neue Tests (1.957 Tests gruen in 247 Testdateien)

## 25.09.2026 — Superagent-Faehigkeitsparitaet gegen Base44 (kostenlos)

- Skill-Registry: wiederverwendbare Skills mit Parameter-Validierung vor dem Lauf (`lib/agent-skill-registry-logic.ts`)
- Workflow-Scheduler: cron/Intervall/Einmal/Entity-Trigger, verpasste Laeufe bleiben faellig, pausiert laeuft nie (`lib/agent-workflow-scheduler-logic.ts`)
- Sub-Agent-Delegation: Missionen mit Task-Graphen, Konflikt-Ressourcen, Scopes, Policies (`lib/subagent-delegation-logic.ts`)
- Tool-Router: 7 Intents auf lokale/gratis Werkzeuge, unkonfiguriert bleibt ehrlich (`lib/agent-tool-router-logic.ts`)
- Channel-Paritaet: Telegram/WhatsApp/iMessage/Slack/Phone, Gratis-Grenzen offen benannt (`lib/channel-parity-logic.ts`)
- Capability-Registry: 10-Faehigkeiten-Katalog gegen Modul-Evidenz — 7 voll gruen, 3 gruen mit benannter Gratis-Grenze, 0 rot (`lib/superagent-capability-registry-logic.ts`)
- 31 neue Tests (1.951 Tests gruen in 246 Testdateien)

## 25.09.2026 — Sprint-85-Flaky behoben (Root-Cause-Fix)

- Echte Ursache: bei `isolate: false` leakte die Rotations-Agent-Suite Modul-Spiegel (`rotationPrimary`) + Env (`AI_GROQ_API_KEY`/`AI_OPENROUTER_API_KEY`) in die Sprint-85-Suite — Kette wurde lastabhaengig umsortiert (1 statt 2 Calls) oder verlaengert (3 statt 2)
- Fix: `afterAll`-Cleanup in der Quell-Suite, `beforeEach`-Reset von Primary/Quarantaene/Env in der Sprint-85-Suite, neuer Hook `resetProviderQuarantineForTests()` (`lib/live-fix-logic.ts`)
- Die fruehere Backoff-Jitter-Hypothese war falsch; Doku (Serie-C-Abschluss) um Aufloesung ergaenzt

## 25.09.2026 — Sprints 334–343: Serie F — Integrationen

- E-Mail v2 (Sprint 334): Anhaenge mit Limits + versionierte Vorlagen (`lib/email-attachments-logic.ts`)
- Kalender (Sprint 335): provider-abstrahierte Termine, Lese-Fehler bleibt Fehler (`lib/calendar-integration-logic.ts`)
- Webhook-Eingang (Sprint 336): Signatur-Pruefung, Feld-Whitelist, Replay-Fenster (`lib/webhook-ingest-logic.ts`)
- Export-Center (Sprint 337): JSON/CSV mit Manifest und Formel-Injektions-Schutz (`lib/export-center-logic.ts`)
- Import-Wizard (Sprint 338): Validierung vor Schreiben, Fehler je Zeile (`lib/import-wizard-logic.ts`)
- API-Keys (Sprint 339): Scope-Begrenzung, Ablauf, Widerruf, Fingerprint-Praefix (`lib/api-keys-logic.ts`)
- API-Doku (Sprint 340): ehrliche Endpunkt-Doku, Luecken werden markiert (`lib/api-docs-logic.ts`)
- Slack/Discord-Webhooks (Sprint 341): Schweregrad-Filter, ehrliche Versand-Bilanz (`lib/outbound-webhooks-logic.ts`)
- Integrations-Diagnose (Sprint 342): echter Probe-Call, nicht geprueft ist nie gruen (`lib/integration-diagnostics-logic.ts`)
- Serie-F-Abschluss (Sprint 343): Doku + CHANGELOG + Tracker + Version 3.0.0
- 42 neue Tests (1.919 Tests gruen in 239 Testdateien)

## 25.09.2026 — Sprints 324–333: Serie E — Zuverlässigkeit & Sicherheit

- Strukturierte Logs (Sprint 324): Korrelations-ID, Maskierung, Level-Gate (`lib/structured-logs-logic.ts`)
- Rate-Limits (Sprint 325): pro Route und Nutzer mit ehrlichem Retry-After (`lib/rate-limit-logic.ts`)
- RLS-Deckung (Sprint 326): Verifikation + verpflichtende Testfall-Namen (`lib/rls-coverage-logic.ts`)
- Backup-Restore (Sprint 327): beweisbare Restore-Uebung, 90-Tage-Frische (`lib/backup-restore-logic.ts`)
- Crash-Reporting v2 (Sprint 328): Muster-Klassifizierung mit Fingerprint-Dedup (`lib/crash-classification-logic.ts`)
- Selbstheilung (Sprint 329): Muster -> Aktion, sichtbare Logs, Eskalation nach 3 (`lib/self-healing-patterns-logic.ts`)
- Dependency-Audit (Sprint 330): Bumps einzeln, Risiko-Ordnung, ungetestet blockiert (`lib/dependency-audit-logic.ts`)
- Geheimnis-Hygiene (Sprint 331): erweiterte Guards + Vault-Abdeckung (`lib/secret-hygiene-logic.ts`)
- Health-Deep-Check (Sprint 332): /api/ready mit Timeouts, 503 ehrlich (`lib/health-deep-check-logic.ts`)
- Serie-E-Abschluss (Sprint 333): Doku + CHANGELOG + Tracker + Version 2.9.0
- 41 neue Tests (1.882 Tests gruen in 226 Testdateien)

## 25.09.2026 — Sprints 314–323: Serie D — Umsatz-Reihe 2

- Quota-Enforcement-Schalter (Sprint 314): monitor <-> enforce mit Audit-Log, monitor blockiert nie (`lib/quota-mode-logic.ts`)
- Upgrade-Prompt (Sprint 315): einheitlicher, druckfreier Hinweis an allen Quota-Grenzen ab 90 % — UI-Schicht neben dem bestehenden Sprint-262-Gate (`lib/upgrade-prompt-ui-logic.ts`)
- Checkout-Rueckweg (Sprint 316): Erfolg nur aus verifizierter Session, klare Zustandsseiten (`lib/checkout-return-logic.ts`)
- Abrechnungs-Screen (Sprint 317): Rechnungshistorie mit ehrlich getrennten Summen (`lib/billing-history-logic.ts`)
- Tier-Vergleich (Sprint 318): Matrix aus dem Katalog, Preise nur wenn konfiguriert (`lib/tier-comparison-logic.ts`)
- Testmodus-Kennzeichnung (Sprint 319): Stripe-Test-Modus immer sichtbar, nie Umsatz (`lib/stripe-testmode-logic.ts`)
- Kuendigungs-Flow (Sprint 320): Vormerkung zum Periodenende mit Konsequenz-Liste und Ruecknahme (`lib/cancellation-flow-logic.ts`)
- MRR-Dashboard v2 (Sprint 321): MRR/Churn/Neukunden ohne Preis-Schaetzungen (`lib/mrr-dashboard-logic.ts`)
- Ops-Alerts (Sprint 322): Zahlungsausfaelle mit Dedup, Eskalation und Zustellungs-Ack (`lib/ops-payment-alert-logic.ts`)
- Serie-D-Abschluss (Sprint 323): Doku + CHANGELOG + Tracker + Version 2.8.0
- 46 neue Tests (1.841 Tests gruen in 217 Testdateien)

## 24.09.2026 — Sprints 309–313: Serie C Abschluss

- Medien-Cache (Sprint 309): TTL + Byte-Budget + Aufraeumauftrag mit ehrlichem Loesch-Bericht (`lib/media-cache-cleanup-logic.ts`)
- Untertitel-Export (Sprint 310): SRT aus Szenen-Skript, Zeitmarken aus TTS-Schaetzung mit ehrlichem Hinweis (`lib/srt-export-logic.ts`)
- Batch-Export (Sprint 311): mehrere Projekte mit Fehlerfortsetzung, done/partial/failed ehrlich getrennt (`lib/batch-export-logic.ts`)
- Ergebnis-Verlauf (Sprint 312): gerenderte Medien pro Nutzer mit Status und unbekannten Groessen als "unbekannt" (`lib/media-history-logic.ts`)
- Serie-C-Abschluss (Sprint 313): Doku + CHANGELOG + Tracker + Version 2.7.0
- 25 neue Tests (1.795 Tests gruen in 212 Testdateien)

## 24.09.2026 — Sprints 299–303: Serie B Abschluss

- Snackbar/Toast-System (Sprint 299): eine Quelle mit Severity-Dauern, ehrlichem Dedup-Zaehler, FIFO-Cap, rein berechnetem Auto-Dismiss (`lib/snackbar-logic.ts`)
- Startzeit-Messung + volle Regression (Sprint 300): Phasen-Report mit Budget-Bewertung und ehrlicher Klassifikation ohne Messwerte (`lib/startup-metrics-logic.ts`); Regression: 1.770 Tests gruen, TypeCheck sauber
- Barrierefreiheit (Sprint 301): WCAG-2.1-Kontrast-Audit und Fokus-Ordnungs-Validierung (`lib/accessibility-logic.ts`)
- Theme-Konsistenz (Sprint 302): Hartkodierungs-Scanner mit Token-Vorschlag aus der Cyber-Palette (`lib/theme-consistency-logic.ts`)
- Serie-B-Abschluss (Sprint 303): Doku + CHANGELOG + Tracker

## 24.09.2026 — Sprints 304–308: Serie C — Medien v2 (Batch 1)

- Video BYO-Key (Sprint 304): Anbieter-Key-Verwaltung mit Maskierung und Verifikations-Zustand (`lib/byo-provider-key-logic.ts`)
- Stimmenauswahl pro Projekt (Sprint 305): Edge-TTS-Katalog mit Praeferenz-Reihenfolge und Vorschau-Validierung (`lib/tts-voice-selection-logic.ts`)
- Render-Warteschlange (Sprint 306): ehrlicher Fortschritt nur aus abgeschlossenen Szenen, ETA nur mit Messwerten (`lib/render-queue-logic.ts`)
- Szenen-Skript-Editor (Sprint 307): manuelle Nachbearbeitung mit Clamp, Diff und vollstaendigem Revert (`lib/scene-script-editor-logic.ts`)
- Bild-Fallback-Kette (Sprint 308): FLUX -> Gradient mit Pflicht-Quellen-Label, Gradient nie als generiert deklariert (`lib/image-fallback-chain-logic.ts`)
- 64 neue Tests (1.770 Tests gruen in 208 Testdateien)

## 24.09.2026 — Sprints 294–298: Produkt-Politur & i18n (Serie B Batch 3)

- EN-Sprach-Toggle (Sprint 294): Vollständiges i18n-System mit DE/EN-Wörterbuch (42 UI-Keys), Sprach-Normalisierung und Persistenz-Helfern (`lib/i18n-language-logic.ts`)
- Onboarding v2 (Sprint 295): Geführter 3-Schritt-Onboarding mit ehrlichen Erwartungen und Beta-Kennzeichnung, V1-Migrations-Helfer für Bestandskunden (`lib/onboarding-v2-logic.ts`)
- Template-Galerie (Sprint 296): 7 Starter-Templates in 4 Kategorien mit Kategorie-Filter und ehrlichen Grenzen je Template (`lib/template-gallery-logic.ts`)
- Chat-Leerer-Zustand (Sprint 297): 4 hilfreiche Starter-Prompts statt weißer Fläche, Repo-abhängige Prompts deaktiviert aber sichtbar (`lib/chat-empty-state-logic.ts`)
- Fehlerbildschirme (Sprint 298): Sprechende Fallbacks statt rotem Diagnose-Overlay im Release-APK, Fehlerklassifikation ohneStacktrace-Lecks (`lib/error-fallback-logic.ts`)
- 95 neue Tests (1.684 Tests grün in 197 Testdateien)

## 24.09.2026 — Sprints 289–293: Werkzeuge, Retry-Semantik, Kontext-Verdichtung & GitHub-Sync (Serie A Batch 2 & Abschluss)

- Werkzeug-Fehlerklassen & Retry-Semantik (Sprint 289): Wiederholbare vs. fatale Fehler mit exponentiellem Backoff und transparentem Limit-Handling (`lib/tool-error-classification-logic.ts`)
- Agent-Kontextfenster-Verdichtung (Sprint 290): Automatische Zusammenfassung vor Token-Überlauf unter vollständiger Konservierung aller Dateipfade und Entscheidungen (`lib/agent-context-window-logic.ts`)
- Commit-Diff-Vorschau (Sprint 291): Transparente Hunk- und Zeilenänderungs-Vorschau im Chat vor Git-Commit (`lib/commit-preview-logic.ts`)
- Sprint-Ziele als GitHub-Issue (Sprint 292): Transformation von Sprint-Zielen in GitHub-Issues mit Markdown-Checklisten und Sync-Steuerung (`lib/sprint-issue-bridge-logic.ts`)
- Serie-A-Abschluss & Validierung (Sprint 293): Doku `docs/2026-09-24_SPRINTS_289-293_SERIE_A_ABSCHLUSS.md` und Tracker-Aktualisierung
- 17 neue Tests (1.589 Tests grün in 192 Testdateien)

## 24.09.2026 — Sprints 284–288: Agent-Werkzeuge & Dev-Loop-Tiefe (Serie A Batch 1)

- Live-Preview-Zyklus Chat↔Preview (Sprint 284): Zustandssynchronisation, Verfolgung und Wiederherstellung ohne Zustandsverlust (`lib/live-preview-cycle-logic.ts`)
- Multi-File-Refactoring-Werkzeug (Sprint 285): Atomare Transaktionen für zeitgleiche Dateiänderungen (`write`/`delete`) mit automatischem Rollback und Backups (`lib/multi-file-refactor-logic.ts`)
- Code-Suche-Tool (Sprint 286): Grep-ähnliche Repository-Suche nach Regex/Text mit Dateimuster-Filter und Syntax-Range-Extraktion (`lib/code-search-logic.ts`)
- Test-Runner-Tool (Sprint 287): Gezielte Vitest-Ausführung für einzelne Testdateien und Namensfilter mit strukturierter Output-Zusammenfassung (`lib/test-runner-logic.ts`)
- Konfigurierbare Iterations-Limits (Sprint 288): Transparente Werkzeug-Limits (max. 8 Iterationen, Warnschwelle ab 6) und Dokumentation (`lib/dev-agent-iteration-limit-logic.ts`)
- 12 neue Tests (1.572 Tests grün in 188 Testdateien)

# Changelog

Alle nennenswerten Aenderungen am CyberSarah Control Center werden hier
dokumentiert. Releases folgen der Versionierung MAJOR.MINOR.PATCH;
Sprint-Abschnitte darunter liefern die Detailtiefe je Iteration.## 24.09.2026 — Sicherheits-Bereinigung cybersarah-revenue-os

- Alle vier DB-Backups (3 SQL-Dumps + 1 tar.gz) vollständig aus der Git-Historie von `cybersarah-revenue-os` entfernt (git filter-repo + Force-Push)
- Ehrliche Inhaltsprüfung über alle historischen Versionen: keine personenbezogenen Daten, keine Geheimnisse — Geheimnis-Rotation daher nicht erforderlich
- Restrisiko dokumentiert: GitHub-Cache alter SHAs bis zur internen GC## 24.09.2026 — Sprint 278: Stripe-Webhook-Härtung

- Fehler-Trennung: Signatur-Fehler → 400, Verarbeitungs-Fehler → 500 (Stripe wiederholt)
- Best-Effort-Dedup verarbeiteter Event-IDs pro Instanz (ehrlich: In-Memory, kein Restart-Überleben)
- Ops-Alerts bei invoice.payment_failed und customer.subscription.deleted
- 3 neue Tests mit echt berechneten HMAC-Testsignaturen; 1.542 Tests grün

## 24.09.2026 — Sprints 279–283: Asset-Packs (Outfit & Sets) + Bugfix Szenenbilder

- Neues Modul Asset-Packs: pure Logik, nutzer-scoped Persistenz, tRPC-Router assetPacks (list/create/activate/remove/status)
- Pipeline-Integration: FLUX-Prompts mit Outfit-/Sets-Modifikatoren, Pack-Farben im Gradient-Rückfall, Cache-Key mit Pack-Signatur
- Medien-Studio: Pack-Verwaltung und Anzeige der für den nächsten Render wirksamen Packs
- Bugfix (Sprint 276): FfmpegAssembler verworf imagePath — FLUX-Szenenbilder wären in Produktion nie gerendert worden
- 15 neue Tests; 1.560 Tests grün (183 Dateien)


## 24.09.2026 — Sprints 276–277: FLUX-Szenenbilder + Medien-Studio-UI

- Szenenbild-Adapter: generateSceneImageForPipeline nutzt FLUX.1-schnell + Bild-Cache ohne Nutzer-Quote (Pipeline begrenzt über Video-Quote)
- ffmpeg-Builder: echte Bild-Variante (Cover-Skalierung 16:9 + Ken-Burns) neben deterministischem Farbverlauf-Rückfall
- Pipeline: pro Szene FLUX-Bild oder ehrlich gezählter Rückfall (sceneImages-Statistik + Klartext-Note), Lauf bricht nicht ab
- Medien-Studio-Screen (media-studio.tsx): Status/Limits, Stimmen-Chips, Freigabe-Pflicht, eingebetteter Web-Video-Player, vollständige Fehleranzeige
- 1.539 Tests grün (181 Dateien), TypeScript/Lint/Build sauber


## 24.09.2026 — Sprints 272–275: Multimodale Medien-Pipeline (projekt-nullpunkt-Port)

- TTS-Modul: Edge-TTS (msedge-tts, kostenlos, keine Python-CLI) mit deutschen Stimmen, Cache und Tagesquote
- Szenen-Manuskript: deterministische Zerlegung (max. 8 Szenen), synthetisch-only Safety-Gate, SRT-Untertitel
- Video-Assembly: ffmpeg-Argument-Builder (1080p, Ken-Burns-Farbverläufe, Untertitel), ffmpeg jetzt Teil des Runtime-Docker-Images
- tRPC-Router `mediaPipeline` (status/tts/generate): Freigabe-Pflicht, Tagesquote 6 Videos/Nutzer, ehrlicher Fähigkeits-Check (probeFfmpeg)
- Ehrliche Grenzen dokumentiert: Farbverlauf-Bühne statt FLUX-Szenenbilder (nächste Stufe), Timing ist Schätzung
- 1.534 Tests grün (181 Dateien), TypeScript/Lint/Build sauber


## 24.09.2026 — Sprints 262–270 (Umsatz-Reihe)

- **262** Ehrliche Upgrade-Prompts an Chat-Quota-Grenzen (Zahlen, Reset, kein Druck)
- **263** Integrations-Registry mit Readiness-Status und Ausführungsgrenzen (oefentlicher Status-Router)
- **264** Bild-Generierung via FLUX.1-schnell (HuggingFace Free-Tier): Sicherheitsgrenzen, Cache, Tagesquote, Freigabe-Pflicht
- **265** Oeffentliche Landing-Page mit ENV-basierten Preisen und ehrlichen Tarif-Grenzen
- **266** Resend-Transaktionsmail: Opt-in-Nachweis, Idempotenz-Schluessel, Tageslimit
- **267** Datenschutz-arme Analytik: Tages-Buckets, Trichter-Zahlen, Retention im Code
- **268** Level-3-Freigabe-Flow fuer externe Aktionen mit unveraenderlicher Audit-Spur
- **269** Provider-Rotation mit Cooldown und ehrlich benanntem Antwort-Cache
- **270** Selbstheilende Schreib-Grenze (Validierung vor jedem write_repo_file) + begrenzter Code-Index

Alle 1.508 Tests gruen, TypeScript/Lint/Build sauber, CI gruen.


## [Unreleased — Sprint 252–261]

### Added — Entscheidungs-Journal (Wetten auf die Zukunft ehrlich nachprüfen)
- **Neuer Entscheidungs-Tab** (Drawer: „Entscheidungs-Journal"): Entscheidungen werden mit prüfbarer Erwartung und Pflicht-Nachprüf-Tag festgehalten; Anlegen, Nachprüfen und Ersetzen laufen ausschließlich über die Bestätigungs-Karte.
- **Ehrliche Nachprüfungs-Verdikte**: bestätigt / nicht eingetroffen / unklar — ein Verfehlen ist ein Ergebnis, kein Vorwurf; bereits Geprüftes wird vor doppelter Prüfung bewahrt.
- **Ersetzen als sichtbarer Verlauf:** ersetzte Entscheidungen bleiben Wort für Wort lesbar, doppelt Ersetzen wird als Verlaufslüge abgelehnt, die Ersetzungs-Kette wird chronologisch angezeigt.
- **Persistenz** (`lib/decision-log-store.ts`): injizierbarer KV-Adapter, max. 250 Einträge — entschiedene zuerst geopfert, offene zuletzt. 31 neue Tests (Logik + Store).

## [Unreleased — Sprint 242–251]

### Added — Ideen-Inbox (Rohgedanken ehrlich vergilben lassen)
- **Neuer Ideen-Tab** (Drawer: „Ideen-Inbox"): max. 30 offene Ideen, sichtbare Reifung (frisch/vergilbt/verwelkend mit Tageszahl) statt stiller Ablage; Anlegen, Behalten und Fallenlassen laufen ausschließlich über die Bestätigungs-Karte.
- **Deterministische Triage** als Vorschlag mit Begründung: verwelkende Ideen → Fallenlassen, zeitlich gemeinte → Pflanzen, frische → bewusst liegen lassen; entscheidet wird nur per Freigabe.
- **Single-Writer-Brücke zum Fokus-Modul** (`lib/idea-focus-bridge.ts`): prüft Tageskapazität und Titel-Eignung ehrlich; angelegt wird der Fokus-Punkt ausschließlich im Fokus-Tab mit dessen Bestätigungs-Flow.
- **Persistenz** (`lib/idea-inbox-store.ts`): injizierbarer KV-Adapter, max. 300 Punkte — entschiedene Ideen werden bei Platznot zuerst geopfert, offene zuletzt; korrupter Speicher wird gemeldet und sicher entfernt. 33 neue Tests (Logik, Store, Brücke).

## [Unreleased — Sprint 232–241]

### Added — Fokus & Rückblick-Modul (ehrliche Tagesverpflichtung)
- **Neuer Fokus-Tab** (Drawer: „Fokus & Rückblick"): max. 3 Fokus-Punkte pro Tag als bewusstes Kapazitätslimit, Status aktiv/erledigt/verschoben/fallen gelassen — Anlegen, Erledigen, Verschieben und Streichen laufen ausschließlich über eine Bestätigungs-Karte.
- **Ehrlicher Wochenrückblick** ohne Produktivitäts-Noten: Erledigt-Anteil als ausdrücklich gekennzeichnete Beobachtung, Muster-Benennung (reaktive Woche, Überverpflichtung) und genau zwei deterministische Reflexionsfragen, deren Rationale mitgeliefert wird.
- **Reine Logik in `lib/focus-review-logic.ts`** (33 Tests) und **Persistenz in `lib/focus-review-store.ts`** (6 Tests): injizierbarer KV-Adapter, max. 400 Punkte chronologisch, korrupter Speicher wird gemeldet und sicher entfernt. Hook `hooks/use-focus-review.ts` orchestriert mit Freigabe-Pflicht (`approvePending`).

## [Unreleased — Sprint 222–231]

### Added — Loop-Engineering-Modul (echte Umsatz-Schleifen-Entwürfe)
- **Loop-Engineering-Tab ist jetzt echt:** statt vier hartkodierter Beispiel-Karten verwaltet der Screen echte, lokal gespeicherte Schleifen-Entwürfe (Hypothese → Experiment → Messwert → nächster Schritt) mit Fortschritt, ehrlicher Bewertung und deterministischer Nächster-Schritt-Empfehlung. Erstellen, Start, Messwert, Abschluss und Verwerfen laufen ausschließlich über eine explizite Bestätigungs-Karte — nichts führt sich selbst aus, keine Umsatzversprechen (fester Disclaimer).
- **Reine Logik in `lib/revenue-loop-logic.ts`** (24 Tests): strenge Entwurfs-Validierung, ehrliche Fortschritts-Auswertung („unbekannt" statt fake-null, Trend erst ab zwei Messpunkten), Nächster-Schritt-Engine mit Freigabe-Pflicht, Experiment-Planer (7–90 Tage, `promisedRevenue: false`), deutsches Prompt-Parsing inklusive verneinter Aufträge, ehrlicher Ergebnis-Builder (uneindeutige Namen werden benannt statt geraten).
- **Persistenz in `lib/revenue-loop-store.ts`** (5 Tests): injizierbarer KV-Adapter (AsyncStorage), max. 50 Schleifen, korrupter Speicher wird gemeldet und sicher entfernt statt zu crashen. Hook `hooks/use-loop-engineering.ts` orchestriert; jede Mutation nur über `approvePending`.

## [Unreleased — Sprint 212–221]

### Added — Micro-Trading-Analysemodul (Paper Only, CoinGecko live)
- **Micro-Trading-Tab ist jetzt echt:** statt hartkodierter Fake-Kurse ("-1,8 %") lädt der Screen Live-Tageskurse über die kostenlose CoinGecko-API (kein Key, kein Konto). Ausdrücklich rein analytisch: keine Broker-, Wallet- oder Order-Funktion — nur Beobachtung, Signal-Analyse, hypothetische Backtests und Papier-Risikorechnung. Fester Disclaimer in jedem Ergebnis: keine Anlageberatung.
- **Reine Analyse-Logik in `lib/micro-trading-logic.ts`** (deterministisch, 27 Tests): Candle-Validierung (widersprüchliche/ungeordigte Daten werden abgelehnt statt gerechnet), SMA/EMA/RSI/Volatilität mit ehrlichen Warmup-Lücken, Signal-Engine (SMA-Crossover + RSI-Extrem als Beobachtung mit Begründung und Konfidenz, kein Handlungsauftrag), Backtest-Engine (Gebühren, Win-Rate, Max-Drawdown, Buy-and-Hold-Vergleich, Caveats bei dünnen Daten), Fixed-Fractional-Positionsgröße mit Verlust-/Budget-Caps und Drawdown-Wächter, deutsches Prompt-Parsing inklusive verneinter Signalaufträge.
- **Daten-Schicht `lib/micro-trading-data.ts`:** CoinGecko-Client mit injizierbarem fetch (Tests ohne Netz), 10-s-Zeitlimit, Retry nur bei 5xx, 429-Rate-Limit mit sichtbarem Cooldown statt Blind-Retry, JSON-Sicherheit über fetch-safety-logic. Hook `hooks/use-micro-trading.ts` orchestriert Watchlist-Liveabruf (ein Kurs pro Symbol, 2 Tage) und Prompt-Analyse; Ladefehler erscheinen als ehrliche Einzelzeilen statt leerer Liste.

## [Unreleased — Sprint 201]

### Added — Interner Speicher-Manager (Prompt-gesteuert, Test-Modul)
- **Neuer Screen `app/storage-manager.tsx` (Sidebar: „Speicher")**: per Prompt den App-eigenen Speicher analysieren, sortieren, aufräumen und Optimierungs-Vorschläge erhalten — als Test-Modul zur Voll-Funktionsprüfung.
- **Reine Logik in `lib/storage-manager-logic.ts`** (deterministisch, 11 Tests): Pfad-Klassifikation in Kategorien (Cache, Logs, Backups, Dokumente, Medien, Other), Aggregation, deutsche Byte-Formatierung, vier Sortierungen, Aufäum-Plan mit Sicherheitsregeln (Cache/veraltete Logs gefahrlos, Backups/Dokumente/Medien nur mit Bestätigung, Systempfade wie SQLite/IndexedDB grundsätzlich geschützt), Optimierungs-Vorschläge (größte/stälteste/doppelte Einträge, Kategorie-Dominanz) und deutsches Prompt-Parsing (Aktionen, Kategorien, „älter als N Tage", Sortierung, Umlaut-sicher).
- **Ehrliche Geräte-Anbindung in `lib/storage-manager-device.ts`**: Scan der Expo-Verzeichnisse + WebStorage-Einträge mit injizierbarem FS-Adapter (Tiefe/Anzahl begrenzt, nicht lesbare Bereiche werden als Hinweis gemeldet statt still leer zu bleiben); Löschen ausschließlich vom Plan freigegebener Pfade.
- **Orchestrierung in `hooks/use-storage-manager.ts`**: Scan, Prompt-Auswertung, Plan; Löschung nie ohne Nutzer-Bestätigung (Confirm-Dialog mit Freigabe-Vorschau). Sidebar-Icon `internaldrive.fill` ergänzt.

## [Unreleased — Sprint 200]

### Fixed — Dual-Sidebar ehrlich und vollstaendig (Wide-Viewport)
- **Fake-Status entfernt:** Der Dual-Sidebar-Footer zeigte pauschal gruen „SYSTEM ONLINE"/„ORCHESTRATOR READY" — unabhaengig vom echten Serverzustand. Neu: echter Health-Poll gegen den oeffentlichen `/api/health`-Endpunkt (Timeout 4 s, alle 60 s, AbortController, kein Auth) mit ehrlichen Zustaenden: online (gruen) / offline (rot) / pruefend (muted). „ORCHESTRATOR ERREICHBAR" behauptet bewusst nur Erreichbarkeit, keine Orchestrator-Readiness oder DB-Verfuegbarkeit.
- **Konto-Screen auf Wide-Viewports wieder erreichbar:** Die Tab-Bar ist ab 768 px ausgeblendet, `/account` fehlte aber in beiden Sidebar-Zonen — der Konto-Screen war auf dem Desktop unmoeglich zu erreichen. Neu: Eintrag „Konto" in der Apps-Zone.
- **Logik extrahiert und getestet:** Routing-Match (inkl. index-/Praefix-Faelle), Zonen-Eintraege und Footer-Ableitung liegen als reine Funktionen in `lib/dual-sidebar-logic.ts`; deterministische Tests in `tests/dual-sidebar-logic.test.ts` pinnen auch die Konto-Erreichbarkeits-Regression.

## [Unreleased — Sprint 194]

### Fixed
- **Sprint 194 — Chat-Nachrichten laufen nicht mehr aus dem Bildschirm (Owner-Feedback 21.09.2026):** Lange, nicht umbrechbare Inhalte (URLs, Pfade, Stacktrace-Zeilen) sprengten die Flex-Zeile der Chat-Bubbles und verschwanden rechts aus dem Bildschirmrand — React-Native-Web erzwingt ohne `minWidth: 0` min-width:auto auf Flex-Kindern. Neu: die komplette Kette row/rowUser/bubble/codeBox im MessageBubble haelt `minWidth: 0`, Code-/Inhaltstexte brechen via `wordBreak: "break-word"` mitten im Token statt die Zeile zu sprengen. Regressionsschutz: tests/chat-overflow-connector.test.ts.

### Changed
- **Sprint 194 — GitHub-Repository-Picker im Chat vollautonom:** chat.tsx und agent.tsx gaben `onListRepositories` nur bei lokal hinterlegtem Token weiter — der Ein-Klick-Picker blieb fuer einen Administrator stumm, obwohl das Admin-Auto-Provisioning (Sprint 87, adminRouter.githubToken) server-seitig laengst existierte. Neu: `listGithubRepositories` faellt ohne lokales Secure-Store-Token automatisch auf das server-seitige Admin-Token zurueck (ADMIN_GITHUB_TOKEN/GITHUB_TOKEN); beide Screens uebergeben den Picker immer, die Karte faelllt nur noch bei wirklich fehlendem Token auf die manuelle Eingabe zurueck. Der GitHub-Sub-Tab bleibt fuer Status/Diagnose, ist fuer die Verbindung aber nicht mehr noetig.

- App-Lockfile 2.3.0 → 2.5.0 nachgezogen (war hinter package.json zurueckgefallen).

## [Unreleased — Sprint 189]

### Changed
- **Sprint 189 (Chat-Qualität) — Übersichtlichere Antworten in beiden Chatbereichen:** Der Leitende Superagent nutzt jetzt ein festes Antwortformat (### Ergebnis mit Kernantwort zuerst, ### Was ich getan habe als max. 5 Stichpunkte, ### Naechste Schritte max. 3) mit Praegnanz-Regeln (keine Floskeln, keine Rohdaten, ehrliche Zahlen). Der Superagent-Tab rendert finale Antworten ab sofort mit Markdown-Lite (Ueberschriften, Listen, Code) statt Fliesstext. Der Repo-Chat erhaelt die Kernantwort-zuerst-Regel plus klare Themen-Ueberschriften und Stichpunkt-Limits. Live verifiziert: beide Chatbereiche end-to-end gegen einen lokalen Server mit echter Postgres-DB, Admin-Login und Mock-LLM getestet (Orchestrator-Run inkl. Task-Ledger, Repo-Chat inkl. Historie-Persistenz).

## [Unreleased — Sprint 190]

### Fixed
- **Sprint 190 — Deterministischer Secret-Vault-Test (28P01 auf Produktiv-VPS):** Der Vault-Test mokierte den KV-Speicher via `vi.mock("../server/db")` — unter `isolate: false` (Sprint 187) haengt die Modul-Mock-Aufloesung jedoch von Worker-Belegung und Dateireihenfolge ab. Auf einem Produktiv-VPS mit echter DATABASE_URL lief der Test dadurch stellenweise gegen die echte Postgres (Fehler 28P01, falsches Passwort fuer User cybersarah). Neu: injizierbarer KV-Adapter `setVaultKvForTests` in server/secret-vault.ts (nur unter NODE_ENV=test aktiv), der Test bindet seinen In-Memory-KV direkt daran. Verifiziert: Suite gruen mit falschem DB-Passwort, ohne DATABASE_URL und unter gezielt vergiftetem Modul-Cache (Einzel-Worker). Keine Produktionsverhaltens-Aenderung — der Hook greift nur im Test-Modus.

## [Unreleased — Sprint 191]

### Changed
- **Sprint 191 — Deterministische Test-Hooks statt vi.mock ( komplette Fehlerklasse behoben):** Unter `isolate: false` (Sprint 187) haengt die vi.mock-Aufloesung von Worker-Belegung und Dateireihenfolge ab — auf produktiven VPS mit echter DATABASE_URL konnten KV-gemockte Tests real gegen Postgres laufen (28P01). Neu: zentraler Test-Hook `setModelRouterKvForTests` in server/db.ts und `setInvokeLlmForTests` in server/_core/llm.ts (Guard: NODE_ENV=test ODER VITEST-Marker; ausserhalb von Tests abgelehnt). Alle vier betroffenen Tests (secret-vault, wix-vault, orchestrator-failover, development-chat-server) binden ihre In-Memory-Fakes jetzt direkt und loesen den Hook in afterAll wieder (isolate:false-Hygiene). Der Sprint-190-Adapter in server/secret-vault.ts wurde vom zentralen Hook abgeloest und entfernt. Verifiziert: Suite gruen mit falschem DB-Passwort, ohne DATABASE_URL, unter gezielt vergiftetem Modul-Cache im Einzel-Worker (145 Dateien / 1196 Tests) und mit geleaktem NODE_ENV=production. Keine Produktionsverhaltens-Aenderung — die Hooks greifen nur im Test-Modus.

## [Unreleased — Sprint 192]

### Added — Future-Glass Max: komplettes Grafik-Upgrade
- **GlassBackdrop v2:** dritte Lichtwolke (Blue, Daten), driftender Aurora-Schleier (26 s Pendel, Native Driver), haarfeines Cyber-Grid-Maschennetz und bis zu 5 driftende Lichtpartikel mit Fade — alles ausschaltbar per `atmosphere={false}` fuer dichte Screens. Basis: neue deterministische Logik `lib/design/glass-atmosphere-logic.ts` (seeded LCG statt Math.random im Render-Pfad, geklammerte Grid-Dichte 60-160 px, dezente Alpha-Obergrenzen) mit 8 neuen Tests.
- **GlassCard:** diagonaler Akzent-Gradient-Wash bei Glow >= 1 — Karten bekommen Licht von oben links statt flacher Flaeche.
- **GlowButton:** vertikaler Lichtschein auf primaeren CTAs ("beleuchtet"-Effekt).
- **MetricTile:** Glow 1 + diagonaler Akzent-Wash — Kennzahlen-Kacheln wirken gerahmt vom Licht.
- **AI-CORE:** gegenlaeufiger, duennerer Innenring (zweite Rotationsebene) — mehr Tiefe in jedem Zustand.
- Alle Effekte laufen ausschliesslich ueber Tokens aus future-glass.ts (keine hardcodierten Farben ausserhalb lib/design/), nur Opacity/Transform-Animationen, web+mobile-kompatibel.

### Changed
- App-Version 2.3.0 → **2.4.0**.

## [Unreleased — Sprint 193]

### Changed — Komplettes UI-Update: 100% Token-Konformitaet
- **Token-Sweep ueber alle Screens:** 192 hardcodierte Farbwerte in 31 Dateien (app/ + components/) durch Tokens aus future-glass.ts ersetzt — Akzente einheitlich auf glassPalette (Amber/Cyan/Green/Red/Purple), neutrale Flaechen auf glassDepth/glassSurface, Alphavarianten ueber accentAlpha(). Damit gilt die Design-Regel jetzt verbatim: Farbwerte ausschliesslich in lib/design/.
- **Neue glassOverlay-Tokens** (Sprint 193) in future-glass.ts: whiteSheen/whiteStrong/whiteBright, gridLine, scrim, dark, track, shadow — absorbieren die bisherigen rgba()-Ausnahmen in Komponenten.
- Sichtbarkeits-Feinschliff nach dem Sweep: unsichtbare Borders (Chat-TabBar, Dev-Trace, Paywall-Sheet, Error-Boundary) auf glassSurface.border gehoben, unlesbarer Paywall-Fineprint auf textMuted, Warn-Karten-Border auf borderStrong.
- Dokumentierte Ausnahmen bleiben: app/+html.tsx (Web-Boot-Shell, synchron vor React-Load — Werte spiegeln bewusst design-theme-palettes.ts, Dual-Maintenance-Kommentar) und app/dev/theme-lab.tsx (Dev-Palette-Playground, zeigt Farbwerte als Daten).
- Keine Logik-Aenderung: reine Praesentationsschicht; Agent-Farbwerte (Daten aus super-agents-logic) unberuehrt.

## [Unreleased — Sprint 188]

### Changed
- **Sprint 188 (Design) — Dashboard-Styling auf Glass-Primitives vereinheitlicht:** Der letzte Ad-hoc-Link im Dashboard („Geschäftsdaten öffnen") nutzt jetzt `GlowButton` (secondary, Akzent blau/Daten) aus den verbindlichen Glass-Primitives statt eigener Pressable-Karten-Styles — inkl. Press-Scale-Feedback, Glow-Rand und Accessibility-Label. Keine Ad-hoc-Flächen mehr im Dashboard-Screen; weiterhin ausschließlich Tokens aus `lib/design/future-glass.ts`.

## [Unreleased — Sprint 187]

### Added
- **Sprint 187 — Wix-API-Anbindung (read-only):** Admin-gated Karte „Wix-API" mit ehrlichem Konfigurationsstatus, verschlüsselter API-Key-Ablage (AES-256-GCM im KV, Env-Fallback), Site-ID-Setzung zur Laufzeit (KV, ohne Redeploy), Konto-Site-Suche (Tap-to-select) sowie Site-Properties (v4) und eCommerce-Orders-Views. Read-only-Client (`server/wix.ts`, 15-s-Timeout) mit klassifizierten Fehlerzustaenden aus der Live-Verifikation (META_SITE_NOT_FOUND, READ_ORDER_FORBIDDEN, HTML-403, Controller-404). 22 neue Tests (1195 gesamt). Siehe `docs/SPRINT_187_WIX_API.md`.
- **Sprint 187 (Performance) — KDF-Root-Cause-Fix:** NODE_ENV wurde in dieser Umgebung mit 'production' gesetzt; Vitest ueberschreibt ein besetztes NODE_ENV nicht, sodass die KDF-Guards (NODE_ENV=test) ins Leere liefen und PBKDF2 volle 310.000 Iterationen zog (~60 s je Backup-Datei). vitest.config.ts erzwingt jetzt NODE_ENV='test', support-backup erhaelt das Sprint-112-Override-Muster (Envelope-Iterationszahl), Worker-Reuse (isolate: false) und testTimeout: 180.000. Suite: 61 s → 4 s.
- **Sprint 187 (CI-Fix) — ENV dynamisch:** server/_core/env.ts friert die Env-Werte nicht mehr beim Modul-Import ein (dynamische Getter). Mit isolate: false bewertete sonst ein frueher Import ohne JWT_SECRET ENV.cookieSecret fuer alle Testdateien des Workers leer (CI: 'DataError: Zero-length key'). Produktion unberuehrt.

## [4.2.0] — 2026-09-19

**Tag:** v4.2.0 · **Commit:** d198c88 · **Verifikation:** tsc fehlerfrei, 1173 Tests gruen (142 Dateien), Expo-Web-Export erfolgreich, ESLint 0 Errors / 0 Warnings (Start des Lint-Sprints: 86 Warnings), GitHub CI + Gitleaks success · **Kosten der Neuerungen:** 0,00 EUR

### Added
- **Sprint 166 — Custom-Spiel-Codegenerator (Stufe 2):** Freier LLM-Spielgenerator fuer eigene Spielideen (Single-File-HTML5, Sandbox-Haerte: kein eval/Netzwerk/CDN, Offline-Template-Fallback) mit vollautonomer Fix-Schleife ueber `developCustom`-Route und Admin-UI; weiterhin harte 0-EUR-Garantie. Erweiterte Live-Fix-Watchdog-Aktionen: `invalidate_runtime_caches` (Latenz/5xx) und `restart_subsystem` (Watchdog ab 3 Wiederholungen in 10 Min) mit ehrlicher `applied=false`-Kennzeichnung und Occurrence-Tracker.
- **Sprint 167 — Secret-Vault:** Nutzer-scoped AES-256-GCM-Vault (KV-persistiert, gleiche Infrastruktur wie Provider-Keys). Erkannte API-Keys (Groq/OpenAI/Anthropic/Google/GitHub/OpenRouter/Slack/AWS/Bearer/Hex) werden im Repo-Chat und Superagenten-Chat autonom verschluesselt gespeichert, der Klartext aus dem Verlauf maskiert und ein ehrlicher Hinweis angehaengt; Klartext erscheint nie in Listen oder Logs. Neuer Secrets-Tab im Repo-Chat, VAULT-Modul im Superagenten-Chat; 13 neue Tests (1173 gesamt).
- **Sprint 168 — CyberSarah Future Glass:** Komplettes Design-System-Fundament (`lib/design/future-glass.ts` mit Token-System, Lichtquellen-Palette, AI-Core-Statusmaschine) und Glass-Komponenten-Bibliothek (`components/glass/`: AiCore, GlassCard, GlowButton, StatusChip, GlassBackdrop, GlassHeader, MetricTile, ControlModuleCard, HoloActivityCard mit animiertem SVG-Line-Chart, SuperagentHeroCard). Dashboard komplett auf das neue System umgebaut (ausschliesslich echte Backend-Daten), schwebende CyberGlass-Bottom-Navigation, Chat-Bubbles als Glass-Layers.

### Fixed
- **Sprint 169 — Runtime-Haertung:** EADDRINUSE-Handler am Listener (klare Meldung statt rohem Crash, kontrollierter Exit 1, live verifiziert), globale unhandledRejection/uncaughtException-Handler (speisen Runtime-Logger + Self-Healing-Ledger), PG-Pool-Haertung (keepAlive, 30s Idle-Timeout, Idle-Fehler-Handler gegen Neon-Idle-Kills). CI-Lint-Gate repariert (19 Errors via offiziellen `useAnimatedValue`-Hook).
- **Sprint 171 — Latenter Render-Loop geschlossen:** `coerceLedgerTask` erzeugte pro Render neue Objekte; ein Effekt mit neuer Set-Referenz lief bei jedem Render erneut.

### Changed
- **Sprint 170–172 — Lint-Sprint (86 → 0 Warnings):** Import-Hygiene, ungenutzte Variablen, axios-Named-Imports, tote Prefetches (Sprint 170). React-Compiler-Batch 1: alle 16 `set-state-in-effect`-Meldungen behoben — Spiegel-Staende durch Render-Ableitung ersetzt, offizielles Adjust-Pattern (React-Docs) fuer Provider-Wechsel/History-Reset/Hydratation, dokumentierte Ausnahmen fuer Fetch-on-Mount und Live-Polling (Sprint 171). React-Compiler-Batch 2: neue Tick-Uhr `hooks/use-now.ts` (useSyncExternalStore, Date.now lebt im Modul-Scope) ersetzt `Date.now()` in allen Render-Pfaden; Reanimated-Shared-Value-Writes ueber dokumentierte `"use no memo"`-Interop; nicht erhaltbare manuelle Memoisierung im Theme-Lab entfernt. ESLint final 0 Errors / 0 Warnings.

### Compatibility
- Keine Breaking Changes; keine Migration noetig. Betrieb weiterhin ohne Cloud-Keys moeglich (lokale Offline-Stufen Ollama / LM Studio).

---

## [4.1.1] — 2026-09-19

**Tag:** v4.1.1 · **Commit:** 376a980 · **Verifikation:** tsc fehlerfrei, 1149 Tests gruen (139 Dateien) · **Kosten der Neuerungen:** 0,00 EUR

### Added
- **Echte keylose Web-Suche:** DuckDuckGo-HTML-Scraping (`lib/keyless-search.ts`, `server/keyless-search.ts`) als dauerhaft kostenlose Alternative zu bezahlten Search-APIs — Redirect-Dekodierung (uddg), Snippet-Extraktion, Dedup, 8s-Timeout, ehrliches Fehlverhalten (keine erfundenen Treffer). Neuer admin-geschuetzter tRPC-Endpunkt `keylessSearch.search`. Live verifiziert: 8 Treffer fuer 'kostenlose llm api', 0 API-Keys.
- **Admin-UI 'Autonome Entwicklung':** Neue Karte im Admin-Dashboard (`components/studio/autonomous-dev-card.tsx`, eingebunden in `app/admin.tsx`) — Template-Auswahl aller 8 Vorlagen (Pong, Snake, Breakout, Flappy, To-Do, Notizen, Taschenrechner, Timer), Wunsch-Feld, Ein-Klick-Entwicklung mit 0-EUR-Nachweis und Uebersicht der letzten Laeufe inklusive Kosten.
- **Tests:** 5 neue Logik-Tests fuer die Such-Parsing-Basis (Redirect-Dekodierung, Dedup, Validierung, Encoding).

### Fixed
- **Live-Fix-Quarantaene wirkt jetzt in der Chat-Runtime:** `invokeLLM()` (`server/_core/llm.ts`) filtert vom Self-Healing-Live-Fix quarantaenierte Provider (60s nach 429/Quota-Fehler) aktiv aus der Kette und rotiert sofort auf den naechsten Endpoint; sind alle Provider in Quarantaene, wird Best-Effort weitergearbeitet — der Service bleibt nie stumm.

### Documentation
- CHANGELOG um die Sprint-Abschnitte 163 (ToolLimitResolverAgent & Tool-Rotator), 164 (vollautonome 0-EUR-Entwicklung + Live-Fix-Agent) und 165 (Review-Fixes) ergaenzt.

### Compatibility
- Keine Breaking Changes; keine Migration noetig. Betrieb weiterhin ohne Cloud-Keys moeglich (lokale Offline-Stufen Ollama / LM Studio).

---

## [4.1.0] — 2026-09-19

**Tag:** v4.1.0 · **Verifikation:** tsc fehlerfrei, 1144 Tests gruen · **Kosten der Neuerungen:** 0,00 EUR

### Added
- **Zero-Cost-Dev-Stack-Registry:** alle kostenlosen LLMs (Groq, OpenRouter :free, Gemini 2.5, Cerebras, SambaNova, GitHub Models plus lokale Ollama-/LM-Studio-Endpunkte), kostenlosen Entwicklungswerkzeuge und Anbindungs-Alternativen (GitHub-API Free, Neon Free, DuckDuckGo, lokale Ablage) mit ehrlichem `isZeroCost`-Nachweis; bezahlte Endpoints werden NIE gewaehlt.
- **Autonome Entwicklungs-Pipeline:** 8 Standalone-HTML5-Templates mit Plan -> freie LLM-Personalisierung (Cloud -> Ollama -> Template-Defaults) -> `node --check`-Verifikation mit autonomer Fix-Schleife -> Lieferung ins Workspace; vollstaendig autonom auch ohne jeden API-Key (Offline-Modus). Live-Lauf: Snake, 4,4 KB, Verifikation bestanden.
- **Live-Fix-Agent:** Incidents werden sofort live behoben (Backup-Waechter-Reset bei DB-Stoerung, Log-Puffer-Purge bei OOM, 60s-Provider-Quarantaene bei 429/Quota); angewandte Fixes werden am Incident dokumentiert.
- **tRPC:** Router `autonomousDev` (catalog / stack / develop / runs / preview); 17 neue Logik-Tests.

### Compatibility
- Keine Breaking Changes; keine Migration noetig.

---

## Sprint 165 (2026-09-19) — Offene Punkte aus dem V4.1-Review behoben

### Keyless Web-Search (Alternative zu bezahlten Search-APIs)
- `lib/keyless-search.ts` + `server/keyless-search.ts`: echte, keylose Web-Suche via DuckDuckGo-HTML-Scraping (uddg-Redirect-Dekodierung, Snippet-Extraktion, Dedup, Ergebnisbegrenzung, 8s-Timeout, ehrliches Fehlverhalten) — 0 EUR, 0 API-Keys.
- tRPC: `keylessSearch.search` (admin-geschuetzt). Live verifiziert: 8 Treffer fuer 'kostenlose llm api'.
- 5 neue Logik-Tests; Router registriert.

### Live-Fix-Quarantaene in der Chat-Runtime
- `server/_core/llm.ts`: `invokeLLM()` filtert quarantaenierte Provider (60s nach 429/Quota) aus der Kaskade — die Kette rotiert sofort auf den naechsten Endpoint; sind alle in Quarantaene, wird Best-Effort weitergearbeitet (nie stumm).

### Admin-UI
- `components/studio/autonomous-dev-card.tsx` + Einbindung in app/admin.tsx: Template-Auswahl (8 Vorlagen), Wunsch-Feld, Ein-Klick-Entwicklung (0 EUR), letzte Laeufe mit Kosten-Nachweis.

## Sprint 164 (2026-09-19) — Vollautonome 0-EUR-Entwicklung + Live-Fix-Agent

- Zero-Cost-Dev-Stack-Registry (`lib/free-dev-stack.ts`): alle kostenlosen LLMs (Groq/OpenRouter :free/Gemini/Cerebras/SambaNova/GitHub Models + lokale Ollama/LM-Studio-Endpunkte), Werkzeuge (tsc, vitest, node --check) und Anbindungs-Alternativen (GitHub-API Free, Neon Free, DuckDuckGo, lokale Ablage) mit ehrlichem isZeroCost-Nachweis; bezahlte Endpoints werden NIE gewaehlt.
- Autonome Entwicklungs-Pipeline (`lib/autonomous-dev-logic.ts` + `server/autonomous-dev.ts`): 8 Standalone-HTML5-Templates (Pong, Snake, Breakout, Flappy, To-Do, Notizen, Taschenrechner, Timer) — Plan -> freie LLM-Personalisierung (Cloud -> Ollama -> Template-Defaults) -> node --check-Verifikation mit autonomer Fix-Schleife -> Lieferung ins Workspace; auch OHNE jeden API-Key vollstaendig autonom (Offline-Modus), harte 0-EUR-Garantie. Live-Lauf: Snake 4,4 KB, Verifikation bestanden.
- Live-Fix-Agent (`lib/live-fix-logic.ts`, verdrahtet in server/self-healing.ts): Incidents werden sofort live behoben — Backup-Waechter-Reset bei DB-Stoerung, Log-Puffer-Purge bei OOM, 60s-Provider-Quarantaene bei 429/Quota; angewandte Fixes werden am Incident dokumentiert.
- tRPC: `autonomousDev`-Router (catalog/stack/develop/runs/preview). 17 neue Tests. Release v4.1.0 veroeffentlicht.

## Sprint 163 (2026-09-19) — ToolLimitResolverAgent & Tool-Rotator

- `artifacts/api-server`: Dynamic Tool & Key Rotator Engine mit kostenloser Multi-Tier-Kaskade (Tier 1: Groq/Gemini 2.5/Cerebras/SambaNova/GitHub Models, Tier 2: OpenRouter :free/HF Serverless/Cloudflare Workers AI, Tier 3: lokales Ollama — garantiert unbegrenzt).
- ToolLimitResolverAgent (BaseAgent): faengt 429/403/503, Quota- und Token-Limits autonom ab, rotiert in Millisekunden, re-executet gescheiterte Tasks ohne Datenverlust; Dedicated VIP Admin Bypass (Admin-Keys nie vom Cooldown-Loop beruehrt), 60s-Cooldown-Queue mit Selbstheilung (STATUS: HEALTHY).
- Zentrale Task-Execution-Pipeline + Express/tRPC-Middleware-Adapter; Resilienz- & HITL-Test-Suite (32 Checks, Exit-Codes, GREEN-Banner).


## Sprint 162 (2026-09-19) — Vektor-Gedaechtnis produktiv: Tabelle, Store-Adapter, Prompt-Injektion

### Memory
- Neue Drizzle-Tabelle `agentMemoryVectors` (Migration 0007: userOpenId, source, refId, text, vector jsonb, metadata, Index auf (userOpenId, createdAt)) — laeuft ohne Erweiterung, pgvector-ready dokumentiert; Migration zieht die in Sprint 160 fehlende `users.designTheme`-Spalte nach.
- `server/vector-memory-store.ts`: VectorMemoryStore-Vertrag produktiv gebunden — save/query (Kosinus-Ranking anwendungsseitig, 200 Kandidaten), `queryUserBestPractices()`, `persistLearningVector()`; ehrlicher No-DB-Pfad.
- `server/development-chat.ts`: Agenten fragen vor neuen Aktionen historische Best-Practices aus dem Vektor-Gedaechtnis ab (Kontext-Injektion neben den keyword-gerankten Learnings); save_learning und Auto-Learnings werden parallel als Vektor-Erinnerung persistiert (Best-Effort, nie blockierend).
- `lib/vector-memory-logic.ts`: `formatBestPracticesForContext()` — deduplizierte, gekapte, nummerierte Snippets (max. 3) fuer den System-Prompt.

### Verifikation
- 1127 Tests gruen (4 neu), tsc sauber, 0 Lint-Errors, verify:system GREEN mit 10 Kernmodulen. Bericht: `docs/SPRINT_162_VEKTOR_GEDAECHTNIS.md`. Offen: Migration 0007 auf Neon anwenden (Owner), repo.searchCode-Tool (Sprint 163).


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
