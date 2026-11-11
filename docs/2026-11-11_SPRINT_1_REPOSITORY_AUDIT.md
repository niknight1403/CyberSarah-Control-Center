# Sprint 1 — Vollständiger Repository-Audit und Capability-Matrix

**Datum:** 11.11.2026
**Basis:** Commit `37f5d88` (`main`), Master-Prompt „CyberSarah Autonomous AI Company OS"
**Prüfbasis dieses Laufs:** `npm ci`, `npm run check`, `npx vitest run`, `npm run build` — alle ausgeführt am 11.11.2026.

## 1. Ausgangslage (gemessen, nicht geschätzt)

| Kennzahl | Wert |
|---|---|
| Version (package.json) | `3.1.1` |
| Verfolgte Dateien | 2.381 |
| Servermodule (`server/*.ts`) | 145 |
| Logikmodule (`lib/`) | 440 |
| tRPC-Router (in `server/routers.ts` registriert) | 51 |
| Datenbanktabellen (`drizzle/schema.ts`) | 34 |
| SQL-Migrationen | 30 (`0000`–`0029`) |
| GitHub-Workflows | 66 |
| Testdateien / Tests | 476 / 3.863 (Baseline vor Sprint 2: 474 / 3.807) |
| TypeScript | sauber (`tsc --noEmit`) |
| Server-Build | erfolgreich (`dist/index.js`, 1,6 MB) |

## 2. Methode

Jede Zeile der Matrix wurde gegen den Code geprüft, nicht gegen die Dokumentation.
Die Spalten trennen strikt:

- **Dokumentiert** — es gibt eine Doku/Aussage im Repo.
- **Implementiert** — Code existiert und wird gebaut.
- **Erreichbar** — über Router/UI/Workflow tatsächlich aufrufbar.
- **Getestet** — automatisierte Tests decken den Pfad ab.
- **Produktiv verifiziert** — in diesem Lauf gegen das laufende System geprüft (Render, Neon, Stripe, HubSpot).

Der letzte Punkt ist bewusst fast überall „nein": Ohne Live-Zugangsdaten wäre jede
andere Aussage eine Behauptung. Was hier „nein" steht, ist damit **nicht** als kaputt
markiert, sondern als *nicht in diesem Lauf nachgewiesen*.

## 3. Capability-Matrix

| Fähigkeit | Dokumentiert | Implementiert | Erreichbar | Getestet | Produktiv verifiziert | Hauptlücke |
|---|---|---|---|---|---|---|
| Expo-Web-App + Capacitor-Android | ja | ja | ja | ja (Smoke-Workflow) | nein | kein Gerätetest in diesem Lauf |
| Design-System „Future Glass" (Tokens) | ja | ja | ja | ja | nein | — |
| tRPC-API (51 Router) | ja | ja | ja | ja | nein | — |
| Auth / RBAC (Admin, Elite) | ja | ja | ja | ja | nein | — |
| Multi-Provider-LLM-Routing + Key-Pools | ja | ja | ja | ja | nein | Live-Provider-Quota nicht geprüft |
| Chat-Master-Agent + Werkzeug-Registry | ja | ja | ja | ja | nein | — |
| Langzeit-Gedächtnis (`agentLearnings`, Vektoren, Konsolidierung) | ja | ja | ja | ja | nein | — |
| Superagenten-Verwaltung (`agents`-Router) | ja | ja | ja | ja | nein | Laufzeit startet keinen neuen Agenten (bewusst) |
| Agenten-Team-Orchestrierung (`server/orchestrator/*`) | ja | ja | ja | ja | nein | keine dynamische Team-Komposition aus Aufgabe |
| Agent Factory (natürlichsprachliche Agentenerstellung) | ja | teilweise | nein | ja (Logik) | nein | **fehlt: Prompt→Agent-Pipeline** |
| Skill-Registry | ja | ja | ja | ja | nein | — |
| Workflow-/Scheduler-Logik | ja | ja | teilweise | ja | nein | kein zentraler Scheduler, nur GitHub-Cron je Lauf |
| Autopilot-Katalog (11 Läufe) | ja | ja | ja | ja (Wiring-Test) | nein | **kein zentraler Manager mit Kill-Switch** |
| MCP-Registry (Tool-Matching, Rechte) | ja | ja | ja | ja | nein | — |
| MCP-Transport (Streamable HTTP) | ja | ja | ja | ja | nein | — |
| MCP-Sitzungs-Cache | ja | ja | ja | ja | nein | prozesslokal, eine Sitzung je URL |
| **Multi-MCP-Server-Verwaltung** | ja (neu) | **ja (Sprint 2)** | ja (`mcp.servers.*`) | ja (56 neue Tests) | nein | SSE-Transport nicht angebunden |
| MCP-Discovery-Autopilot | nein | **nein** | nein | nein | nein | Sprint 7 |
| Plugin-Manifest/-Factory | nein | nein | nur Statusseite | nein | nein | Sprint 3 |
| CRM (HubSpot-Lesen/Schreiben) | ja | ja | ja | ja | nein | Live-Roundtrip nicht geprüft |
| Stripe (Abo, Webhooks, Testmodus-E2E) | ja | ja | ja | ja | nein | Live-Zahlung nicht ausgelöst |
| Digistore24 (IPN, Ledger) | ja | ja | ja | ja | nein | — |
| Publishing-Pipeline + HITL-Freigabe | ja | ja | ja | ja | nein | — |
| Content-/Medien-Pipeline | ja | ja | ja | ja | nein | keine Videogenerierung |
| Revenue-OS / Growth-Loops | ja | ja | ja | ja | nein | Umsatzwirkung unbelegt |
| Memory-Konsolidierung (Cron) | ja | ja | ja | ja | nein | — |
| Self-Healing (Crash-Reports) | ja | ja | ja | ja | nein | kein automatischer Reparaturlauf |
| Security: Gitleaks, Rate-Limits, Guardrails | ja | ja | ja | ja | nein | — |
| Audit-Log / Telemetrie (`agent_executions`) | ja | ja | ja | ja | nein | — |
| Admin-Oberfläche | ja | ja | ja | teilweise | nein | **kein UI für MCP-/Plugin-/Agent-Factory** |
| Android-APK-Pipeline | ja | ja | ja (Workflow) | ja | nein | letzter Build nicht in diesem Lauf |

