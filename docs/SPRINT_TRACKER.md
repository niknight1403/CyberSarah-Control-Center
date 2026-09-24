# Sprint-Tracker 284–383

**Stand:** 24.09.2026 · 1684 Tests grün · Produktiv-Backend deployed · APK v2.5.6

Arbeitsregeln und Sprintverzeichnis: `docs/SPRINTPLAN_284-383.md`.
Der nächste nicht abgehakte Sprint ist dran. Pro Batch = 5 Sprints.

| Batch | Sprints | Zustand | Notiz |
|---|---|---|---|
| 1 | 284–288 | ERLEDIGT | Serie A: Dev-Loop (1.572 Tests grün, 188 Testdateien) |
| 2 | 289–293 | ERLEDIGT | Serie A Rest + Abschluss (1.589 Tests grün, 192 Testdateien) |
| 3 | 294–298 | ERLEDIGT | Serie B: i18n, Onboarding v2, Templates, Empty-State, Error-Fallbacks (1.684 Tests grün, 197 Testdateien) |
| 4 | 299–303 | ERLEDIGT | Serie B Rest + Abschluss: Snackbar-System, Startzeit-Messung, A11y-Audit, Theme-Scanner (1.770 Tests gruen, 208 Testdateien) |
| 5 | 304–308 | ERLEDIGT | Serie C Batch 1: BYO-Key, Stimmenauswahl, Render-Queue, Skript-Editor, Bild-Fallback-Kette (1.770 Tests gruen, 208 Testdateien) |
| 6 | 309–313 | ERLEDIGT | Serie C Abschluss: Medien-Cache, SRT-Export, Batch-Export, Ergebnis-Verlauf (1.795 Tests gruen, 212 Testdateien) |
| 7 | 314–318 | ERLEDIGT | Serie D: Umsatz-Reihe 2 (1.795→1.840 Tests, 212→218 Dateien) |
| 8 | 319–323 | ERLEDIGT | Serie D Rest + Abschluss (v2.8.0) |
| 9 | 324–328 | ERLEDIGT | Serie E: Zuverlässigkeit (1.840→1.900 Tests, 218→230 Dateien) |
| 10 | 329–333 | ERLEDIGT | Serie E Rest + Abschluss (v2.9.0) |
| 11 | 334–338 | ERLEDIGT | Serie F: Integrationen (1.900→1.950 Tests, 230→242 Dateien) |
| 12 | 339–343 | ERLEDIGT | Serie F Rest + Abschluss (v3.0.0) |
| 13 | 344–348 | ERLEDIGT | Serie G: Mobile-Politur (1.957→1.987 Tests, 247→250 Dateien) |
| 14 | 349–353 | OFFEN | Serie G Rest + Abschluss |
| 15 | 354–358 | OFFEN | Serie H: Admin & Ops |
| 16 | 359–363 | OFFEN | Serie H Rest + Abschluss |
| 17 | 364–368 | OFFEN | Serie I: Agent-Intelligenz |
| 18 | 369–373 | OFFEN | Serie I Rest + Abschluss |
| 19 | 374–378 | OFFEN | Serie J: Finale |
| 20 | 379–383 | OFFEN | Serie J Rest + Abschluss-Validierung |

## Sprint-Einzelverfolgung

- [x] 284–288 — Dokumentiert in `docs/2026-09-24_SPRINTS_284-288_AGENT_WERKZEUGE_DEV_LOOP.md`
- [x] 289–293 — Dokumentiert in `docs/2026-09-24_SPRINTS_289-293_SERIE_A_ABSCHLUSS.md`
- [ ] 294 … [ ] 383 — wird pro Batch im zugehörigen Sprint-Doku-Detail geführt; hier nur Batch-Zustand.
- [x] 294–298 — Dokumentiert in `docs/2026-09-24_SPRINTS_294-298_SERIE_B_PRODUKT_POLITUR.md`

## Batch-Protokoll

