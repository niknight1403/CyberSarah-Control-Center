# Autopilot-Katalog (finalisiert, 09.11.2026)

Der Katalog beantwortet drei Fragen, die im Betrieb sonst geraten werden:
**Was laeuft automatisch, wodurch wird es ausgeloest, und was darf es
anfassen?** Er liegt in `lib/autopilot-registry-logic.ts` und ist ueber
`autopilots.overview` / `autopilots.validate` (protected, tRPC) abrufbar.

## Regeln

Ein Eintrag ist nur dann `active`, wenn er

1. einen **Trigger** mit ueberpruefbarer Referenz hat (`trigger.ref`),
2. mindestens ein **Gate** nennt (Token, Freigabe, Trockenlauf, Limit) und
3. eine **Begruendung** traegt, warum genau dieser Lauf sinnvoll ist.

`recommended` verlangt zusaetzlich eine konkrete **Voraussetzung**
(`prerequisite`), `not-useful` eine nachvollziehbare Ablehnung. Kind-Laeufe
eines Dachlaufs tragen `parent` und werden in der Uebersicht gruppiert.

`validateAutopilotCatalog()` prueft diese Regeln ohne Netz und ohne
Dateisystem. Die tatsaechliche Verdrahtung prueft
`tests/autopilot-catalog-wiring.test.ts` gegen das Repo:

- Cron-Eintraege: Workflow-Datei existiert **und** enthaelt den angegebenen
  Cron-Ausdruck,
- Timer-Eintraege: die Datei startet tatsaechlich einen `setInterval`,
- Route-Eintraege: die Aufrufstelle existiert und exportiert bzw. routet,
- Kind-Eintraege: der `parent` existiert und die Schritt-Runner stehen im
  Dachlauf-Code.

Damit ist genau der Fehlertyp ausgeschlossen, der vorher unbemerkt blieb: der
Dachlauf horchte auf den Workflow „Render Deploy", der aber nur manuell
startet. Der Push-Deploy heisst „CyberSarah Deploy & Sync Secrets" und ist
jetzt zusaetzlich als Ausloeser eingetragen.

## Stand

| Lauf | Trigger | Schreibt | Status |
| --- | --- | --- | --- |
| Control-Center (Dachlauf) | Cron `17 */2 * * *`, nach Push-Deploy, nach manuellem Render-Deploy | Scans, Experimente, Entwuerfe, Hub-Abdeckung, Discovery | aktiv |
| Hub-Entwuerfe | Kind des Dachlaufs | pending-Entwuerfe je Loop-Stufe | aktiv |
| Umsatz-Discovery | Kind des Dachlaufs | Ideen-Entwuerfe (max. 4 je Lauf) | aktiv |
| Revenue-Loop | Cron `40 5 * * *` | Tagesreport + freigabepflichtige Aktionen | aktiv |
| Publishing | Server-Timer 60 s | Veroeffentlichung freigegebener Bausteine | aktiv |
| Outreach-Worker | Route, Anlass | Erstansprachen, nur mit `OUTREACH_LIVE=1` | aktiv |
| Integrations-Audit | Cron `15 6 * * *` | nichts (liest Backend, Provider, DNS) | aktiv |
| Tech-Scanner | Cron `30 5 * * *` | Research-Report + Issue | aktiv |
| Integrations-Health | Route, auf Abruf | nichts (lesende Pruefung, 5-Min-Cache) | empfohlen |
| Marktplatz-DauerScan | manuell | Kandidaten aus externen Katalogen | empfohlen |
| Automatische Preisoptimierung | manuell | Preise an echten Produkten | **nicht sinnvoll** |

### Naechste sinnvolle Schritte

1. **Marktplatz-DauerScan**: braucht die Digistore24-API mit Provisions- und
   Verkaufszahlen. Ohne diese Zahlen waere jede Bewertung geraten — deshalb
   bewusst noch kein Cron.
2. **Integrations-Health-Cron** (30 Minuten): sinnvoll, sobald ein roter
   Befund auch zugestellt wird. Telegram ist konfiguriert, Mail haengt an den
   fehlenden Resend-DNS-Records (`docs/2026-11-08_AUDIT_AUSBAU_RESEND_DNS.md`).
3. **Preisoptimierung**: bleibt abgelehnt, bis pro Preisstufe genug
   Messvolumen existiert. Eine Automatik auf Rauschen ist teurer als Handarbeit.

## Was der Katalog bewusst nicht ist

Keine Laufzeit-Telemetrie. Ob der letzte Lauf erfolgreich war, steht in den
GitHub-Actions-Laeufen und im Server-Log, nicht hier. Der Katalog beschreibt
die Verdrahtung, damit niemand aus einem gruenen Katalog auf einen gesunden
Betrieb schliesst.

## Die zwei Blockaden vom 7. November (gelöst am 09.11.)

Der Dachlauf meldete seit dem 07.11.2026 in jedem Lauf `2 echte Blockade(n)`,
und der Workflow endete deshalb mit Exit 1. Beide Meldungen stammten aus
denselben zwei Zeilen: `HARA: …` und `Expansion: …`, also aus den beiden
Revenue-Scan-Triggern.

**Ursache, belegt statt vermutet:** Der Scan geht an
`https://hub.cybersarah-ki.com/revenue-api/api/{hara|expansion}/scan`. Dieser
Pfad antwortet aktuell mit `404` (nginx, `Server: nginx/1.24.0`), waehrend
`/api/hara/scan` auf demselben Host das Control Center selbst erreicht (401
Login). Der Relay vor der Loopback-Engine auf Port 18741 ist also nicht mehr
verdrahtet. Beide Scans scheitern damit identisch, und der Lauf zaehlte zwei
Blockaden, obwohl eine einzige Infrastruktur-Ursache dahinterstand.

**Was geaendert wurde:**

- `scan()` liefert jetzt zusätzlich die Fehlerklasse. Ein Ausfall der
  Scan-Infrastruktur (`PRECONDITION_FAILED`, `SERVICE_UNAVAILABLE`, Timeout)
  wird als **offener Punkt** geführt: `HARA-Live-Scan ausgesetzt: … — interne
  Revenue-Signale laufen weiter`. Echte, unerwartete Fehler bleiben Blockaden.
  Damit endet der Lauf nicht mehr mit Exit 1 wegen einer toten Fremdstrecke,
  und verschwiegen wird trotzdem nichts.
- Der Relay-Zustand ist jetzt Teil von `integrationHealth`: neuer Prüfpunkt
  `Revenue-Engine-Relay` (200/403 = erreichbar, 404 = Pfad fehlt, 0 = weg).
  Damit taucht genau dieser Ausfall dort auf, wo Integrationen überwacht
  werden, statt nur als Zahl im Cron-Log.

**Was offen bleibt:** Der Relay selbst ist Host-Arbeit
(nginx-Location → 127.0.0.1:18741, Key `X-Revenue-Internal-Key`). Solange er
fehlt, laufen HARA und Expansion nur über den internen Pfad; `integrationHealth`
zeigt das als `fail` mit der Ursache.
