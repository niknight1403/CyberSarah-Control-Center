# CyberSarah Control Center — Nächste geplante Schritte

Stand: 2026-09-11 — **Sprints 42–51 sind abgeschlossen.** Abschluss und Regression: `docs/SPRINT_42_51_ABSCHLUSSBERICHT.md`. Der Prebuild-Konflikt ist am 11.09.2026 vom Owner entschieden: `android/` bleibt eingecheckt und ist die Quelle der Wahrheit fuer native Builds (Capacitor-APK-Pipeline inkl. Sprint-73-Fixes); `app.config.ts` steuert die Expo-/Web-Seite.

Stand: 2026-09-06 (nach Abschluss der Sprints 32–41, Commit `bba1724`)

Diese Datei dokumentiert die geplante Weiterentwicklung nach Sprint 41. Die Sprints 42–51 schließen an die etablierte Arbeitsweise an: Jeder Sprint wird separat umgesetzt, getestet und committet. Im Vordergrund steht jetzt die Anbindung der in Sprint 32–40 entstandenen Logic-Module (`usage-budget`, `chat-compression`, `conflict-resolution`, `proposal-queue`, `change-snapshot`, `audit-rotation`, `provider-latency`, `changelog`, `retry-backoff`) an die bestehende Oberfläche und Infrastruktur.

## Sprint 42–51

| Sprint | Ziel | Akzeptanzkriterium |
|---|---|---|
| 42 | Nutzungsbudget in die Qualitätstafel einbinden | Die Qualitätstafel zeigt den verifizierten Budgetzustand (ok, warnung, erschöpft) mit tokenfreier Zusammenfassung; überschrittene Budgets sind sichtbar begründet. |
| 43 | Provider-Latenz-Ranking in den Verbindungstest integrieren | Jeder Verbindungstest zeichnet Latenzmessungen auf, zeigt Ranking und Fallback-Empfehlung; veraltete Messungen werden markiert. |
| 44 | Sync-Konfliktansicht im Workspace ergänzen | Die Datei-Diff-Ansicht zeigt die Konfliktklasse je Datei; nur als sicher bewertete Auflösungen sind automatisch ausführbar, echte Konflikte blockieren den Sync sichtbar. |
| 45 | Vorschlagswarteschlange im Agentenbereich anzeigen | Agenten-Vorschläge erscheinen priorisiert mit Zustand, Ablaufdatum und Duplikatschutz; Zustandsübergänge folgen der geprüften Zustandsmaschine. |
| 46 | Snapshot-Rollback in den Anwendungsfluss integrieren | Vor jeder Anwendung eines Vorschlags wird automatisch ein Snapshot erzeugt; „Rückgängig machen" stellt ausschließlich verifizierte Inhalte wieder her und ist nur einmal ausführbar. |
| 47 | Audit-Rotation an den Audit-Service anbinden | Der externe Audit-Service (`external-action-audit-service`) nutzt die Rotation; Export bleibt tokenfrei und zählt Redaktionen nachvollziehbar. |
| 48 | Backoff-Plan in die Offline-Warteschlange überführen | Die bestehende Offline-Queue (`offline-action-logic`) plant Wiederholungen mit Exponential-Backoff; Konflikte blockieren Wiederholungen, erschöpfte Versuche werden final abgelehnt. |
| 49 | Changelog-Generierung in den Release-Workflow einbinden | Der Release-Preflight erzeugt aus Conventional Commits ein redigiertes Changelog und hängt es an das Handoff-Artefakt an. |
| 50 | Chat-Kompression in die Verlaufspersistenz integrieren | Gespeicherte Entwicklungschats werden beim Überschreiten konfigurierbarer Grenzen deterministisch komprimiert; Verdauungseinträge bleiben stabil hashbar. |
| 51 | Gesamt-Regression, Release-Preflight und Abschluss | TypeScript, Tests, Build, Service-Syntax, Secret-Scan und Git-Status sind erfolgreich; Abschlussbericht liegt vor. |

## Detailplanung Sprint 45 — Vorschlagswarteschlange im Agentenbereich

