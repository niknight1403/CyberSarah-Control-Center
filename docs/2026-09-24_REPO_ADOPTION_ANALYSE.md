# Repo-Adoptions-Analyse — was wir aus unseren 42 GitHub-Repos übernehmen sollten

**Datum:** 24.09.2026 · **Basis:** Sichtung aller 42 Repos des Accounts, Tiefe-Analyse von 12 relevanten Kandidaten.

## Kurzurteil

Wir sitzen auf einem Schatz und bauen trotzdem bei manchem neu: **projekt-nullpunkt** löst unsere größte Produktlücke (Bilder/Videos), **cybersarah-revenue-os-app** liefert produktionsgehärtete Muster (Integrations-Registry, Level-3-Freigabe, Digistore24), und **AROS** enthält die komplette Marketing-Agenten-Flotte. Dazu ein Sicherheitsbefund, der dringend ist.

## Top-Adoptionen (priorisiert nach Wirkung ÷ Aufwand)

### 1. IntegrationRegistry-Pattern (aus cybersarah-revenue-os-app) — AUFWAND: KLEIN
Deklarative Integrations-Definitionen mit `requiredEnv`, `capabilities`, `executionBoundary` und ehrlichem `readiness`-Status (ready/partial/not_configured) für Stripe, Resend, TikTok, Meta, **Digistore24**, GitHub. Übernehmen als `server/services/integrationRegistry.ts` + Anzeige im UI: Der Nutzer sieht endlich schwarz auf weiß, was konfiguriert ist und was fehlt — ersetzt verstreute ENV-Checks.

### 2. Bild-Generierung via FLUX (aus projekt-nullpunkt) — AUFWAND: MITTEL
Nullpunkt kapselt Hugging-Face-Inference hinter einem Adapter, Standard-Modell `FLUX.1-schnell` (kostenlos), mit Ken-Burns-Fallback bei Provider-Fehlern. Port als Agent-Tool in den Dev-Chat: **erfüllt das Drittel des Produktversprechens, das heute fehlt — ohne laufende Kosten.** Quota + Freigabe-Flow wie alles bei uns.

### 3. Level-3-Freigabe-Flow (aus cybersarah-revenue-os-app) — AUFWAND: MITTEL
`contentDrafts` + `externalActions` (Drizzle-Schema) mit Zustellung ausschließlich nach finaler Freigabe, Idempotenz-Audit, dokumentiertem Opt-in. Passt exakt zu unserer Bestätigungs-Karten-Philosophie — aber als Server-Enforcement statt nur UI. Übernehmen für jeden zukünftigen Kanal (E-Mail, Social).

### 4. Resend-Transaktionsmails (aus cybersarah-revenue-os-app) — AUFWAND: KLEIN
Quittungen, Onboarding, Funnel-Mails — opt-in-basiert, idempotent. Ohne E-Mail kein echter Trichter.

### 5. Job-Queue-Worker-Muster (aus projekt-nullpunkt) — AUFWAND: MITTEL
Persistenter Worker mit atomaren Claims, Lease-Token, Crash-Recovery, Backoff, Dead-Letter. Ehrlich gesagt das beste Stück Infrastruktur in allen Repos — nützlich für alle lange laufenden Agent-Jobs im Control Center (Video-Renders, Deployments, Backups), nicht nur für Medien.

### 6. Video-/TTS-Pipeline (aus projekt-nullpunkt) — AUFWAND: GROSS
Deutsche Chat-Eingabe → Szenenmanuskript (Visual-Prompt, Kamera, Sprechtext, Timing) → edge-tts (de-DE-KatjaNeural, kostenlos) → FFmpeg-1080p-MP4 mit SRT. Sicherheitsgrenzen sind vorbildlich: nur synthetische Inhalte, Deepfake/Minderjährigen-/Explizit-Ablehnung beim Manuskript-Start. Ehrlicher Status: v0.1, Produktionsnachweis (FFmpeg-Runtime, E2E mit Provider) fehlt — als ROADMAP-Stufe nach der Bild-Generierung, nicht als Sprint-Versprechen.

