# Sprint 92 — Review- und Betriebswacht: KI-Review, Uptime-Monitor, Coverage-PR-Kommentare

**Datum:** 14.09.2026 · **Status:** Abgeschlossen · **Ziel:** Die drei offenen Handoffs aus Sprint 91 vollautonom produktiv schalten — ohne externe Anmeldungen (CodeRabbit, UptimeRobot, Codecov) und ohne neue Secrets.

## Kernidee

Sprint 91 notierte drei „manuelle Handoff-Punkte" (Codecov-Token anlegen, CodeRabbit-GitHub-App installieren, UptimeRobot-Monitor einrichten). Statt Nutzer-Anmeldungen zu fordern, nutzt dieser Sprint ausschließlich vorhandene Ressourcen: den **GEMINI_API_KEY** (bereits Repo-Secret), den **DISCORD_WEBHOOK_URL** (bereits Repo-Secret) und das automatisch erzeugte GITHUB_TOKEN. Ergebnis: alle drei Funktionen sind produktiv, ohne dass ein externes Konto existiert.

## Umsetzung

### 1. KI-Code-Review: PR-Agent mit Gemini (`.github/workflows/pr_agent.yml`)

- Open-Source PR-Agent (The-PR-Agent) als GitHub Action — ersetzt CodeRabbit vollständig: kein externes Konto, keine GitHub App, keine Kosten.
- Modell: `gemini/gemini-2.5-flash` über den bestehenden GEMINI_API_KEY (Google AI Studio, Kontingent kostenlos).
- Bei jedem neuen PR (opened/reopened/ready_for_review) laufen automatisch `/describe` (PR-Beschreibung), `/review` (Review) und `/improve` (Verbesserungsvorschläge) — auf Deutsch, mit Projekt-Konventionen als extra_instructions (Sprint-Commit-Stil, kein CNG, android/ als Quelle der Wahrheit, keine Secrets).
- Interaktiv in jedem PR per Kommentar: `/review`, `/improve`, `/ask "..."`, `/describe`, `/update_changelog`.
- Bot-PRs (Dependabot) werden vom Sender-Guard übersprungen — schont das Gemini-Kontingent.
- `publish_labels = false`: describe vergibt keine Labels mehr.

### 2. Uptime-Wächter (`.github/workflows/uptime-waechter.yml`)

- Ersetzt UptimeRobot: GitHub-Actions-Cron prüft alle 30 Minuten `https://app.cybersarah-ki.com/api/health` von außen (Azure-Runner — auch ein Ausfall von Render selbst wird erkannt).
- Robustheit gegen Fehlalarme: 3 Versuche à 20 s Timeout, erst danach zählt der Ausfall.
- Alarmierung: genau EIN offenes Issue mit Label `uptime-alert` (keine Duplikate — Folgefehler kommentieren das Issue), plus Discord-Alarm über den bestehenden Webhook.
- Erholung: automatischer Abschlusskommentar + Issue wird geschlossen.
- Kosten: ~1.440 Runner-Minuten/Monat — weit unter dem 2.000-Minuten-Kontingent privater Repos. Der 15-Minuten-Takt wurde bewusst verworfen, um Kontingent für CI-Builds zu lassen.
- Manueller Test jederzeit per workflow_dispatch möglich.

### 3. Coverage-PR-Kommentare: Codecov-Ersatz (`scripts/coverage-pr-comment.mjs`)

- Eigenes, deterministisches Skript statt externem Dienst: liest `coverage/coverage-summary.json` und veröffentlicht/aktualisiert einen markierten Kommentar im PR mit Gesamt-Abdeckung und den 12 am schwächsten abgedeckten Dateien (≥ 20 messbare Zeilen) — dort haben neue Tests den größten Effekt.
- Keine neue Abhängigkeit, kein Token außer GITHUB_TOKEN; `pull-requests: write` in `ci.yml` ergänzt.
- DRY_RUN=1 erlaubt lokales Testen des Renderings ohne PR.
- Der optionale Codecov-Upload aus Sprint 91 bleibt als Wechsel-Option erhalten (nur aktiv mit CODECOV_TOKEN).

## Verifikation

- YAML aller Workflows geparst und gegen die Template-Dokumentation des PR-Agent abgeglichen.
- `scripts/coverage-pr-comment.mjs` im DRY_RUN gegen die echte Zusammenfassung getestet (Pfade, Sortierung, Markdown-Rendering), Syntax-Check grün.
- End-to-End nach Push: Uptime-Wächter manuell ausgelöst (Health-Check OK gegen die Produktiv-URL), Verifikations-PR mit KI-Review und Coverage-Kommentar geprüft (siehe Commit-Historie).

## Abgrenzung / bewusst NICHT gemacht

- Kein UptimeRobot/Statuspage-Konto — der GitHub-Runner deckt externe Checks ab; wer eine zweite, unabhängige Prüfebene will, kann UptimeRobot zusätzlich anlegen (50 Monitore gratis).
- Kein Snyk — bleibt optional; Gitleaks (Sprint 91) scannt Secrets, `npm audit` und Dependabot decken Dependencies ab.
- Keine React-18/19-spezifischen Anpassungen an PR-Agent-Konfigurationen — Werkzeuge laufen unverändert.