Grundlage ist das in Sprint 35 verifizierte Modul `lib/proposal-queue-logic.ts` (9 deterministische Tests in `tests/proposal-queue-logic.test.ts`). Die folgende Detailplanung übernimmt Logik und Zustandsübergänge unverändert aus Sprint 35; die Oberflächenanbindung erfolgt in `app/(tabs)/agent.tsx`.

### Datenmodell (aus Sprint 35 übernommen)

- `AgentProposal`: `id`, `targetPath`, `contentHash`, `priority` (`critical` → `high` → `normal` → `low`), `createdAtMs`, `expiresAtMs`, `status`.
- `ProposalStatus`: `pending`, `review`, `applied`, `rejected`, `expired`.
- `QueueConfig`: `nowMs` und `maxQueued` (muss mindestens 1 sein, sonst Fehler).

### Queue-Bewertung — `evaluateProposalQueue` (Regeln wortgleich aus Sprint 35)

1. Abgelaufene Vorschläge werden deterministisch auf `expired` gesetzt — ein Vorschlag gilt als abgelaufen, wenn `expiresAtMs <= nowMs` und sein Status weder `applied` noch `rejected` ist.
2. Duplikate (gleiches Ziel und gleicher Inhalts-Hash, Schlüssel aus `targetPath` und `contentHash`) werden verworfen; der älteste Eintrag bleibt erhalten. Bewertet werden ausschließlich aktive Vorschläge (`pending` oder `review`).
3. Die übrigen Vorschläge werden nach Priorität und dann nach Erstellung sortiert; bei Überlauf werden die niedrig priorisierten verworfen.

Das Ergebnis (`QueueEvaluation`) liefert `order` (sortierte Liste), `expiredIds`, `duplicatesRemoved` und `droppedForOverflow` — die Oberfläche zeigt alle vier Aspekte.

### Zustandsübergänge — `transitionProposal` (Zustandsmaschine wortgleich aus Sprint 35)

| Aktueller Status | Erlaubte Folgestatus |
|---|---|
| `pending` | `review`, `rejected`, `expired` |
| `review` | `applied`, `rejected`, `expired` |
| `applied` | — (endgültig) |
| `rejected` | — (endgültig) |
| `expired` | — (endgültig) |

Ein Übergang in den aktuellen Status ist nie erlaubt; jede Prüfung liefert `allowed`, `nextStatus` und eine begründete `reason`. Angewendete, abgelehnte und abgelaufene Vorschläge sind endgültig und können nicht erneut geöffnet werden. Die Oberfläche bedient Zustandswechsel ausschließlich über diese Funktion.

### Anzeige im Agentenbereich

Priorisierte Liste mit Status-Badge, Priorität und Ablaufdatum; abgelaufene Vorschläge bleiben sichtbar, sind aber nicht mehr anwendbar. Die Darstellung bleibt tokenfrei (keine Inhalte, Secrets oder Endpoints). Das Warteschlangenlimit (`maxQueued`) wird aus der bestehenden Studio-Konfiguration bezogen.

### Umsetzungsschritte und Validierung

1. **Einspeisung**: Vorschläge aus dem Entwicklungschat werden direkt als `AgentProposal` überführt (Ziel-Pfad und Inhalts-Hash aus der bestehenden Proposal-Antwort des Workspace-Service; Priorität und Ablaufzeit aus der Studio-Konfiguration).
2. **Bewertung**: Bei jeder Aktualisierung läuft `evaluateProposalQueue`; die Oberfläche zeigt Ordnung, Ablauf, Duplikat- und Überlauf-Hinweise aus `QueueEvaluation`.
3. **Bedienung**: Ansehen, Anwenden und Ablehnen ausschließlich über `transitionProposal`; abgelehnte Ergebnispräsentation enthält immer die begründete `reason`.
4. **Validierung**: TypeScript (`npx tsc --noEmit`), volle Vitest-Suite, Server-Build und Secret-Scan müssen erfolgreich sein, bevor der Sprint committet und gepusht wird.

Akzeptanzkriterium (unverändert): Agenten-Vorschläge erscheinen priorisiert mit Zustand, Ablaufdatum und Duplikatschutz; Zustandsübergänge folgen der geprüften Zustandsmaschine.

