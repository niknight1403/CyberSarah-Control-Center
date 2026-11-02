# KI-Kontingent und Schluessel-Befund (02.11.2026)

Beobachtung aus dem Workflow-Test mit dem neuen Token. Kurzfassung: die
Verdrahtung haelt, die Schluessel nicht. Der Lauf ist jetzt ehrlich rot statt
falsch gruen.

## Laeufe

| Lauf | Workflow | Ergebnis |
| --- | --- | --- |
| 41387558755 | AI Influenza Content-Paket | success, 4/4 vertont, 0/4 Motive (429) |
| 41388307104 | AI Influenza Content-Paket | success, **2/4 vertont** (429), Gate noch nicht aktiv |
| 41388308704 | AI Influenza Stripe Test-Modus E2E | success, Rechnung `in_1UXCoNAuUge07PL9vS8PGfMj`, 999,00 EUR |
| 41390704435 | AI Influenza Content-Paket | **failure**, 3/4 vertont (Gate greift) |

Die beiden Laeufe 41388307104 und 41388308704 wurden gleichzeitig gestartet und
haben sich dasselbe Kontingent geteilt. Seit PR #210 serialisiert die
Concurrency-Gruppe `ai-influenza-llm-kontingent` beide Workflows.

## Befund je Schluessel

| Schluessel | Beobachtung | Bedeutung |
| --- | --- | --- |
| `GEMINI_API_KEY` | Text 4/4 (04:11), 2/4 (04:24), 3/4 (04:38); Motiv immer HTTP 429 | Kontingent am Tageslimit; Bildmodell gar nicht freigeschaltet |
| `GEMINI_BACKUP_KEY` | HTTP **401** bei jedem Versuch | Schluessel ungueltig oder geloescht, als Rueckfall wertlos |
| `OPENAI_BACKUP_KEY` | HTTP 429 | Kontingent ebenfalls erschoepft oder Projekt-Limit |

Der Rueckfall greift mechanisch wie gebaut (Log: `wechsle Quelle`), findet aber
keine dritte Quelle, die liefern kann.

## Was der Retry nicht kann

Gegen ein Tageskontingent helfen 2s/6s/14s nicht. Der Retry ist richtig fuer
kurze Aussetzer (Burst-Limit, 503), nicht fuer `rate_limit_exceeded` mit
Tagesfenster. Ein `Retry-After` von Google war in den Antworten nicht gesetzt,
sonst haette der Code es respektiert.

## Was jetzt gilt

- `REQUIRE_COMPLETE_PACKAGE=1` in der CI: eine Szene ohne Stimme macht den Lauf
  rot. Belegt durch Lauf 41390704435 (`3/4 Szenen vertont` -> `failure`).
- Manifest nennt `voiceScenes`, `motifScenes` und den tatsaechlich genutzten
  Motiv-Typ. Kein `gemini-image`, wenn alle Szenen beim Markenmotiv landen.
- Lokal ohne Schluessel bleibt der Lauf gruen, aber mit Hinweis — ein lokaler
  Trockenlauf soll nicht wie ein fertiges Paket aussehen.

## Offene Entscheidungen

1. `GEMINI_BACKUP_KEY` erneuern oder als Secret entfernen. Ein 401-Schluessel im
   Rueckfallpfad taeuscht Verfuegbarkeit vor, die nicht da ist.
2. Bildmotive: entweder eigener Schluessel mit Bildfreigabe/Billing, oder das
   Markenmotiv bleibt dauerhaft der Weg fuer alle Pakete.
3. Kontingent fuer Vertonung: wenn 12 Videos pro Monat das Versprechen sind,
   braucht es ein bezahltes Kontingent statt Free Tier. Grobe Rechnung: 4 Szenen
   je Video, 12 Videos = 48 TTS-Anfragen pro Monat plus Motive.

Nichts davon ist ein Codefehler. Es fehlen belastbare Schluessel — deshalb bleibt
der Content-Lauf rot, bis das entschieden ist.
