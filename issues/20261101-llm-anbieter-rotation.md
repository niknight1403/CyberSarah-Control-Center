# Vorfall: Free-LLM-Rotation haengt an einem einzigen Anbieter

**Ursache:** Von sechs konfigurierbaren Free-Tier-Anbietern ist am 01.11.2026
nur noch Groq zuverlaessig erreichbar. Der Gemini-Hauptkey antwortet
intermittierend mit HTTP 500, der Backup-Key wird von Google abgelehnt, der
OpenRouter-Key haengt dauerhaft im Tageslimit, Cerebras und Mistral sind gar
nicht erst als Secret hinterlegt. Der Key-Changer rotiert formal weiter, hat
aber faktisch keine Ausweichoption mehr.

## Details

Grundlage ist der Lauf `Free-LLM Key-Changer` vom 01.11.2026, 15:43 UTC
(Run 41322669923) sowie die 14 letzten Status-Commits der Datei
`tools/free-llm-changer/changer-status.json`.

| Anbieter | Befund 15:43 UTC | Verlauf |
|---|---|---|
| `gemini` | `NICHT KONFIGURIERT/ERREICHBAR (500 gemma-4-31b-it)` | kippt im Stundentakt zwischen 200 und 500 (30.10. 06:11 und 13:18 rot, 31.10. 14:39 rot, 01.11. 15:43 rot, dazwischen jeweils gruen) |
| `gemini-backup` | `KEY UNGUELTIG` | in allen geprueften Laeufen ungueltig, Secret existiert (`GEMINI_BACKUP_KEY`) |
| `groq` | `VERFUEGBAR (qwen/qwen3.8-27b)` | einziger stabiler Anbieter, Modell live mit HTTP 200 bestaetigt |
| `openrouter` | `LIMIT ERREICHT (429 nvidia/nemotron-3.5-super-vl:free)` | in 10 von 12 geprueften Laeufen 429 |
| `cerebras` | `NICHT KONFIGURIERT/ERREICHBAR (FEHLT)` | Secret `CEREBRAS_API_KEY` nicht gesetzt |
| `mistral` | `NICHT KONFIGURIERT/ERREICHBAR (FEHLT)` | Secret `MISTRAL_API_KEY` nicht gesetzt |
| `ollama` | `NICHT KONFIGURIERT/ERREICHBAR (000)` | im Runner nie erreichbar, nur lokaler Never-Fail-Fallback |

Zusatzbefund zur Wirkung: `changer-status.json` ist ein reiner Statusbericht.
Die Laufzeit liest ihn nicht. `server/_core/llm.ts` bezieht die Provider aus
ENV (`AI_GEMINI_API_KEY`/`GEMINI_API_KEY`, `GROQ_API_KEY` …), die
Modell-Defaults stehen fest in `lib/managed-model-logic.ts`. Die echte
`aktive-anbindung.env` ist gitignored und verlaesst den Runner nie. Eine
Rotation im Changer aendert am Live-Verhalten also nichts, solange die
ENV-Seite auf Render nicht mitgezogen wird.

## Behoben in diesem Branch

1. **Groq-Modell-Drift:** `GROQ_MODEL_CANDIDATES` fuehrte `openai/gpt-oss-20b`
   als Erstkandidat, obwohl live `qwen/qwen3.8-27b` bestaetigt ist. Der
   bestaetigte Eintrag fuehrt jetzt, gpt-oss bleibt als Fallback. Der Default
   in `resolveManagedModel` kommt aus der Liste statt aus einem zweiten Literal.
2. **Statusbericht-Parsing:** Der Changer schrieb das komplette Detail in das
   Feld `modell` (`"500 gemma-4-31b-it"`). Status, `http_status`, `modell`,
   `detail` und `hinweis` sind jetzt getrennte Felder.
3. **Broken-Pipe-Abbruchstelle:** Bei grossen Modelllisten (OpenRouter, ~750 KB)
   brach `printf` in `probe_chat` mit `write error: Broken pipe` ab, was unter
   `set -euo pipefail` eine latente Abbruchstelle war. Die Pruefung laeuft jetzt
   ohne Pipe.

## Offene Massnahmen (Eigentuemer)

1. `GEMINI_BACKUP_KEY` in den Repository-Secrets durch einen neuen, gueltigen
   Google-AI-Studio-Key ersetzen.
2. Den 500er auf `gemini` beobachten: kein Key-Problem, sondern Provider- oder
   modellseitig. Wenn er haeufiger auftritt, `AI_GEMINI_MODEL` explizit setzen
   und gegen die Live-Modellliste pruefen.
3. `OPENROUTER_API_KEY` pruefen, ob eigenes Guthaben oder Tageslimit
   (`:free`-Kontingent) die Ursache fuer die 429er ist.
4. Optional `CEREBRAS_API_KEY` und `MISTRAL_API_KEY` hinterlegen, um die
   Rotation wieder auf mehr als einen Anbieter zu stuetzen.
5. Entscheiden, ob die Rotation die Laufzeit erreichen soll. Wenn ja, braucht
   es einen Weg, den aktiven Anbieter nach Render zu bringen (Render-ENV-Update
   per API oder Deploy-Hook). Solange das fehlt, ist Groq der einzige Traeger
   der kostenlosen KI-Kette.

## Weiteres Vorgehen

- Fix liegt auf dem Branch `fix/llm-rotation-integrity-20261101`.
- Der Vorfall bleibt offen, bis mindestens ein zweiter Anbieter wieder
  zuverlaessig `VERFUEGBAR` meldet.

## Nachtrag 01.11.2026, 18:30 — Live-Gegenprobe

Nach dem Merge von PR #176 wurde `provider-smoke-test.yml` per
`workflow_dispatch` auf `main` gestartet (Lauf `41331595127`, Commit `a4f5b52`):

```
Groq:        PASS HTTP 200 (0,17 s)   -> qwen/qwen3.8-27b, wie in PR #176 gesetzt
Gemini:      FAIL HTTP 503 (18,64 s)  -> Dienst nicht verfuegbar, kein Key-Fehler
OpenRouter:  FAIL HTTP 429 (0,63 s)   -> weiterhin im Rate-Limit
```

Damit ist die Korrektur am Modellnamen live bestaetigt: Groq antwortet mit dem
eingetragenen Modell. Gleichzeitig zeigt sich, dass die Kette derzeit auf genau
einen Anbieter gestuetzt ist. Gemini antwortet mit 503 (Ueberlastung), nicht mit
401 — der Key ist also nicht das Problem, der Dienst ist es.

**Folge fuer den Smoke-Test:** Ein harter Fehlschlag bei 429/5xx macht den Test
chronisch rot, obwohl im Repo nichts kaputt ist. Genau dieses Rauschen hat in
den letzten Wochen echte Befunde verdeckt. Die Auswertung unterscheidet jetzt:

- `200` -> PASS, zaehlt als erreichbar
- `401`/`403` -> AUTH_FAIL, harter Fehlschlag (Secret pruefen)
- alles andere (429, 5xx, Timeout) -> DEGRADED, Warnung

Der Job schlaegt nur noch fehl, wenn ein Key abgelehnt wird oder **kein**
Anbieter antwortet. Die Zusammenfassung landet zusaetzlich in der Job-Summary.
