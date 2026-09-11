# Sprints 42–51 — Abschlussbericht (NEXT_STEPS-Serie)

**Datum:** 11.09.2026
**Serie:** Die in `NEXT_STEPS.md` (Stand 2026-09-06) geplanten Sprints 42–51 — Anbindung der Logic-Module aus Sprint 32–40 an Oberfläche, Persistenz und Release-Workflow.
**Basis:** `main` @ `0436815` (Tag `v1.2.1` liegt auf dem PR-#5-Merge `45af833`)

---

## Vollzugene Sprints

| Sprint | Ziel | Umsetzung |
|---|---|---|
| 42 | Nutzungsbudget in die Qualitätstafel | `77adc25` — verifizierter Budgetzustand (ok/warnung/erschöpft) mit tokenfreier Zusammenfassung, überschrittene Budgets sichtbar begründet. |
| 43 | Provider-Latenz-Ranking im Verbindungstest | `7bb8b39` — Latenzmessungen je Verbindungstest, Ranking mit Fallback-Empfehlung, veraltete Messungen markiert. |
| 44 | Sync-Konfliktansicht im Workspace | `4aab369` — Konfliktklasse je Datei in der Diff-Ansicht; nur als sicher bewertete Auflösungen automatisch ausführbar, echte Konflikte blockieren sichtbar. |
| 45 | Vorschlagswarteschlange im Agentenbereich | `03ce2b9` + `3a6cf57` — priorisierte Vorschläge mit Zustand, Ablaufdatum und Duplikatschutz nach der geprüften Sprint-35-Zustandsmaschine. |
| 46 | Snapshot-Rollback in den Anwendungsfluss | `158992c` — Snapshot vor jeder Anwendung, „Rückgängig" stellt ausschließlich verifizierte Inhalte wieder her, nur einmal ausführbar. |
| 47 | Audit-Rotation am Audit-Service | `b79dc28` — der externe Audit-Service nutzt die Sprint-37-Rotation; Export bleibt tokenfrei und zählt Redaktionen nachvollziehbar. |
| 48 | Backoff-Plan in die Offline-Warteschlange | `41e829a` — `planOfflineQueueRetries`/`advanceOfflineQueue` heben die offene Queue auf das geprüfte Backoff-Modell ab (30s Basis, 30min Deckel, max. 5 Versuche); Konflikte blockieren, erschöpfte Versuche werden final abgelehnt. 8 neue Integrationstests. |
| 49 | Changelog-Generierung in den Release-Workflow | `5670983` — `buildReleaseHandoff` führt den Preflight aus, erzeugt aus Conventional Commits das tokenfreie Changelog (Token/Secrets/URLs redigiert) und hängt es ans Handoff-Artefakt (schemaVersion 2); Script via `tsx`, CI hinterlegt App-Name und Android-Package. 6 neue Tests. |
| 50 | Chat-Kompression in die Verlaufspersistenz | `0436815` — `compressPersistedChatHistory` komprimiert die gespeicherte Historie ab `CHAT_COMPRESSION_MAX_MESSAGES` (Standard 60) deterministisch; der Verdauungseintrag (Anzahl + stabiler FNV-1a-Hash) bleibt reproduzierbar. 5 neue Tests. |
| 51 | Gesamt-Regression und Abschluss | Dieser Bericht; Ergebnisse unten. |

Ergänzend in der Serie abgeschlossen: SDK-57-Sicherheitssprint (`4085581`, High-/Critical-Vulnerabilities 40 → 7) und Release-Version 1.2.1 inkl. Tag (PR #5, `45af833`).

---

## Regression (Sprint 51)

| Prüfung | Ergebnis |
|---|---|
| TypeScript (`npm run check`) | ✅ fehlerfrei |
| Tests (`npm test`) | ✅ 481/482 — der einzige Fehlschlag ist der bekannte, umgebungsbedingte Sandbox-Smoke-Test (Port-Konflikt in der Sandbox); CI auf GitHub ist grün |
| Build (`npm run build`, esbuild-Server-Bundle) | ✅ `dist/index.js`, 144.8 kB |
| Service-Syntax (`node --check workspace-service/src/index.js`) | ✅ |
| Secret-Scan (getrackte Dateien: OpenAI-, GitHub-, Slack-, AWS-, Google-, Render-Keys, PEM-Private-Keys) | ✅ sauber — einziger Treffer ist ein jq-Prüfmuster in `scripts/install-play-store-credentials.sh` (Validierungslogik, kein Secret) |
| Git-Status | ✅ clean auf `main`, alles gepusht |
| Release-Preflight | ✅ validiert (App-Name, Version 1.2.1, Android-Package `com.app.customaistudiomobile`, portrait, Build-Command) |

---

## Offene Entscheidungen (ausdrücklich dem Owner vorbehalten)

1. **Prebuild-Konflikt `android/` vs. `app.config.ts` — ENTSCHIEDEN (11.09.2026):** Der Owner hat entschieden, `android/` eingecheckt zu lassen. Der Ordner ist die Quelle der Wahrheit für native Builds: Die APK-Pipeline (`build-apk.yml`) baut per Capacitor direkt daraus, und der Sprint-73-Fix (R8 deaktiviert) liegt als native Anpassung darin. `app.config.ts` steuert ausschließlich die Expo-/Web-Seite. Kein Umbau auf CNG; native Anpassungen werden weiterhin direkt im Ordner gepflegt.
2. **SDK 57 als Zielsprint:** Das Sicherheits-Upgrade ist erfolgt (`4085581`); das vollständige SDK-57-Major-Upgrade (App-Build, native Module, Play-Store-Pipeline) bleibt gemäß Owner-Anweisung ein separater Sprint.

## Mittel- und langfristige Richtung (aus NEXT_STEPS.md übernommen)

- Betriebserfahrung aus dem Realgerät-Test in die Provider-Routing-Logik zurückfließen lassen (Messwerte, Timeouts, Fallback-Schwellen).
- Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenführen.
- Verschlüsselte Support- und Settings-Backups um die neuen Zustände (Budget, Latenz-Ranking, Snapshots) erweitern, sobald diese persistiert werden.

---

**Fazit:** Alle zehn geplanten Sprints der NEXT_STEPS-Serie sind umgesetzt, getestet und auf `main` gepusht. Die Logik-Module aus Sprint 32–40 sind vollständig in Oberfläche, Persistenz und Release-Workflow angebunden. Projektgröße: 414 getrackte Dateien, 76 Testdateien, 482 Tests.
