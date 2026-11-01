# Free-LLM Key-Changer (Sprint 202b)

Autonome Rotation ueber alle kostenlosen LLM-Anbieter, betrieben als
GitHub-Actions-Workflow (`.github/workflows/free-llm-changer.yml`),
alle 30 Minuten, gesteuert ausschliesslich ueber GitHub Secrets.

## Verwendete Secrets (unter Settings > Secrets and variables > Actions)

| Secret | Anbieter | Status |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini Free Tier | vorhanden |
| `GEMINI_BACKUP_KEY` | Gemini Reserve-Key | vorhanden |
| `GROQ_API_KEY` | Groq Free Tier | vorhanden |
| `OPENROUTER_API_KEY` | OpenRouter :free-Modelle | fehlt noch (optional) |
| `CEREBRAS_API_KEY` | Cerebras Free Tier | fehlt noch (optional) |
| `MISTRAL_API_KEY` | Mistral Free Tier | fehlt noch (optional) |

Fehlende Secrets einfach ergaenzen — der Changer erkennt sie automatisch
(beim naechsten Lauf). Kontingente oder Modelle aendern sich? Nur die
`provider-registry.json` anpassen.

## Verhalten

- Jeder Lauf pingt alle Anbieter mit ECHTEN Anfragen (Chat-Completion mit
  max_tokens=8) und schaltet den ersten verfuegbaren als aktiv.
- 429/402 = Limit erreicht: naechster Lauf rotiert automatisch weiter.
- Laeuft KEIN Anbieter mehr: Discord-Alarm (DISCORD_WEBHOOK_URL) + rot.
- Committet wird NUR `changer-status.json` (anonym, ohne Keys).
  `aktive-anbindung.env` enthaelt den aktiven Key und ist gitignored.

## Felder in `changer-status.json` (Sprint 386)

| Feld | Bedeutung |
|---|---|
| `stand` | Zeitpunkt des Laufs (Serverzeit des Runners) |
| `aktiv`, `aktiv_name`, `endpunkt`, `modell` | Der Gewinner des Laufs, `null` wenn keiner verfuegbar war |
| `anbieter[].status` | Klartext-Zustand: `VERFUEGBAR`, `LIMIT ERREICHT`, `KEY UNGUELTIG`, `NICHT KONFIGURIERT/ERREICHBAR` |
| `anbieter[].http_status` | HTTP-Code des Chat-Probes (`429`, `500` …), `null` wenn kein Code vorliegt |
| `anbieter[].modell` | Nur der Modellname. Vorher landete hier das ganze Detail (`500 gemma-4-31b-it`) |
| `anbieter[].detail` | Rohdetail des Probes (`500 gemma-4-31b-it`, `FEHLT`, `429 <modell>`) |
| `anbieter[].hinweis` | Naechster Schritt, z. B. `Changer rotiert weiter`, `Secret erneuern` |

Der Bericht ist ein reiner Statusreport. Er steuert die Laufzeit nicht: der
Server liest seine Provider aus ENV (`server/_core/llm.ts`), die Modell-Defaults
stehen in `lib/managed-model-logic.ts`.
