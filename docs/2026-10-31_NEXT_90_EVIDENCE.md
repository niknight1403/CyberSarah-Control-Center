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