### 7. AROS-Marketing-Agenten (aus cybersarah-revenue-os) — AUFWAND: WAHLWEISE
15+ gebaute Agenten (SEO-Blog, Content Factory, E-Mail-Sequenzen, AbandonedCartRecovery, CrossSell, Loyalty, ConversionOptimizer, Affiliate). **Empfehlung: nicht alles mergen.** Als Draft-Generatoren hinter dem Level-3-Flow übernehmen (sie erzeugen Vorschläge, wir behalten die Freigabe), Posting/Publishing bleibt außen vor, bis ein Kanal konfiguriert UND abgenommen ist. AROS läuft ohnehin als Schwester weiter — die Brücke (server/revenue-os.ts) existiert schon.

### 8. Kleinere Adoptionskandidaten
- **Sentry** (`_core/sentry.ts` aus revenue-os-app): Fehler-Beobachtung in Produktion, Aufwand klein.
- **eve-slack-agent**: Slack-Kanal-Vorlage (`@vercel/connect`), falls der Agent künftig in Slack erreichbar sein soll.
- **Digistore24-IPN** (Doc + Code aus revenue-os-app): deutsche Zahlungs-Alternative neben Stripe — passt zur DE-Zielgruppe, die Analyse hat sie als voll integriert mit executed boundaries.

## Nicht übernehmen (ehrlich)

- **CyberSarah-master, CyberSarah-pro-migration, CyberSarah-21-, Ai-Freundin:** Legacy-/Zwillingsstände bzw. v0-Spielwiesen — nichts, was der Control Center nicht schon besser hat. Archivieren statt pflegen.
- **LiveAudioPerformanceStudio, android-push-pro, SteelSense-Varianten, Comedy-Repos:** andere Produkte. Nur ihre Disziplin (Validierungs-Doku je Screen bei android-push-pro) ist ein Vorbild, kein Code.

## ⚠️ Sicherheitsbefund (dringend)

1. **Datenbank-Backups im Git:** `cybersarah-revenue-os` committet zwei Neon-DB-Dump-SQLs (`CyberSarah-DB-Backup-20260729-*.sql`). Das kann Kundendaten und Token enthalten — prüfen, aus der Historie entfernen, Rotation der betroffenen Geheimnisse.
2. **42 Repos, viele leere Doppelgänger** (CyberSarah, CyberSarah-, CyberSarah-pro-, SteelSense ×7, Comedy ×2): Angriffsfläche, Verwirrung, ungeschützter Gitleaks-Scope. Empfehlung: alte Repos archivieren, Gitleaks auch auf die verbleibenden aktiven Repos ausweiten (Workflow existiert nur für den Control Center).

## Angepasster Sprint-Plan 262–271 (Umsatz-Reihe, um Adoptionsfunde ergänzt)

| Sprint | Ziel | Quelle |
|---|---|---|
| 262 | Quota-Enforcement "enforce" + Upgrade-Prompts | Control Center |
| 263 | IntegrationRegistry + Status-Screen (was ist konfiguriert) | revenue-os-app |
| 264 | Bild-Generierungs-Tool via FLUX.1-schnell (HF-Adapter, Ken-Burns-Fallback, Quota, Freigabe) | projekt-nullpunkt |
| 265 | Landing-Page + echte Preise + Stripe-Checkout-Verlinkung | Control Center |
| 266 | Resend-Transaktionsmail (opt-in, idempotent, Quittungen + Onboarding) | revenue-os-app |
| 267 | Analytics (Seiten, Signups, Chats) | Ai-Freundin-Vorbild / eigen |
| 268 | Level-3-Freigabe-Flow (contentDrafts/externalActions) + MRR-Dashboard aus Stripe | revenue-os-app |
| 269 | Onboarding + Template-Galerie | Control Center |
| 270 | EN-Toggle + Sentry-Beobachtung | revenue-os-app |
| 271 | Abschluss: Validierung, Push, Produktion + Sicherheits-Bereinigung der Alt-Repos (DB-Backups raus, Archive, Gitleaks-Scope) | Analyse |

Video-Pipeline (Nullpunkt-Port) bleibt bewusst hinter 271 als eigene Reihe: sie ist die richtige Lösung, aber v0.1 ohne Produktionsnachweis — wir versprechen nur, was läuft.
