# CyberSarah – 100 echte Entwicklungs-Sprints (Nummer 11–110)

Stand: 30.10.2026. Nur 'CODE – CI ausstehend' bedeutet bereits implementierte Änderungen im PR #135; erst erfolgreiches CI und E2E-Abnahme schließen einen Sprint ab. 'OFFEN' bedeutet keine fertige Umsetzung. Keine Erfolgsgarantie oder rückwirkend erfundenen Tests.

Definition: Ein Sprint ist ein integriertes, testbares Nutzer- oder Betriebsziel mit Commit-Referenz, TypeScript/Lint/Test-Nachweis und relevantem E2E-Gate. Das Ändern einer einzelnen Datei zählt nicht als Sprint.

## 1. Integrity & Safety

| Sprint | Ziel | Status |
|---:|---|---|
| 11 | Umsatzwerte ohne Currency-Nachweis niemals als EUR ausgeben | CODE – CI ausstehend |
| 12 | Fehlende Funnel-Stufen erkennen und riskante Experimente blockieren | CODE – CI ausstehend |
| 13 | Pausen, Blockaden und Leerlauf im Growth-Protokoll getrennt ausweisen | CODE – CI ausstehend |
| 14 | Mobile Admin-Statusanzeige mit echten Blockerursachen | CODE – CI ausstehend |
| 15 | Parallele Growth-Starts ohne redundante Datenbankabfrage behandeln | CODE – CI ausstehend |
| 16 | Growth-Diagnose auch bei Datenbankausfall bereithalten | CODE – CI ausstehend |
| 17 | Veraltete Plattform-Messwerte erkennen und Optimierungen pausieren | CODE – CI ausstehend |
| 18 | Zentralen Operator-Kill-Switch vor externen Scans respektieren | CODE – CI ausstehend |
| 19 | Providergeheimnisse und persönliche Kontaktdaten in Cron-Logs maskieren | CODE – CI ausstehend |
| 20 | Neue Sicherheitsregeln als verbindliche CI-Release-Gates prüfen | CODE – CI ausstehend |

## 2. Product & Stripe

| Sprint | Ziel | Status |
|---:|---|---|
| 21 | Stripe-Produkte über Produktstatus und Varianten zuverlässig abgleichen | OFFEN |
| 22 | Stripe-Produktvarianten mit steuerlicher/zeitlicher Gültigkeit vergleichen | OFFEN |
| 23 | Doppelte Stripe-IDs und verwaiste lokale Offers sicher behandeln | OFFEN |
| 24 | Checkout-Messung mit Stripe-Testmode-End-to-End abnehmen | OFFEN |
| 25 | Webhook-Wiederholungen bei Bestellung/Refund idempotent verarbeiten | OFFEN |
| 26 | Abonnements mit Kündigung, Retention und Wiederaufnahme konsistent lesen | OFFEN |
| 27 | Produktrechte und Affiliate-Kennzeichnung als prüfbare Freigaben speichern | OFFEN |
| 28 | Produkt-Matching über Herkunftsquellen ohne stillen Importkollisionsverlust | OFFEN |
| 29 | Produkt-Sync-Fehler pro Provider mit Recovery-Status dokumentieren | CODE+CI — `lib/provider-sync-recovery-logic.ts` (Klassifikation, Backoff, Blockade bei Auth/Konfiguration, Maskierung), 8 Tests, im Katalog-Abruf aktiv (`providerSync` + Provider-Name im Admin-Fehler) |
| 30 | Admin-Produktkatalog mobil filtern, prüfen und manuell freigeben | OFFEN |

## 3. Content Production

| Sprint | Ziel | Status |
|---:|---|---|
| 31 | Produkt zu konsistentem Content-Brief mit Faktencheck ausbauen | OFFEN |
| 32 | Reel-Storyboard mit Timing, Voiceover und Untertitelvalidierung | OFFEN |
| 33 | Varianten für Hooks/CTA ohne übermäßige Duplicate-Creatives entwerfen | OFFEN |
| 34 | Asset-Nutzungsrechte in renderbarer Produktionspipeline überprüfen | OFFEN |
| 35 | Content-Ermüdung anhand echter Kanalmetriken messen | OFFEN |
| 36 | Persona- und Markenstil über alle Kampagnenteile konsistent halten | OFFEN |
| 37 | Content-Szenen und Formatvarianten für Mobile priorisieren | OFFEN |
| 38 | Voiceover-Ausgabe mit tatsächlichem Audio-End-to-End testen | OFFEN |
| 39 | Fehlerhafte Video-Renderjobs sicher erneut in Drafts überführen | OFFEN |
| 40 | Content-Paket mit Freigabe- und Versionshistorie nachvollziehbar machen | OFFEN |

