# Sprints 262–270 — Umsatz-Reihe (Fertigstellung)

**Datum:** 24.09.2026 · **Stand:** Alle 1.508 Tests grün, TypeScript sauber, Lint sauber, Build sauber, CI grün, Produktion stabil.

## Die Reihe im Überblick

| Sprint | Modul | Ehrlichkeits-Kern |
|---|---|---|
| 262 | Ehrliche Upgrade-Prompts an Chat-Quota-Grenzen | Zahlen, Reset-Zeitpunkt, Checkout nur bei konfiguriertem Preis, kein Druck |
| 263 | Integrations-Registry + Status-Router | "nicht konfiguriert" ist ein benannter Zustand; jede Integration hat eine Ausführungsgrenze |
| 264 | Bild-Generierung via FLUX.1-schnell (HuggingFace Free-Tier) | Nur synthetische Inhalte, Deepfake/Explizit-Ablehnung vor dem Aufruf, Cache ehrlich benannt, Freigabe Pflicht |
| 265 | Öffentliche Landing-Page + ENV-basierte Preise | Ohne konfigurierten Preis "Preis auf Anfrage", jeder Tarif nennt Grenzen, kein Erfolgsversprechen |
| 266 | Resend-Transaktionsmail | Kein Versand ohne dokumentiertes Opt-in mit Quelle, Idempotenz-Schlüssel, Tageslimit |
| 267 | Datenschutz-arme Analytik mit Trichter | Nur Ereignis-Arten und Zahlen, keine Sessions, keine PII, Retention im Code (90 Tage) |
| 268 | Level-3-Freigabe-Flow für externe Aktionen | Ablehnung ist final, Audit-Spur unvereinbar mit Rückgängigmachen, Ausführung nur nach Freigabe |
| 269 | Provider-Rotation + Antwort-Cache | Cache-Antworten benennen Quelle und Alter; Erschöpfung = ehrlich abwarten statt teuer durchschlüpfen |
| 270 | Selbstheilende Schreib-Grenze + Code-Index im Dev-Chat | Validierung VOR dem Schreiben, Geheimnisse werden nie geschrieben, Fehler sind behebbare Meldungen an das Modell |

## Technische Hinweise

- **Bild-Generierung:** Server ruft FLUX.1-schnell über den HuggingFace-Router auf (ENV: `HF_TOKEN`, optional `HF_BASE_URL`). Ohne Token antwortet der Dienst ehrlich "nicht konfiguriert". Tagesquote 25 Bilder/Nutzer, Cache 120 Einträge.
- **Quota-Grenzen im Chat:** Bei Erreichen des Tageslimits liefert der Chat jetzt den ehrlichen Prompt aus `lib/upgrade-prompt-logic.ts` statt eines nackten Fehlers; der Checkout-CTA erscheint nur, wenn `STRIPE_PRICE_ID_*` konfiguriert ist.
- **Preise:** `TIER_PRICE_CENTS_LITE/PRO/EXPERT` (Cent-Beträge) steuern die Anzeige; `STRIPE_PRICE_ID_*` steuern die Checkout-Verfügbarkeit. Beides unkonfiguriert = ehrliche Anzeige, kein toter Button.
- **Landing-Page:** Route `/landing` (Expo Router), öffentlich, tracked nur `landing_view` (Zahl, kein Nutzer).
- **Rückbau nach Sandbox-Reset:** Die Reihe wurde nach einem Verlust des lokalen Stands aus der dokumentierten Spezifikation vollständig neu gebaut und anschließend komplett validiert — jede Datei ist wieder da, inklusive aller 42 neuen Tests.

## Was die Reihe NICHT leistet (ehrlich)

- Sie erzeugt keine Nutzer. Distribution ist Vertriebsarbeit (Product Hunt, Communities, Content), die das Produkt nur vorbereitet.
- Bild-Generierung läuft im Free-Tier ohne Verfügbarkeitsgarantie; Fehler werden als solche gemeldet.
- Video-Generierung fehlt weiterhin bewusst (projekt-nullpunkt v0.1 ohne Produktionsnachweis) und bleibt eine eigene Reihe.
