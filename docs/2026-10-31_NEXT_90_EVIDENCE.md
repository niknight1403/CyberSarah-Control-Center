# CyberSarah – geprüfter Fortschritt der offenen 90 Sprints
Stand: 31.10.2026

## Bedeutung der Stati
- **CODE+CI**: Relevanter Produkt-/Betriebs-Code ist auf main und hat TypeScript, Lint, Vitest und Secret Scan bestanden. Das ist **keine** Bestätigung externer Anbieter-End-to-End-Tests.
- **CODE – CI ausstehend**: Implementierung liegt in einem Draft-PR, noch nicht freigegeben.
- **TEILWEISE**: Nachweisbare Teilfunktionen vorhanden; das im ursprünglichen Plan definierte gesamte Nutzerziel ist nicht vollständig abgenommen.
- **OFFEN**: Keine abschließende belegbare Umsetzung.

## Nachtrag Sprint 29 (01.11.2026)
- Produkt-Sync-Zustand je Provider (Stripe Products/Prices) mit Fehlerklasse, Fehlerserie, Backoff, Blockade bei Auth-/Konfigurationsfehlern und maskierten Meldungen; Admin-Fehler nennt jetzt Provider und Retry-Zeitpunkt statt Pauschalmeldung. Nachweis: 8 neue Vitest-Faelle, Gesamtsuite 2979 gruen.
- Ehrlichkeitsgrenze unveraendert: Der Zustand entsteht nur aus echten Versuchen dieser Instanz; ein Provider gilt nie als gesund ohne belegten Erfolg. Externe Stripe-E2E-Abnahme bleibt offen.

## Nachtrag Sprint 22 (01.11.2026)
- Variantenvergleich je Produkt: Preiskollisionen pro Waehrung/Abrechnungsintervall, ueberholte aber weiterhin aktive Preise, fehlende Erstellzeitpunkte (ehrlich als nicht belegbar), uneinheitliche Steuerbehandlung und Abweichungen vom Standardpreis. `created` wird jetzt als `createdAt` in die Projektion uebernommen.
- Nachweis: 9 neue Vitest-Faelle; Gesamtsuite 2988 gruen, TypeScript und ESLint sauber. Stripe-Testmode-E2E bleibt offen.

## Nachtrag Sprint 44 (01.11.2026)
- Publikationsfehler werden je Provider und Ursache gruppiert (Auth, Rate-Limit, Kontingent, Medium, Richtlinie, Netz, Versand unklar), inklusive Retry-Empfehlung und Hinweis; maskierte Fehlertexte; Jobs ohne Fehlertext werden als unbekannt gezaehlt statt stillschweigend verworfen.
- Admin-Uebersicht `publishing.opsOverview` liefert `failureReasons` konto-gescoped (max. 200 aktuelle Jobs).
- Nachweis: 7 neue Vitest-Faelle; Gesamtsuite 2995 gruen, TypeScript sauber, ESLint 0 Fehler.

## Nachtrag Sprint 30 (02.11.2026)
- Mobiler Admin-Katalog: Suche (umlautunabhaengig), Filter nach aktiv/inaktiv, Befunden, Verdikt, Waehrung und Hoechstpreis, Facetten und nach Schwere sortierte Zeilen; blockierende Befunde und Warnungen getrennt ausgewiesen.
- Manuelle Freigabe serverseitig geprueft: auf Teilkatalog, inaktive Produkte oder Standardpreisprobleme ist keine Freigabe moeglich; Ereignisse werden append-only in `product_release_events` (Migration 0023) mit Befund-Snapshot und Akteur gespeichert, Ruecknahme als eigenes Ereignis.
- Nachweis: 10 neue Vitest-Faelle; Suite 3005 gruen, TypeScript, ESLint und Build sauber. Stripe bleibt read-only.

