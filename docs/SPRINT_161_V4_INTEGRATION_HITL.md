# Sprint 161 — V4.0-Integration: HITL-Guard in Produktion, Vector Memory, Repo Chat, Multi-PSP-Fallback & System-Verify

**Datum:** 19.09.2026 · **Status:** Erledigt · **Tests:** 1123 grün (56 neu) · **Type-Check:** sauber · **Lint:** 0 Errors

## Ziel

Der Master-Prompt V4.0 fordert vier fehlende Kernkomponenten. Dieser Sprint schliesst sie
im etablierten Muster (reine, testbare Logik in `lib/`, Verdrahtung in `server/`, CI-faehige
Tests in `tests/`) — ohne neue externe Konten, Keys oder Secrets:

| V4.0-Komponente | Umsetzung | Integrationstiefe |
|---|---|---|
| HITL-Guardrail (`hitlGuard`) | `lib/hitl-guard-logic.ts` | **Produktiv verdrahtet** in `server/orchestrator/tool-registry.ts` (zweite Safety-Schicht nach der Allowlist) |
| Vector Memory (`vectorStore`/`agentMemoryEngine`) | `lib/vector-memory-logic.ts` | Logik fertig; Speicher-Vertrag (`VectorMemoryStore`) bereit fuer Neon-Pgvector-Adapter (Sprint 162) |
| Repo Chat (`repoChatEngine`) | `lib/repo-chat-logic.ts` | Logik fertig (Symbol-Index mit Pfad:Zeile); Agent-Tool-Anbindung als Folgeschritt |
| Payment-Fallback (`paymentFallback`) | `lib/payment-fallback-logic.ts` | Logik fertig (Stripe → LemonSqueezy → Paddle); PSP-Keys sind Owner-Handoff |
| Resilienz-/Banner-Verifikation | `scripts/system-verify.ts` + `npm run verify:system` | Produktiv: ein Befehl, der tsc + volle Suite + Modul-Präsenz prueft und das GREEN-Banner ausgibt |

## 1) HITL-Guard (Abschnitt 5 des Master-Prompts)

`lib/hitl-guard-logic.ts` bewertet jede geplante Aktion und entscheidet zwischen
`AUTO_APPROVED` und `OPERATOR_CONFIRM_REQUIRED`:

- **Regel 1:** Transaktionen / Ad-Budget / Auszahlungen > 50,00 EUR → Operator.
- **Regel 2:** Destruktive SQL-Befehle (DROP, TRUNCATE, ALTER, GRANT/REVOKE, DELETE ohne ID-Constraint) → Operator.
- **Regel 3:** Server-Reboots, SSH-Key-Aenderungen, System-Flashes, kritische Shell-Kommandos (sudo, shutdown, mkfs, dd, killall, fastboot flash, …) → Operator.
- **Regel 4:** Massen-E-Mails an > 500 Empfaenger → Operator.
- **HARA-Auto-Approve:** ROI_Score > 90 UND Kosten exakt 0,00 EUR UND RiskLevel LOW → vollautonome Freigabe.

**Verdrahtung:** `executeTool()` im Orchestrator ruft `evaluateHITLRisk(tool.name, args)` nach
der Registry-Allowlist auf. Bei `OPERATOR_CONFIRM_REQUIRED` ohne dokumentierte Operator-
Bestaetigung (`confirm: true`) blockiert der Aufruf strukturiert — der Superagent sieht den
Grund und kann Selbstkorrektur betreiben. Tools mit `requiresConfirmation` (reboot, restart)
bleiben unveraendert doppelt gesichert.

## 2) Vector Memory (pgvector-faehig)

`lib/vector-memory-logic.ts` liefert die Aehnlichkeits-Grundlage fuer das Langzeit-Gedaechtnis:

