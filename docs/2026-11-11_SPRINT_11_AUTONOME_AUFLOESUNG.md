# Sprint 11 — Autonome Abschluesse statt Endlos-Wartezustaende

**Datum:** 11.11.2026
**Mission:** Betriebsfaehigkeit der bestehenden Publishing-Governance (Nachtrag zu den Sprints 1-10)
**Status:** Implementiert, getestet, dokumentiert.

## 1. Ausgangslage

Zwei Zustaende blockierten den Betrieb sichtbar:

1. **Versandpruefung:** Jobs mit Status `versand_ungeklaert` (in der App als
   „#13 · X · juno" und „#16 · X · juno", 7 Tage offen, `KRITISCH`) warteten
   ausschliesslich auf einen Menschen. Ohne manuelle Pruefung und ohne
   schriftliche Pruefgrundlage blieb der Knopf „Verbindlich abschliessen" grau —
   der Vorgang damit unbegrenzt offen, obwohl der Beitrag womoeglich laengst
   existierte.
2. **Draft-Engine:** Der interaktive Lauf („Autonome Engine erzeugt fehlende
   Entwuerfe …") hatte kein Zeitlimit. Mehrere LLM-Aufrufe hintereinander
   konnten die Karte minutenlang im Ladezustand halten — ohne Ergebnis, ohne
   Fehler, ohne Abbruch.

Beides ist derselbe Fehler in zwei Gewaendern: eine Autonomie, die auf einen
Menschen wartet, aber nicht sagt, worauf.

## 2. Reine Logik — `lib/publishing-auto-resolution-logic.ts`

`decideUncertainResolution` leitet aus einer **echten, rein lesenden**
Plattformpruefung genau eine Entscheidung ab:

| Pruefergebnis | Entscheidung | Bedingung |
|---|---|---|
| `found` | `confirm` | gueltige Beitrags-ID (keine URL, kein Platzhalter) |
| `not_found` | `close` | Frist 72 h seit Versand abgelaufen |
| `not_found` | `wait` | Frist laeuft noch |
| `unverifiable` | `escalate` | Mensch bleibt zustaendig |
| keine Pruefung | `escalate` | nie ohne Nachweis entscheiden |

Harte Regeln, die die Logik erzwingt:

- **Kein Blind-Schliessen:** ohne Pruefung wird nichts geschlossen, auch nicht
  nach 30 Tagen.
- **Pruefung muss juenger sein als der Versand:** `checkedAtMs < updatedAtMs`
  ergibt `wait` — eine alte Pruefung beweist nichts ueber einen neuen Versuch.
- **Mindestwartezeit:** 10 Minuten nach dem Absenden ist eine Pruefung wertlos,
  weil Provider Zeit brauchen, bis ein Beitrag sichtbar ist.
- **Ablauf des Nachweises:** Pruefungen aelter als 6 Stunden werden nicht
  verwendet, sondern erneut angefordert.
- **Fund ohne ID ist kein Fund:** `validManualReviewReceipt` filtert
  `unknown`, `ig-…`-Platzhalter und URLs aus.

`matchPostByText` vergleicht den gesendeten Text mit den zuletzt gelesenen
Beitraegen (normalisiert: Kleinschreibung, Umlaute, Links, Satzzeichen) und
ordnet Texte unter 24 Zeichen **nie** zu — ein falscher Treffer waere schlimmer
als „nicht gefunden".

## 3. Schreibgeschuetzte Plattformpruefung — `server/publishing-auto-resolution.ts`

`verifyPublishingOnPlatform` nutzt ausschliesslich Lesepfade:

| Plattform | Lesepfad |
|---|---|
| Bluesky | `public.api.bsky.app` `com.atproto.repo.listRecords` (oeffentlich, ohne Token) |
| X | `GET /2/users/me` → `GET /2/users/{id}/tweets` |
| Threads | `GET /{user-id}/threads?fields=id,text,timestamp` |
| Instagram | `GET /{ig-user-id}/media?fields=id,caption,timestamp` |
| LinkedIn | `GET /v2/ugcPosts?q=authors&authors=List(urn)` |
| TikTok | kein Lesezugriff → ehrlich `unverifiable` |

Jeder HTTP-Fehler, jede fehlende Zugangsdaten und jeder Timeout (12 s) ergibt
`unverifiable` — **nie** `not_found`. Ein Netzwerkfehler beweist nichts.

Damit das ueberhaupt moeglich ist, haelt `server/publishing-service.ts` den
tatsaechlich gesendeten Text jetzt **vor** dem Versand am Job fest
(`content_override`). Ohne diesen Text gibt es keinen Abgleich und die Pruefung
meldet das offen.

`resolveUncertainPublishing` verarbeitet bis zu 25 Jobs je Lauf, schreibt bei
`confirm`/`close` einen Eintrag in die `publishing_review_events` mit
`actor_open_id = "auto-verifier"` und der konkreten Pruefgrundlage. Bei
`escalate` wird nur `last_error` ergaenzt — `updated_at` bleibt der
Versandzeitpunkt, damit das Alter des Vorgangs nicht verfaelscht wird.

## 4. Draft-Engine mit Zeitbudget — `server/draft-engine.ts`

- `budgetMs` als Parameter, Standard **90 s** (`DRAFT_ENGINE_DEFAULT_BUDGET_MS`).
- Interaktiver Lauf ueber `draftEngine.runNow`: **25 s**
  (`DRAFT_ENGINE_RUN_NOW_BUDGET_MS`).
- Ergebnis enthaelt `truncated` und `elapsedMs`; bei Budgetende wird ein
  `skipped`-Eintrag mit Klartextgrund geschrieben. Die fehlenden Entwuerfe
  kommen im naechsten Lauf, es wird nichts erfunden.

## 5. Betrieb und Oberflaeche

- Neuer Endpunkt `POST /api/cron/publishing-resolution` (Token `METRICS_TOKEN`,
  wie die uebrigen Ops-Endpunkte).
- Neuer Workflow `.github/workflows/publishing-resolution.yml`, stuendlich zur
  Minute 23. Gibt nur aggregierte Zahlen aus, keine Job- oder Personadaten.
- Admin-Karte „Versandpruefung": der graue Bestaetigungsknopf nennt jetzt seine
  fehlenden Bedingungen („Noch offen: Pruefgrundlage mit mindestens 16 Zeichen ·
  bestaetigte Haekchen-Zeile"). Der Hinweistext beschreibt den automatischen
  Ablauf und die 72-Stunden-Frist.
- Karte „Autonome Entwuerfe": Ladehinweis nennt das Zeitbudget, nach dem Lauf
  erscheint ein Bericht („Neu erzeugt: … / Kein neuer Entwurf erzeugt. Grund: …
  / Zeitbudget erreicht").

## 6. Ehrlichkeitsgrenzen

- TikTok bleibt beim Menschen: die Content-Posting-API bietet keinen Lesepfad.
- Ohne gespeicherten Sendetext ist keine Zuordnung moeglich; die Pruefung meldet
  das, statt zu raten.
- Der `close`-Pfad behauptet nicht, dass nichts veroeffentlicht wurde. Er
  schliesst den Vorgang ohne Neuversand und dokumentiert, dass nach der Frist
  kein passender Beitrag gefunden wurde.
- Kein Neuversand, kein automatisches Posten, keine neue Abhaengigkeit.

## 7. Tests

- `tests/publishing-auto-resolution.test.ts` — 19 Tests: Entscheidungsmatrix,
  Fristen, Nachweisalter, Textabgleich, Lesepfade mit nachgebildetem `fetch`,
  Fehlerfaelle (`503` → `unverifiable`).
- `tests/draft-engine-budget.test.ts` — 4 Tests: Budgetabbruch mit Teilbericht,
  fehlende DB, Konstanten, LLM-Fehler als uebersprungene Art (nachgebildete DB,
  kein Netzwerk).