## Hotfix 02.11.2026 — Webhook-Dedupe war nicht race-sicher
- Befund: `claimStripeWebhookEvent` las den Beleg und schrieb ihn danach. Zwei parallele Zustellungen konnten beide `process` beschliessen und beide Seiteneffekte ausfuehren; `onConflictDoNothing` verhinderte nur den zweiten Datensatz, nicht die zweite Verarbeitung. Zusaetzlich wuchs `stripe_webhook_events` unbegrenzt.
- Fix: atomarer Claim per `insert ... on conflict do nothing returning`; nur der Gewinner verarbeitet, ein verlorener Claim wird neu gelesen und ueber `resolveClaimAttempt` entschieden (duplicate/concurrent/retry/reclaim). Uebernahme haengender oder fehlgeschlagener Belege nur per bedingtem Update. Verarbeitete Belege werden nach 30 Tagen entfernt.
- Nachweis: 5 neue Vitest-Faelle, Suite 3046 gruen, TypeScript/ESLint/Build sauber; ein echter Parallel-Test gegen Postgres bleibt offen und wird nicht behauptet.

## Sprint 26 — Abo-Lesart konsistent (02.11.2026)
- Vorher: Gating verlangte hart `status === active`, die Abrechnungsuebersicht leitete den Tarif allein aus der Preis-ID ab — ein kuendigendes Abo verlor Zugriff oder zeigte gleichzeitig einen Tarif, der nicht nutzbar war.
- Jetzt: `readSubscriptionLifecycle` ist die einzige Lesart; Gating und Uebersicht nutzen sie, `pausedBehavior` wird persistiert.
- Nachweis: 14 neue Vitest-Faelle, Suite 3041 gruen, TypeScript/ESLint/Build sauber; Stripe-Testmode-E2E bleibt offen.

## Hotfix 02.11.2026 — APK-Versionen eindeutig
- Ursache: `.github/release-requests/version.txt` pinnte 2.8.0; der Workflow uebergab das als Wunschversion und lud neue APKs mit `--clobber` erneut in `v2.8.0-apk`. Neue Staende waren an der Nummer nicht erkennbar.
- Fix: `resolveBuildVersion` behandelt Wuensche als Mindeststand, erhoeht belegte Versionen auf die naechste freie Patch-Version und verhindert Downgrades; Skript und Workflow nutzen die Funktion. 6 zusaetzliche Tests (Suite 3011 gruen), TypeScript/ESLint/Build sauber.

## Nachtrag Sprint 25 (02.11.2026)
- Webhook-Idempotenz ist nicht mehr nur im Speicher: `stripe_webhook_events` (Migration 0024) haelt Zustellungen dauerhaft fest; Status processing/processed/failed, Versuche und letzter Fehler. Parallel laufende Zustellungen werden blockiert, haengende Verarbeitung nach 5 Minuten zur erneuten Zustellung freigegeben.
- Out-of-order-Schutz je Aggregat (subscription/invoice/charge/checkout): ein spaeter eintreffendes aelteres Event ueberschreibt keinen neueren Zustand.
- Refund-Buchhaltung ist kumulativ und auf den urspruenglichen Zahlbetrag gedeckelt; doppelte Event-IDs buchen nichts.
- Nachweis: 11 neue Vitest-Faelle, Suite 3027 gruen, TypeScript/ESLint/Build sauber. Stripe-E2E im Testmode bleibt offen.

