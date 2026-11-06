# Erstgespraech-Anfrage auf der Verkaufsseite (06.11.2026)

Schliesst den offenen P1-Punkt aus Issue #221: „Rechtlich geprüften
Inbound-Kanal und Buchung eines Erstgesprächs integrieren, kein automatischer
Werbeversand."

## Was neu ist

Besucher der oeffentlichen Seite `/ai-influenza` koennen jetzt ein Erstgespraech
anfragen, ohne ein Konto anzulegen. Die Anfrage ist ein **Kontaktwunsch der
anfragenden Person** (Grundlage `customer-requested`), kein Abo, keine Zahlung
und kein Auftrag.

| Baustein | Datei |
|---|---|
| Pruefung, Normalisierung, Lead-Signale | `lib/ai-influenza-intro-request-logic.ts` |
| Persistenz in Lead-Pipeline und Ereignis-Log | `server/ai-influenza-intro-request-service.ts` |
| Endpunkte `introRequest` (oeffentlich), `introRequests` / `markIntroRequestHandled` (Admin) | `server/ai-influenza-team-router.ts` |
| Formular auf der Verkaufsseite | `app/ai-influenza.tsx` |
| Admin-Karte „Erstgespraeche von der Verkaufsseite" | `app/(tabs)/ai-influenza-team.tsx` |
| Tests (16) | `tests/ai-influenza-intro-request.test.ts` |

## Datenmodell (bestehende Tabellen, keine Migration)

- **`b2b_network_nodes`** — ein Lead-Knoten je Unternehmensdomain
  (`ai-influenza-lead:<domain>`), damit die Anfrage in der vorhandenen
  Lead-Pipeline und der bestehenden Angebotslogik weiterverwendet werden kann.
  Freemail-Domains (z. B. `web.de`, `gmail.com`) bekommen bewusst einen eigenen
  Knoten je Adresse, damit fremde Privatpersonen nicht zu einem Sammelknoten
  verschmelzen.
- **`revenue_jobs`** — ein unveraenderliches Ereignis je Anfrage
  (`kind = "ai-influenza-intro-request"`), `dedupe_key = ai-influenza-intro:<tag>:<hash>`.
  Der Schluessel enthaelt die E-Mail-Adresse nicht im Klartext und verhindert
  nur Doppelklicks am selben Tag.

## Grenzen (bewusst, ehrlich)

- **Kein automatischer Versand.** Es geht keine Mail und keine Nachricht raus.
  `contactPolicy` bleibt `maySend:false`, `externalSendApproved:false`. Die
  Terminabstimmung macht ein Mensch.
- **Kein Kalender.** Es gibt keine Buchung eines festen Slots, nur einen
  Wunschzeitraum (diese Woche / naechste Woche / flexibel). Ein Kalender-Sync
  ist nicht gebaut und wird nicht behauptet.
- **Kein Captcha.** Nur ein Honeypot-Feld; Bots werden still verworfen
  (`spam:true`, gespeichert wird nichts). Zusaetzlich greift der bestehende
  Rate-Limit-Middleware-Guard der tRPC-Schicht.
- **Kein Konto noetig, aber auch keine Zusage.** Die Anfrage ist keine
  Auftragsbestaetigung und erzeugt keinen Umsatz.

## Verhalten im Detail

- Pflicht: Name (2–120 Zeichen), gueltige E-Mail, ausdrueckliche Einwilligung.
  Ohne Einwilligung wird nichts gespeichert.
- Optional: Unternehmen, Domain, Paketinteresse, Wunschzeitraum, Anliegen
  (max. 1200 Zeichen).
- Eine eingefuegte URL (`https://www.firma.de/kontakt`) wird auf den Host
  reduziert; ohne Domain wird die Domain der E-Mail-Adresse verwendet.
- Lead-Score: Engagement 95 (Selbstauskunft), Budgetsignal aus der Paketwahl,
  Content-Bedarf und Automatisierungsdruck aus Schluesselwoertern im Anliegen.
- Admin sieht offene und erledigte Anfragen inklusive Score und kann sie als
  erledigt markieren (`payload.handled`, `payload.handledAt`).

## Nachweis

```
npx vitest run tests/ai-influenza-intro-request.test.ts   # 16 Tests gruen
npx vitest run                                            # 445 Dateien, 3439 Tests gruen
npx tsc --noEmit                                          # 0 Fehler
npm run build                                             # dist/index.js gebaut
```

## Offene Punkte

- Bestaetigungsmail an die anfragende Person: bewusst nicht in diesem Schritt,
  weil Versand eine eigene Freigabe- und Rechtspruefung braucht (Resend-Domain,
  Text, Opt-in-Nachweis).
- Terminbuchung mit festen Slots und Kalender-Anbindung.
- Auswertung der Konversion Anfrage → Checkout im Dashboard (heute nur Rohdaten).