## 4. Publishing & Reach

| Sprint | Ziel | Status |
|---:|---|---|
| 41 | Platform-Connector-Permissions vor jedem Publish testen | OFFEN |
| 42 | Publikations-Zeitplan robust gegen Zeitzonen und DST absichern | OFFEN |
| 43 | Duplikate und Replays in Crossposting-Jobs verhindern | OFFEN |
| 44 | Publikationsfehler nach Ursachen/Provider getrennt anzeigen | OFFEN |
| 45 | Upload-Quota und Rate-Limits mit angemessenem Backoff behandeln | OFFEN |
| 46 | Organische Reichweiten-Kohorten pro Kanal getrennt messen | OFFEN |
| 47 | Social-Engagement-Signale ohne private Daten-Dubletten erfassen | OFFEN |
| 48 | Geplante Posts in zentraler Admin-Approval-Queue freigeben | OFFEN |
| 49 | Veröffentlichte Posts und Drafts revisionssicher verknüpfen | OFFEN |
| 50 | End-to-End-Sandbox-Publish und Medienrechte kontrolliert abnehmen | OFFEN |

## 5. Landing & Funnels

| Sprint | Ziel | Status |
|---:|---|---|
| 51 | Produkt-Landingpage-Generator mit nachvollziehbarem CTA-Vertrag | OFFEN |
| 52 | Mobile Funnel Navigation und Form-Semantik accessibility-testen | OFFEN |
| 53 | Consent- und Tracking-Regeln auf Landingpages durchsetzen | OFFEN |
| 54 | Landing-Page Preview vor externer Veröffentlichung sicher bereitstellen | OFFEN |
| 55 | Formularabbruch und unerreichbare Checkout-Links erkennen | OFFEN |
| 56 | Cross-Sell ohne unpassende oder nicht verfügbare Produkte empfehlen | OFFEN |
| 57 | Landing-A/B-Tests mit Kontrollgruppen und Messfenstern planen | OFFEN |
| 58 | Page-Load- und Core-Web-Vitals im Release-Gate messen | OFFEN |
| 59 | Conversion-Funnel von Impression über Click bis Checkout verknüpfen | OFFEN |
| 60 | Landing-Draft zur produktiven Site nur über explizite Freigabe überführen | OFFEN |

## 6. Revenue Analytics

| Sprint | Ziel | Status |
|---:|---|---|
| 61 | Attribution-Event-Idempotenz anhand stabiler Event-Keys prüfen | OFFEN |
| 62 | Refunds über Kohorten/Zeitraum mit realen Käufen abgleichen | OFFEN |
| 63 | Marketing-Kostenabdeckung pro Offer explizit nachweisen | OFFEN |
| 64 | Unbekannte Aufwände nicht als Gewinn deklarieren | OFFEN |
| 65 | Negative Deckungsbeiträge mit Kontroll- und Warnsignalen anzeigen | OFFEN |
| 66 | Funnel-Lücken über Providergrenzen ohne Doppelzählung erkennen | OFFEN |
| 67 | Umsatzsignale inklusive zurückgebuchter Zahlungen differenzieren | OFFEN |
| 68 | Retention und Wiederkäuferkohorten auf belastbarer Datenbasis vergleichen | OFFEN |
| 69 | Prioritäten nach konservativ belegtem inkrementellem Wert bestimmen | OFFEN |
| 70 | Mobile Revenue-Scorecard mit Quellen-, Aktualitäts- und Unsicherheitsstatus | OFFEN |

## 7. Pricing & Profit

| Sprint | Ziel | Status |
|---:|---|---|
| 71 | Preisvarianten mit zulässigen Intervallen und Währungen prüfen | OFFEN |
| 72 | Kostenminimum und plausible DB-Margenspannen pro Offer ableiten | OFFEN |
| 73 | Preis-Simulation ohne Stripe-Live-Schreibzugriff anbieten | OFFEN |
| 74 | Kontrollierte Preis-A/B-Entwürfe mit Mindeststichprobe validieren | OFFEN |
| 75 | Preisänderung bei unklarer Preiselastizität blockieren | OFFEN |
| 76 | Preisempfehlung bei unvollständiger Kostenabdeckung stoppen | OFFEN |
| 77 | Refund-Risiken in Preisexperimente aufnehmen | OFFEN |
| 78 | Admin-Freigabe als einzige Quelle produktiver Preiswechsel durchsetzen | OFFEN |
| 79 | Alle Preisänderungsanträge revisionssicher versionieren | OFFEN |
| 80 | Testmode-Preis- und Checkout-Pfade mit realer Sandbox abnehmen | OFFEN |