## 4. Priorisierter Gap-Report

**P0 — blockiert die Abschlussdefinition des Master-Prompts**

1. **Multi-MCP-Server-Verwaltung** → in Sprint 2 umgesetzt (Registry, Rechte, Health, Routing, Tool-Cache).
2. **Zentraler Autopilot-Manager** mit Registry, Pause/Resume und Kill-Switch. Heute existieren 11 Einzelläufe mit je eigenem Cron; ein „Alles anhalten" ist nur durch Deaktivieren vieler Workflows möglich.
3. **Agent Factory** als Prompt→Agent-Pipeline (Identität, Systemprompt, Tools, MCP-Bindungen, Budget, Testfälle). Heute gibt es nur `project-superagent-factory` für Projekt-Superagenten.

**P1 — Fähigkeiten, die im Prompt gefordert und im Repo nicht vorhanden sind**

4. **Plugin-Manifest-System** (Manifest, Version, Healthcheck, Rollback). Der Plugins-Tab zeigt nur drei Statuszeilen.
5. **MCP-/Plugin-Discovery-Autopilot** (GitHub, npm, Anbieter-Kataloge) mit Bewertung statt blinder Installation.
6. **Admin-UI** für MCP Server Manager, Agent Factory, Capability Radar, Approval Center.

**P2 — Härtung bestehender Systeme**

7. SSE-Transport für MCP (aktuell ehrlich abgelehnt).
8. Persistente MCP-Sitzungen über Prozess-Neustarts (heute prozesslokal).
9. Live-Nachweise: Render-Healthcheck, Stripe-Live-Test, HubSpot-Roundtrip in diesem Audit nicht ausgeführt.

## 5. Wiederverwendung statt Neuarchitektur (verbindlich)

Der Audit bestätigt die Vorgabe aus Abschnitt 1 des Master-Prompts: Für nahezu jede
geplante Fähigkeit existiert bereits eine Komponente. Sprint 2 nutzt deshalb:

- `lib/mcp-registry-logic.ts` (Berechtigungen, SSRF-Prüfung) — unverändert,
- `lib/mcp-transport-logic.ts` (Endpunkt-Bau, Verhandlung) — unverändert,
- `lib/mcp-client-logic.ts` (JSON-RPC, Discovery) — unverändert,
- `lib/mcp-session-logic.ts` (Sitzungs-Cache, 404-Erneuerung) — unverändert,
- `server/_core/tool-proxy-queue.ts` (Concurrency, Retry) — für Probe und Aufruf,
- `adminProcedure` (RBAC) — für alle neuen Prozeduren.

Neu gebaut wurde nur, was nachweislich fehlte: Registry-Persistenz, Health-Bewertung,
Multi-Server-Routing und die Admin-Schnittstelle.

## 6. Reproduzierbare Prüfbefehle

```bash
npm ci
npm run check          # tsc --noEmit
npx vitest run         # 476 Dateien / 3.863 Tests
npm run build          # dist/index.js
npm run web:smoke      # Web-Export-Smoke
npm run verify:system  # System-Verifikation
```

`npm run lint`, `gitleaks` und die Android-Pipeline laufen in der CI; sie sind Teil der
Abnahme von Sprint 2 (siehe Sprint-Dokument).
