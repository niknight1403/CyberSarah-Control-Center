# Sprint 51 — Abschlussbericht: DATABASE_URL-Fail-Fast und Koyeb-DB-Doku-Korrektur

**Datum:** 08.09.2026
**Ziel:** Deploy-Abbrüche bei falscher Datenbank-URL früh und verständlich machen; Doku an die tatsächliche Koyeb-Console („Database Services") anpassen.

## 1. Fail-Fast-Validierung der DATABASE_URL

`lib/koyeb-deploy-logic.mjs` — neue Funktion `validateDatabaseUrl` (rein deterministisch):

- Scheme-Prüfung: `postgres://` oder `postgresql://`
- Host-Extraktion inkl. Userinfo (`user:pass@` — der erste Pfad-Segment-Bug wurde von den Tests aufgedeckt und gefixt)
- Leerzeichen-/Fließtext-Erkennung (gleiche Muster wie `validateKoyebToken`)
- localhost/127.0.0.1-Ablehnung mit Koyeb-spezifischer Begründung

`scripts/koyeb-deploy.mjs` bricht bei ungültiger URL **vor** Migrationen und App-Anlage mit `Exit 2` und klarer deutscher Meldung ab — vorher hätte man erst nach dem 10-minütigen Koyeb-Build einen kryptischen Drizzle-Fehler bekommen.

Sandbox-Verifikation: `postgresql://u:p@localhost:5432/db` → abgelehnt; gültige Koyeb-URI → „Fail-Fast-Check" bestanden, Dry-Run läuft durch.

## 2. Koyeb-Doku-Korrektur (Recherche-Ergebnis)

Koyeb Database Services = **verwaltetes PostgreSQL** (Regionen Frankfurt/Washington/Singapore, PG 14–17, Console-Anlage via *Databases → Create Database Service*). Unsere alte Klick-Anleitung beschrieb einen nicht existierenden Flow — korrigiert auf: Engine PostgreSQL 16/17, Default-Role `koyeb-adm`, Default-DB `koyebdb`, Connection-URI `postgresql://koyeb-adm:…@…/koyebdb`.

**Wichtiger neuer Befund — Free-Tier-Limits der kostenlosen DB-Instanz:** 5 Stunden Compute pro Monat, maximal 1 GB Daten. Für dauerhaften Produktivbetrieb wird die Instanz **small** (~29,76 $/Monat) benötigt — das ist eine Owner-Entscheidung (Kosten), bewusst nicht automatisiert.

Die Koyeb-API hat keinen öffentlich dokumentierten Pfad für die DB-Anlage; die Datenbank-Anlage bleibt daher bewusst console-basiert (einmalig, ~2 Minuten), alles danach läuft automatisch.

## 3. Regression

- `tests/koyeb-deploy-logic.test.ts`: 21/21 grün (17 + 4 neu)
- Skript- und Logik-Syntax: `node --check` OK
- Volle Suite: 296/296 grün (292 + 4), tsc und Server-Bundle sauber
- CI auf dem Sprint-Commit: grün

## 4. Ausblick

Deployment-Blocker unverändert: gültiger `KOYEB_TOKEN` (Issue #3) und die einmalige DB-Anlage in der Konsole. Danach läuft der Bootstrap-Workflow vollständig autonom durch (Tests → Fail-Fast → Migrationen → App → Health-Check).
