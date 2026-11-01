# Sprints 314–323 — Serie D: Umsatz-Reihe 2 (25.09.2026)

## Sprint-Uebersicht
- **Sprint 314** `lib/quota-mode-logic.ts`: Admin-Schalter monitor <-> enforce mit
  append-only Audit-Log (Actor, Grund, Zeit); im Modus monitor blockiert die Quote
  NIE — Ueberschreitungen werden nur gezaehlt und ehrlich gemeldet.
- **Sprint 315** `lib/upgrade-prompt-ui-logic.ts` (UI-Schicht auf dem Sprint-262-Gate `lib/upgrade-prompt-logic.ts`): einheitlicher Upgrade-Hinweis an allen
  Quota-Grenzen ab 90 % Verbrauch, ohne Dark Patterns (kein Countdown, keine
  Fake-Verknappung); einmal pro Feature/Tag verwendbar, Restkontingent immer genannt.
- **Sprint 316** `lib/checkout-return-logic.ts`: Checkout-Rueckweg mit klaren
  Zustaenden (erfolg/abgebrochen/offen/ungueltig) — Erfolg NUR aus verifizierter
  Session, niemals aus dem URL-Parameter allein.
- **Sprint 317** `lib/billing-history-logic.ts`: Rechnungshistorie aus Stripe-Daten,
  neueste zuerst, Summen ehrlich getrennt (bezahlt/offen/uneinziehbar), leere
  Historie als ehrliche Meldung statt Nullsummen.
- **Sprint 318** `lib/tier-comparison-logic.ts`: Vergleichsmatrix Lite/Pro/Expert aus
  dem Entitlement-Katalog; Preise nur wenn konfiguriert (sonst "Preis im Checkout");
  Empfehlung als kleinster passender Tier, kein Verkaufstrick.
- **Sprint 319** `lib/stripe-testmode-logic.ts`: Test-Modus-Erkennung am Key-Praefix
  mit lauter, unmissverstaendlicher Kennzeichnung; Test-Zahlungen zaehlen NIE als
  Umsatz (revenueGuard), Checkout-Disclaimer im Test-Modus.
- **Sprint 320** `lib/cancellation-flow-logic.ts`: Kuendigungs-Flow mit Zustands-
  automat (aktiv -> vorgemerkt -> gekuendet), Konsequenz-Liste aus Tier-Entitlements,
  Ruecknahme nur vor Periodenende, ruhige Bestaetigungssprache.
- **Sprint 321** `lib/mrr-dashboard-logic.ts`: MRR v2 aus verifizierten Abo-Zustaenden
  (past_due draussen); unbekannte Tier-Preise werden NICHT geschaetzt, sondern
  gemeldet; Churn aus echten Kuendigungen, Neukunden aus echten Starts.
- **Sprint 322** `lib/ops-payment-alert-logic.ts`: Zahlungsausfall-Alerts an Admin mit
  Dedup (ein offener Alert pro Rechnung), Eskalation (Level 1-3 nach Versuch-Anzahl)
  und Zustellungs-Verifikation — "versendet" bleibt UNBESTAETIGT bis Admin-Ack.
- **Sprint 323** Abschluss: Doku, CHANGELOG, Tracker, Version 2.8.0, volle Regression.

## Ehrlichkeits-Grenzen (Kurzfassung)
- Monitor-Modus und enforce sind nie verwechselbar; Audit-Log unveraenderlich.
- Kein Zahlungszustand wird behauptet, der nicht verifiziert ist.
- Test-Modus-Daten fließen nie in Umsatzzahlen ein.