## Neue, auf main übernommene Code-Verbesserungen
| Bereich/Sprint | Nachweis | Status |
|---|---|---|
| 21/23 – Stripe Katalog-Pagination/ID-Dubletten | PR #142, Merge `9e10654`, CI erfolgreich | CODE+CI; Stripe-Testmode-E2E offen |
| 48 – Zentrale Freigaben absichern | PR #143, Merge `7b79254`, Admin-Middleware + Ablehnungstests | CODE+CI für globale Draft-Rechte; individuelle Publish-Freigaben separat abnehmen |
| 31 – Stripe-Produkt zu Content-Entwurf | PR #144, Merge `3442b65`, 3 Asset-Briefs, DB-Lock/Quota/Dedupe, Admin-UI, Tests | CODE+CI; echte Rendering- und Publishing-Pipeline noch offen |
| 32/40 – Reel-Konzept und Quell-ID-Nachweis | PR #144; Reel/Story/Landing-Briefs und Stripe-Referenzen in Pending-Queue | TEILWEISE; kein fertiges Video/Voiceover, keine vollständige Versionshistorie |
| 42 – Zeitzonen/DST für Kampagnen | PR #145, Merge `62e9e52`, Berlin Sommerzeit-Tests, optional `CONTENT_SCHEDULE_TIMEZONE` | CODE+CI; realer externer Postingtest offen |
| 25/71 – Stripe Webhook Retry & Cache-Isolation | PR #146, aktueller Branch; Tests aus bisherigem PR #138 | CODE – CI ausstehend; Provider-E2E offen |

## Bereits vorhandene Funktionen im aktuellen Hauptprojekt
- Stripe read-only Katalog einschließlich inaktiver Produkte und Preisvarianten, Status/Steuer-Warnungen, Rechte-Claims und Herkunfts-IDs.
- Administrator-Produktfilter, Revenue-Entwürfe, Growth-Pulse und bestehende Social-Publishing-Queue.
- Getrennte Live-Testmode-Kennzeichnung und vorhandene Billing-Abonnementverwaltungswege.

**Wichtig:** Keine dieser vorhandenen Teilfunktionen allein macht die übrigen Sprintziele (z. B. komplette Content-Produktion, Preis-A/B-E2E, Social-Publishing-E2E, neue signierte Android-APK oder echte Profitabilität) automatisch erledigt.

## Noch erforderliche Abnahmen
1. **Stripe Testmode:** echter Checkout, Webhook-Signatur, Wiederholungen nach Server-/DB-Ausfall, Preiswechsel und Refund-Risiken mit benutzbarem Stripe-Testkonto.
2. **Content/Publishing:** Social-Provider-Zugriffsrechte, Marken- und Bildrechte, Test-Reel inklusive Video und Ton, menschliche Freigabe und Sandbox-Publish.
3. **Revenue:** Währungen, Steuerlogik, Kostenabdeckung und Attribution für überprüfbaren Deckungsbeitrag; kein Umsatzversprechen.
4. **Web/Android:** Build und Deployment auf gemergtem SHA, Navigation auf realem Android-Gerät, release-signierte APK mit prüfbarer Datei.
5. **24/7:** Render Free ist kein garantiert permanenter Worker; GitHub-Cron/Heartbeat, externes Monitoring und Recovery unter echter Last sind separat nachzuweisen.

Verbindlich: Kein ungeprüfter Stripe-Write, keine automatischen Finanzverpflichtungen und keine fremden Social-Publikationen ohne Freigabe. Der ursprüngliche 100-Sprint-Plan bleibt die maßgebliche Aufgabenliste; diese Datei ergänzt nur den evidenzbasierten Fortschritt.

## Wartungsupdate 02.11.2026 — Abhaengigkeiten und Sicherheitslage

- `npm update` innerhalb der bestehenden Semver-Ranges (nur `package-lock.json` veraendert, keine Range-Aenderung): 30 auf 20 Schwachstellen, die beiden kritischen (`proxy-addr`, `shell-quote`) und die Haelfte der hohen Befunde (12 auf 6) entfallen.
- `npm audit fix` bricht in diesem Baum mit einem npm-internen Fehler ab (`Cannot read properties of null (reading 'edgesOut')`); die Aktualisierung erfolgte deshalb ueber `npm update`.
- Verifikation: `tsc --noEmit` sauber, Vitest 3069 Tests gruen, ESLint ohne Befund, Build erfolgreich.
- Verbleibend: 6 hohe Befunde, alle nur mit Major-Spruengen loesbar (`expo`/`@expo/cli`/`expo-router`-Kette). Das ist eine eigene Expo-Migration und wird hier nicht behauptet.