## Autonomie- und Erweiterungsprogramm (Modul 1–5, ab Sprint 74)

Struktur: Jedes Modul wird als eigener Sprint umgesetzt (Konvention: Major-Aenderungen separat). Bestehende Logik wird erweitert, nicht neu gebaut — die Roadmap vermerkt den Ist-Zustand je Modul.

### Sprint 74 — Design-System & Multi-Theme-Engine (Modul 1) — ERLEDIGT (11.09.2026)
- Drei vollwertige Design-Themes: "Cyber Neon" (Obsidian-Dark, Cyan-/Magenta-Glow), "Enterprise Slate" (helles Profi-Layout), "Glas-Modern" (transluzente Flaechen, Blur, Gradients).
- Theme-Switcher in den Einstellungen ("Darstellung") und im Dev-Theme-Lab; Persistenz via AsyncStorage; Palette UND Effekt-Tokens (Glow, Glas-Blur, Gradient) schalten global.
- Reine Logik in `lib/design-theme-logic.ts` + `lib/_core/design-theme-palettes.ts` (ohne react-native-Kette, vitest-tauglich), 7 neue Tests.

### Sprint 75 — Responsive Layout (Modul 1, Teil 2) — ERLEDIGT (11.09.2026)
- Umgesetzt: Breakpoints in `lib/viewport-logic.ts` (Tablet 768px, Desktop 1200px), `AppSidebar` (Design-Theme-aware, Rail-Modus ab 1100px) ersetzt auf breiten Web-Viewports die Bottom-Tabs; aktives Item per Pfad-Präfix aufgelöst. 4 Tests.

### Sprint 76 — Loop Engineering & Selbstheilung (Modul 2) — ERLEDIGT (11.09.2026)
- Umgesetzt: `lib/loop-engineering-logic.ts` — Iterations-Cap (Standard 40), Signatur-basierte Schleifen-Erkennung, Konvergenz-Auswertung über Fortschrittsfenster (Ziel 0.95, Mindestdelta 0.02) und Selbstheilungs-Eskalationsleiter (retry mit deterministischem Backoff → Strategiewechsel → Eskalation → harte Abbruchkante). 8 Tests.

### Sprint 77 — Ziel-Zerlegung & Ausführungsgraphen (Modul 2) — ERLEDIGT (11.09.2026)
- Umgesetzt: `lib/goal-graph-logic.ts` (DAG-Zerlegung, Kahn-Topologie mit Zykluserkennung, Schritt-Zustandsmaschine mit Abhaengigkeits-Validierung, Fortschritts-/Blockiert-Erkennung, wiederanlaufbar) und `lib/syntax-highlight-logic.ts` + `lib/prompt-optimization-logic.ts`. Komponenten: DiffViewer (syntax-highlighted, auf file-diff-logic aufbauend), StreamingOutput (Chunk-Akkumulation, Cursor), TerminalPreview (Human-in-the-Loop-Ausloesung, Status-Lebenzyklus), SystemContextInspector. 14 Tests.

### Sprint 78 — API-Key-Rotation & Failover (Modul 3) — ERLEDIGT (11.09.2026)
- Ist-Basis: `provider-key-logic.ts`, `provider-latency-logic.ts`, `provider-status-logic.ts`, `audit-rotation-logic.ts`, `model-router-logic.ts`.
- Umgesetzt: `lib/key-rotation-logic.ts` — Key-Pool mit Health-Score (Latenz, Restguthaben), 429-Cooldown mit automatischer Freigabe, 402/403/Leerguthaben → exhausted, deterministischer Failover (Provider-Filter, Hoechst-Score, stabiler Tie-Break), `rotateOnFailure` traegt den Ausfuehrungskontext mit (Rotation-Report). Kostengewichtetes Modell-Tier-Routing (mini/standard/flagship) je Task-Klasse aus model-router-logic. 7 Tests mit simulierten 429/Latenz-Szenarien.