- `cosineSimilarity()` — identische Mathematik wie Pgvector `<=>`.
- `deterministicLocalEmbedding()` — deterministische Hash-Trigramm-Einbettung (256-dim, L2-normalisiert) als Offline-Fallback, solange kein Embedding-Provider konfiguriert ist.
- `VectorMemoryStore` — injizierbarer Speicher-Vertrag; `createInMemoryVectorMemoryStore()` fuer Tests/Sandbox, derselbe Vertrag laesst sich gegen Neon-Pgvector (Drizzle, `vector(256)`-Spalte) implementieren.
- `bestPracticesFor()` — die V4.0-Abfrage "Agenten fragen vor neuen Aktionen historische Best-Practices ab".

**Offen (Sprint 162):** Drizzle-Migration mit `CREATE EXTENSION vector`, Pgvector-Store-Adapter im Server und Anbindung an die bestehende `agentLearnings`-Retrieval-Kette.

## 3) Repo Chat (AST-lite)

`lib/repo-chat-logic.ts` indexiert Projektdateien (exkl. `node_modules`, `.git`, `dist`, …)
und beantwortet Code-Fragen mit **Dateipfad und Zeilennummer**:

- `extractSymbols()` — zeilengenaue Erkennung von function/class/interface/type/const-Deklarationen (inkl. `export`/`async`/Generator-Funktionen).
- `answerCodeQuery()` — Ranking exakt > Praefix > Teilstring plus Pfad-Treffer; deterministisch sortiert.
- Der Verzeichnis-Reader wird injiziert (kein fs-Import in der Logik) — Server kann jeden Root (Workspace-Sandbox, Git-Checkout) indexieren.

**Offen:** Anbindung als Agent-Tool (z. B. `repo.searchCode`) in der Tool-Registry + Server-Route.

## 4) Multi-PSP Payment-Fallback

`lib/payment-fallback-logic.ts` — Stripe → LemonSqueezy → Paddle mit:

- Webhook-Timeout-Failover (`PAYMENT_WEBHOOK_TIMEOUT_MS`, Default 30 s).
- `shouldFailoverOnProviderError()`: 5xx/402/429/404 → sofortiger Wechsel; klare 4xx Client-Fehler → kein Blind-Retry (gleiche Philosophie wie key-rotation-logic).
- Ehrliche Nicht-Konfiguriert-Zustaende: nicht konfigurierte PSPs werden uebersprungen; bleibt keiner uebrig, liefert die Kaskade `null` statt einem Fake-Fallback.

**Offen:** PSP-Keys (LemonSqueezy/Paddle) sind Owner-Handoff; danach Verdrahtung in billing-router.

## 5) System-Verify (Abschluss-Garantie)

`npm run verify:system` (`scripts/system-verify.ts`) fuehrt sequenziell aus:

1. `tsc --noEmit`
2. Volle Vitest-Suite (aktuell 1123 Tests)
3. Präsenz der 9 V4.0-Kernmodule (HITL, Key-Rotation, Managed-LLM-Fallback, Vector Memory, Repo Chat, PSP-Fallback, MCP-Client, Tool-Registry, Self-Healing)

Nur wenn alles gruen ist, erscheint das exakte Status-Banner und der Prozess endet mit
Exit 0; sonst `STATUS: RED` mit Exit 1 — maschinell auswertbar fuer CI und den Master-Superagenten.

## Verifikation

- `npm run verify:system` → **[STATUS: GREEN] CYBERSARAH CONTROL CENTER V4.0 FULLY OPERATIONAL**
- 1123/1123 Tests gruen (davon 56 neu: 19 HITL, 11 Vector Memory, 14 Repo Chat, 12 Payment-Fallback)
- `tsc --noEmit` sauber; ESLint 0 Errors in den neuen Dateien
- Keine neuen Secrets, keine neuen externen Konten

## Offene Punkte (Folgesprints / Owner-Handoffs)

- **Sprint 162:** Pgvector-Store-Adapter + Migration + Anbindung an `agentLearnings`.
- **Sprint 163:** `repo.searchCode` als Agent-Tool + Server-Route fuer den Repo-Chat.
- **Owner:** PSP-Keys fuer LemonSqueezy/Paddle hinterlegen, dann Verdrahtung in den Billing-Flow.
- **Owner:** Android-Gerätetest (todo.md) und Play-Store-Einreichung bleiben unverändert offen.