## 8. Mobile Experience

| Sprint | Ziel | Status |
|---:|---|---|
| 81 | Cyber Neon Command/Aurora Flow als Designsystem konsistent umsetzen | OFFEN |
| 82 | Revenue-Overview ohne visuelles Flackern rendern | OFFEN |
| 83 | Produkt- und Kampagnenfilter auf kleinen Android-Screens optimieren | OFFEN |
| 84 | Live-Status und Cron-Historie nicht mit Offline-Simulation verwechseln | OFFEN |
| 85 | Freigabe-Queue mobil bedienbar und barrierearm gestalten | OFFEN |
| 86 | Reel-Preview mit Lade-/Abbruch-/Fehlerzuständen ausstatten | OFFEN |
| 87 | Admin-Stripe-Verbindung mobil verständlich und sicher anzeigen | OFFEN |
| 88 | Offline-/schlechte-Verbindung-Wiederaufnahme testen | OFFEN |
| 89 | Android APK-Releasemanifest und Signaturkontrolle automatisieren | OFFEN |
| 90 | Android-Geräte-Smoke-Tests für echte Kauf-/Content-Navigation durchführen | OFFEN |

## 9. Infrastructure & Autonomy

| Sprint | Ziel | Status |
|---:|---|---|
| 91 | Render-Deploy auf tatsächlichen GitHub-SHA prüfen | OFFEN |
| 92 | Healthcheck nach Build und Migration revisionssicher hinterlegen | OFFEN |
| 93 | Cron-Ausfälle durch externe Checkpoint- und GitHub-Historie erkennen | OFFEN |
| 94 | Parallele Cron-/Admin-Aktionen unter Mehrinstanzbetrieb koordinieren | OFFEN |
| 95 | Provider-Grenzen überwachen ohne heimliches Account-Wechseln | OFFEN |
| 96 | LLM-Routing bei Quotas kontrolliert und begrenzt degradieren | OFFEN |
| 97 | DB-Pool, Locks und Pagination unter Last sicher betreiben | OFFEN |
| 98 | Backups/Wiederherstellung regelmäßig mit Sandbox-Daten testen | OFFEN |
| 99 | Rechtmäßige Plattformverbindungen bei Auth-Expiry erneuern | OFFEN |
| 100 | Incident-Runbook für Stripe/Content/Cron/Deploy-Fehler implementieren | OFFEN |

## 10. Release & Commercial

| Sprint | Ziel | Status |
|---:|---|---|
| 101 | Every-sprint Test- und Change-Evidence maschinenlesbar dokumentieren | OFFEN |
| 102 | Sprint-Abhängigkeiten und ehrlichen Status im Dashboard visualisieren | OFFEN |
| 103 | CI-Branch-Protect und Secret-Scan bei jeder Änderung absichern | OFFEN |
| 104 | Web-Build, API-Smoke und Android-Build mit echtem Artefakt belegen | OFFEN |
| 105 | Upgrade-/Downgrade- und Refund-Nutzerpfad in Sandbox testen | OFFEN |
| 106 | Werbe-, Impressum-, Datenschutz- und Produktrechte prüfen | OFFEN |
| 107 | Attribution-Audit vor echtem Umsatz-Claim abschließen | OFFEN |
| 108 | Release-Notes und Recovery-Punkte pro Version generieren | OFFEN |
| 109 | Produktiver Rollout ausschließlich nach geprüften Freigaben durchführen | OFFEN |
| 110 | Alle 100 Sprints mit End-to-End-Nachweisen und offener Restliste bilanzieren | OFFEN |

## Abnahmeregeln

1. Alle Änderungen bleiben zunächst in einem PR-Branch mit grünen Qualitäts-Gates.
2. Echte Stripe-, Video-, Social- und Checkout-Aktionen nur mit passenden Berechtigungen, überprüften Daten und expliziter Freigabe.
3. Kein Merge bei fehlgeschlagenem TypeScript, Lint, Unit-Tests, Sicherheitsgate oder Secret-Scan.
4. CI ohne Web-/Android-/Provider-E2E beweist nur Codequalität, nicht tatsächliche Live-Funktion.
5. 24/7 ist auf Render Free kein garantierter SLO; separate Worker-/Cron-Zustellung und Live-Checks erforderlich.
6. Für jeden weiteren Sprint Commit, Tests, Betriebsgate und Status im Dokument aktualisieren.

Offene Risiken: reale Profitvalidierung, Kosten-Kohorten, Social-/Stripe-Berechtigungen, Publish-E2E, Android-APK und dauerhaft aktive Worker.