### Sprint 79 — MCP-Client & Connector-Registry (Modul 4, Teil 1) — ERLEDIGT (11.09.2026)
- Ist-Basis: `connector-preferences-logic.ts`, `skill-preferences-logic.ts`.
- Umgesetzt: `lib/mcp-registry-logic.ts` — Tool-Discovery-Merge ueber Server (Dedupe per voller ID, Konflikt-Report), Endpoint-Validierung (nur HTTPS, keine privaten Adressen), Faehigkeits-Matching (Permissions + Relevanz, Ausschluss-Flags), Berechtigungs-Gate fuer Tool-Ausfuehrung und unvergaengliche Connector-Registry (web-search/execution/filesystem/custom-api) mit Duplicate- und URL-Validierung. Transportschicht (SSE/HTTP) dockt an die Typen an. 6 Tests.

### Sprint 80 — GitHub- & Stripe-Integration vertiefen (Modul 4, Teil 2) — ERLEDIGT (11.09.2026)
- Ist-Basis: GitHub-PAT-Verbindung (Settings, Repository-Sync), `stripe-webhook-logic.ts` mit `customer.subscription.updated`/`checkout.session.completed`, `subscription-tiers-logic.ts`, `usage-budget-logic.ts` (Token-Metering).
- Umgesetzt: `lib/github-integration-logic.ts` — OAuth-URL-Bau mit CSRF-State-Schutz und Callback-Validierung, PAT-Plausibilitaetspruefung und Maskierung, Branch-Namen-Ableitung (kebab-case) und -Validierung, PR-Payload-Bau mit Datei-Uebersicht, Webhook-Reducer (push/PR opened/PR merged, robust gegen ungueltige Payloads). `lib/stripe-metering-logic.ts` — checkout.session.completed/expired-Abbildung auf Subscription-Aktivierung (Tier-Validierung gegen SUBSCRIPTION_TIERS), nutzungsbasiertes Token-Metering (Buchungs-Ledger, Zeitfenster-Aggregation je Modell, Kosten in Cent), Checkout-Session-Request-Bau mit Price-ID/HTTPS/E-Mail-Validierung. 9 Tests.

### Sprint 81 — RBAC-Tiers & Elite/Admin-Override (Modul 5)
- Ist-Basis: `subscription-tiers-logic.ts` (Free/Pro-Struktur), `feature-flag-logic.ts`, Admin-Role (`account.me.role === "admin"`).
- Ziel: Tier-Modell Free/Pro/Developer Max/Elite; Override-Mechanismus (Caps, Rate-Limits, Feature-Gates umgehen) NUR serverseitig pruefen; Admin-Dashboard: Subscription-Verwaltung, Token-Quote-Overrides, globale Key-Pool-Konfiguration.

### Sprint 82 — Programm-Abschluss
- Gesamtregression (tsc, Vitest, Build, Service-Syntax, Secret-Scan), Redaktion des Changelogs, Release-Handoff und Abschlussbericht in `docs/`.

Akzeptanzkriterium je Sprint: TypeScript sauber, volle Vitest-Suite gruen (Ausnahme: bekannter Sandbox-Smoke-Test), Server-Build erfolgreich, keine Secrets im Code, Commit per GitHub-Token auf main gepusht.

## Manuelle Handoff-Punkte (bleiben Nutzeraktionen)

- Android-Publish und APK-Erzeugung über die Publish-Oberfläche anstoßen; das EAS-Buildkontingent ist extern verwaltet und kann aus der Sandbox nicht verbraucht werden.
- APK auf einem echten Android-Gerät installieren und Workspace-Service, Cloud-Key sowie LAN/VPN-Provider-Endpoints testen (kein `127.0.0.1` für Remote-Modelserver).
- Veröffentlichung im Google Play Store gemäß `PLAY_STORE_BEREITSCHAFT.md` prüfen und einreichen.

## Mittel- und langfristige Richtung (nach Sprint 51)

- Betriebserfahrung aus dem Realgerät-Test in die Provider-Routing-Logik zurückfließen lassen (Messwerte, Timeouts, Fallback-Schwellen).
- Strukturierte Healthchecks der PaaS-Betriebspfade (Render/Neon) konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenführen.
- Verschlüsselte Support- und Settings-Backups um die neuen Zustände (Budget, Latenz-Ranking, Snapshots) erweitern, sobald diese persistiert werden.
