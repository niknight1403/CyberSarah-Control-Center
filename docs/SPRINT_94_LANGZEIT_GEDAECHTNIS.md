# Sprint 94 — Langzeit-Gedächtnis des Master-Agenten & Guardrail-Schärfung

**Status:** Erledigt (14.09.2026) · **Version:** v1.3.6 · **CI:** `validate` grün

## Ziel

Die Produktvision definiert vier Agenten-Komponenten: LLM-Routing (Dispatcher),
Identität (System Guardrails), Werkzeuge (MCP-Hub & APIs) und Gedächtnis
(State & Long-term Memory) plus eine Generative-UI-Schicht. Sprint 94 schließt
den größten Baustein-Gap: das **Langzeit-Gedächtnis** — und schärft die
Guardrails auf das vollständige Werkzeug-Set.

## Baustein-Bilanz (Stand nach Sprint 94)

| Komponente | Stand | Verortung |
|---|---|---|
| LLM-Routing | ✅ komplett (Sprint 78/86 + Ausbau) | `lib/model-router-logic.ts`, `server/development-chat.ts` — Groq/OpenRouter/OpenAI/Gemini/Together/Anthropic/HuggingFace + lokale Provider, Prompt-Klassifikation (code/reasoning/ui/chat), Health-Tracking mit Cooldown, Capability-Scores, Auto-Routing |
| Identität | ✅ komplett (Sprint 94 geschärft) | `buildAgentSystemPrompt` — Rollendefinition, alle 6 Business-Tools, explizite operationelle Grenzen (Nur-Lese-Business-Tools, keine destruktiven Git-Operationen), Erfindungsverbot, save_learning-Pflicht nach Fixes |
| Werkzeuge | ✅ komplett (Sprints 79–93) | 7 Repo-/Git-Tools über Workspace-Service, 6 Nur-Lese-Business-Tools (Stripe, Binance/Kraken, GA4, HubSpot, TikTok/Instagram, KI-Dienste), `save_learning` |
| Gedächtnis | ✅ komplett (Sprint 94) | Kurzzeit: `chatMessages` pro Session (Sprint 54). Langzeit: `agentLearnings` + Retrieval + Auto-Learning (Sprint 94) |
| Generative UI | ✅ komplett (Sprints 74–93) | Design-System mit drei Themes, responsive Sidebar, Dashboard-Kacheln (Revenue/Krypto/GA4/CRM/Content), Diff-Viewer (`components/chat/diff-viewer.tsx`), Studio-UI, Admin-Dashboard |

## Was gebaut wurde (Sprint 94)

### Langzeit-Gedächtnis (`lib/agent-memory-logic.ts` + `server/db.ts`)

- **DB-Schicht:** Neue Tabelle `agentLearnings` (Migration
  `drizzle/0004_woozy_ultimatum.sql`, wird beim Render-Deploy via
  `--migrate` automatisch angewendet): Nutzer-Scope, Art
  (`build-optimierung`/`fehlerbehebung`/`interaktion`/`entscheidung`),
  Titel, Detail, kommagetrennte Keywords, Session-Bezug, Zeitstempel —
  Index auf (`userOpenId`, `createdAt`).
- **Reine Logik (`lib/agent-memory-logic.ts`):**
  - `classifyLearningKind` — Art-Erkennung mit Priorität
    Fehlerbehebung > Build-Optimierung > Entscheidung.
  - `extractLearningKeywords` — Signifikanz-Extraktion (deutsch/englische
    Stopwörter, Deduplizierung, Kappe bei 8 Begriffen).
  - `buildLearningRecord` — Normalisierung mit Feld-Kappung
    (Titel 160 / Detail 900 Zeichen) gegen Modellausbrüche.
  - `learningRelevanceScore` — Ranking: Schüsselwort-Treffer ×2,
    Fehlerbehebungs-Bonus +1; Kurz-Begriffe (npm, apk, aab) matchen
    zusätzlich direkt auf den Rohtext (Falle der 4-Zeichen-Schwelle).
  - `selectRelevantLearnings` — Top-3 über Mindest-Relevanz 2.
  - `formatLearningsForContext` — kompaktes Prompt-Snippet, leer bei
    irrelevanter Geschichte (Prompt-Hygiene).
  - `turnDeservesLearning` + `deriveLearningFromTurn` — Auto-Learning-
    Auslöser und Verdichtung werkzeuglastiger Turns.
- **Server-Wiring (`server/development-chat.ts`):**
  - Vor jedem Agent-Turn: Top-Learnings werden gegen die aktuelle
    Nutzeranfrage gerankt und an den System-Prompt angehängt
    (Best-Effort — DB-Ausfall ändert den Prompt nicht).
  - **Neues Agent-Tool `save_learning`:** Der Agent speichert
    Erkenntnisse (Fixes, Konventionen, Präferenzen) selbst — Validierung,
    Klassifikation und Kappung serverseitig.
  - **Auto-Learning:** Turns mit `write_repo_file`/`commit_changes`/
    `push_changes` landen verdichtet automatisch im Gedächtnis
    (Best-Effort, nie blockierend).
  - `userOpenId` wird vom tRPC-Router durch `handleDevelopmentChat` bis in
    den Tool-Loop gereicht — Gedächtnis ist strikt nutzerbezogen.

### Guardrail-Schärfung (`lib/dev-agent-tools-logic.ts`)

- System-Prompt listet jetzt **alle sechs Business-Tools** mit ihren
  Quellen (statt drei) plus `save_learning`.
- Neue explizite Grenz-Regel: Business-Tools sind Nur-Lese; es existiert
  kein Werkzeug für destruktive/fremde Systemeingriffe — nichts wird
  simuliert.
- Neue Pflicht: Kern-Erkenntnisse abgeschlossener Fehlerbehebungen und
  Konventionen werden via `save_learning` persistiert.

## Tests

- 633 Tests grün (+8 neu): Klassifikation mit Prioritäten, Keyword-
  Extraktion (Stopwörter, Dedup, Kappung), Record-Normalisierung,
  Relevanz-Ranking inkl. Kurz-Begriff-Falle, Auswahl-Quorum,
  Learning-Würdigkeit von Turns, Auto-Learning-Ableitung,
  Prompt-Snippet-Formatierung.
- Akzeptanz: `npm run check` sauber, `npm run test:coverage` grün
  (Lines 50,06 %), `npm run build` erfolgreich.

## Betrieb

- Migration 0004 wird beim nächsten Render-Deploy automatisch
  angewendet (`render-deploy.mjs --migrate`) — kein manueller Schritt nötig.
- Das Gedächtnis wächst nur bei authentifizierten Agent-Turns;
  Speicherfehler werden geloggt und brechen keinen Chat-Turn.

## Nächste Schritte

1. Dependabot-PRs (sicher) mergen; Major-Sprünge bleiben eigene Sprints.
2. APK-Build v1.3.6 über `build-apk.yml` mit Gedächtnis-Features.
3. Langfristig: Learning-Retrievable prüfen, sobald echte Nutzungsdaten
   anfallen (Rückmeldung der Relevanz-Scores in die Ops-Logs).