- **Batch 1 (Sprints 284–288):** ERLEDIGT am 24.09.2026. Live-Preview-Zyklus Chat↔Preview, Multi-File Refactoring (Transaktion + Rollback), Code-Suche, Test-Runner, Iterations-Limits. Tests: 1.560 → 1.572 (+12), 188 Testdateien.
- **Batch 2 (Sprints 289–293):** ERLEDIGT am 24.09.2026. Werkzeug-Fehlerklassen & Retry-Semantik, Kontextfenster-Verdichtung ohne Informationsverlust, Commit-Diff-Vorschau im Chat, Sprint-Ziele als GitHub-Issues, Serie-A-Abschluss. Tests: 1.572 → 1.589 (+17), 192 Testdateien.
- **Batch 3 (Sprints 294–298):** ERLEDIGT am 24.09.2026. EN-Sprach-Toggle (i18n), Onboarding v2 mit ehrlichen Erwartungen, Template-Galerie (7 Vorlagen, 4 Kategorien), Chat-Empty-State mit Starter-Prompts, Fehlerbildschirme mit sprechenden Fallbacks. Tests: 1.589 → 1.684 (+95), 197 Testdateien.
- **Batch 4 (Sprints 299–303):** ERLEDIGT am 24.09.2026 (Commit 34f0421). Snackbar-System, Startzeit-Messung (Milestone-300-Regression), A11y-Audit, Theme-Scanner, Doku. Tests: 1.684 → 1.770 (+86), 208 Testdateien.
- **Batch 5 (Sprints 304–308):** ERLEDIGT am 24.09.2026 (Commit 269e115). BYO-Key, Stimmenauswahl, Render-Queue, Szenen-Editor, Bild-Fallback-Kette. v2.6.0. Tests: 1.770 (gleich), 208 Testdateien.
- **Batch 6 (Sprints 309–313):** ERLEDIGT am 24.09.2026 (Commit c1c94d7). Medien-Cache-Aufräumlogik, SRT-Export, Batch-Export, Ergebnis-Verlauf. v2.7.0. Tests: 1.770 → 1.795 (+25), 212 Testdateien.
- **Batch 7+8 (Sprints 314–323):** ERLEDIGT am 25.09.2026 (Commits bbba9b6, 922367f). Quota-Mode-Schalter mit Audit, Upgrade-Prompt-UI, Checkout-Rückweg, Abrechnung, Tier-Vergleich, Testmodus-Kennzeichnung, Kündigungs-Flow, MRR v2, Ops-Payment-Alerts, Serie-D-Abschluss. v2.8.0. Tests: 1.795 → 1.840 (+45), 218 Testdateien.
- **Batch 9+10 (Sprints 324–333):** ERLEDIGT am 25.09.2026 (Commits e35a188, a44bd4d). Strukturierte Logs mit Korrelations-ID, Rate-Limits, RLS-Deckung, Restore-Beweis, Crash-Klassifizierung, Selbstheilung, Dependency-Audit, Geheimnis-Hygiene, Health-Deep-Check, Serie-E-Abschluss. v2.9.0. Tests: 1.840 → 1.900 (+60), 230 Testdateien.
- **Batch 11+12 (Sprints 334–343):** ERLEDIGT am 25.09.2026 (Commits 2848acd, 0aecd3e). E-Mail v2 (Anhänge+Vorlagen), Kalender-Abstraktion, Webhook-Eingang mit Signatur, Export-Center, Import-Wizard, API-Keys mit Scopes, ehrliche API-Doku, Slack/Discord-Webhooks, Integrations-Diagnose, Serie-F-Abschluss. v3.0.0. Tests: 1.900 → 1.950 (+50), 242 Testdateien.
- **Batch 13 (Sprints 344–348):** ERLEDIGT am 25.09.2026 (Commits a49d10e, 02b6b43, folgend). Navigation-Pass (per-Tab-Stacks, Deep-Links), Offline-Zustände (Entprellung, Reconnect-Plan, Offline-Banner), Skeleton-Lade-Logik (Screen-Presets, Hybrid-Modus, Flackern-Schutz), Lokale Notifications (5 Kategorien, ohne FCM, ehrlich), APK-Größen-Metriken (Budget, Empfehlungen, Startzeit-Optimierung). Tests: 1.957 → 1.987 (+30), 250 Testdateien.. Sprint 344 (Navigation-Pass, Commit a49d10e) und Sprint 345 (Offline-Zustände, Commit 02b6b43) erledigt. Sprints 346-348 offen.

