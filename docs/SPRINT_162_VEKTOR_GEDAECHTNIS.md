# Sprint 162 — Vektor-Gedaechtnis in Produktion: Drizzle-Tabelle, Store-Adapter und Prompt-Injektion

**Datum:** 19.09.2026 · **Status:** Erledigt · **Tests:** 1127 grün (4 neu) · **Type-Check:** sauber · **Lint:** 0 Errors

## Ziel

Sprint 161 lieferte die Vektor-Gedaechtnis-Logik (`lib/vector-memory-logic.ts`) als reinen,
getesteten Baustein. Dieser Sprint verdrahtet sie produktiv: persistente Tabelle,
Store-Adapter, Best-Practice-Abfrage im Agent-Turn und Vektor-Persistierung beim
Learning-Speichern.

## Umsetzung

### 1) Persistente Tabelle `agentMemoryVectors` (Drizzle)

`drizzle/schema.ts` + generierte Migration `drizzle/0007_sharp_sage.sql`:

- Spalten: `userOpenId`, `source` (agentLearning/autoLearning/posting), `refId` (Rueckreferenz auf die Learning-Id), `text`, `vector` (jsonb), `metadata` (jsonb), `createdAt`.
- Index `(userOpenId, createdAt)` fuer die Nutzer-Abfrage.
- **Bewusst jsonb statt pgvector-Typ:** Die Tabelle laeuft damit auf jedem Postgres/Neon ohne Erweiterung. Sobald der Owner `CREATE EXTENSION vector` aktiviert, kann die Spalte auf `vector(256)` umgestellt und das Ranking in SQL (`<=>`) laufen — der `VectorMemoryStore`-Vertrag bleibt unveraendert (Dokumentation in schema.ts und server/vector-memory-store.ts).
- **Migrationsschulden bereinigt:** drizzle-kit generate zog die in Sprint 160 fehlende `users.designTheme`-Spalte in derselben Migration nach (`ALTER TABLE "users" ADD COLUMN "designTheme" varchar(32)`).

### 2) Store-Adapter (`server/vector-memory-store.ts`)

- `createDbVectorMemoryStore(userOpenId)` bindet den reinen Vertrag an `server/db.ts`:
  - `save()` → `insertAgentMemoryVectorRecord` (Best-Effort, nie blockierend).
  - `query()` → laedt die letzten 200 Kandidaten und rankt anwendungsseitig per `rankBySimilarity` (Kosinus, `<=>`-aequivalent), Top-K gemaess Vertrag.
- `queryUserBestPractices(userOpenId, prompt, topK)` — die V4.0-Abfrage "Agenten fragen vor neuen Aktionen historische Best-Practices ab".
- `persistLearningVector(userOpenId, learning, metadata)` — Learning-Text titelstark einbetten und ablegen.
- Ehrlicher No-DB-Pfad: Ohne `DATABASE_URL` bleibt `query()` leer und `save()` protokolliert nur — der Chat ist unbeeinflusst.

### 3) Verdrahtung in `server/development-chat.ts`

- `loadLearningContext()`: nach den keyword-gerankten Learnings (Sprint 94) zusaetzlich `queryUserBestPractices()`; beide Kontexte werden konkateniert. Die reine Formatierung `formatBestPracticesForContext()` (lib/vector-memory-logic.ts) dedupliziert, kappt auf 200 Zeichen je Snippet, max. 3 Treffer.
- `executeSaveLearningTool()`: nach `insertAgentLearningRecord` wird das Learning parallel als Vektor persistiert (Best-Effort, refId = Learning-Id).
- `storeAutoLearning()`: Auto-Learnings werden ebenfalls als Vektor abgelegt (source: `autoLearning`).

### 4) DB-Zugriff (`server/db.ts`)

- `insertAgentMemoryVectorRecord()`, `listRecentAgentMemoryVectors(userOpenId, limit=200, Deckel 1000)` — analog zum agentLearnings-Muster, mit ehrlichen Fehlerzustaenden.

## Verifikation

- `npm run verify:system`: **[STATUS: GREEN]**, 1127/1127 Tests gruen, 10 Kernmodule vorhanden (Store-Adapter neu aufgenommen).
- `tsc --noEmit` sauber; ESLint 0 Errors in allen geaenderten Dateien.
- Neue Tests: `formatBestPracticesForContext` (Dedupe, Kappung, Limit, Leerfall) in `tests/vector-memory-logic.test.ts`.
- Keine Sandbox-DB im aktuellen Workspace: E2E gegen Neon bleibt dem naechsten Deploy vorbehalten (Adapter folgt dem bewaehrten Best-Effort-Muster wie chat-quota/backup-manifest).

## Offene Punkte

- **Owner (Neon):** Migration `0007` anwenden (`npm run db:push`) und optional `CREATE EXTENSION vector` aktivieren.
- **Sprint 163:** `repo.searchCode` als Agent-Tool (Repo-Chat-Anbindung) + optionale Umbettung auf echte Embedding-API.
