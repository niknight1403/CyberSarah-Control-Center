# Commerce Studio – belastbarer Ausfuehrungsstatus

Stand: 2026-10-29; Entwicklungsbranch feat/commerce-studio-autopilot-20261029; PR #130 (Draft).

**WICHTIG:** `CODE` bedeutet Implementierung im PR, nicht Produktionsabnahme oder reale E2E-Verifikation. `PARTIAL` bedeutet nachweisbar nur ein Teil der geforderten Funktion. `OPEN` bedeutet ohne neuen belegbaren Abschluss in diesem Branch. Es werden keine 100 gruene Sprints behauptet.

## Konkrete Nachweise

- CI vor der letzten Medienuebergabe: TypeScript, Lint, Unit-Tests erfolgreich (GitHub Actions Run 40950806176).
- Stripe-Katalog: paginierte Read-only-Abfrage, Dubletten-Schutz, Entwurfsimport, Herkunft/Waehrung/Steuerhinweise/Bildrechte.
- Content: 3 Hooks, strukturiert validierte 15–30-s-Szenen, Untertitel-Asset, Claim-Quality-Gate, Medienuebergabe, erneute Renderfreigabe.
- Preis: keine produktive Preis-API, statistisch vorsichtige Test-Vorschlaege, fehlende Kosten = unbekannt.
- Vorliegende Grenzen: keine Live-Stripe-Import-E2E, keine Plattform-Veröffentlichung, kein Android-Geraetenachweis, kein Web-Release dieses Branches.

## Alle 100 Aufgaben und Status

| Nr. | Optimierung | Stand |
|---:|---|---|
| 1 | Stripe-Produkte read-only und paginiert synchronisieren | PARTIAL |
| 2 | Mehrfachimporte anhand stabiler Produkt-IDs verhindern | CODE |
| 3 | Produktbilder und Nutzungsrechte dokumentieren | PARTIAL |
| 4 | Währung, Steuern und Bruttopreise korrekt trennen | PARTIAL |
| 5 | Digitale und physische Produkte sauber unterscheiden | PARTIAL |
| 6 | Produktvarianten und Abonnementintervalle modellieren | PARTIAL |
| 7 | Affiliate-Angebote mit Disclosure-Status importieren | OPEN |
| 8 | Produktvalidierung mit Pflichtfeld-Check implementieren | CODE |
| 9 | Quelle und Änderungszeit jedes Produktdatensatzes speichern | CODE |
| 10 | Katalog-Synchronisation mit 100 Testprodukten prüfen | CODE |
| 11 | Produktbrief zu standardisiertem Content-Paket normalisieren | PARTIAL |
| 12 | Persona- und Zielgruppen-Matching aus Evidenz entwickeln | OPEN |
| 13 | Produktkarten mit überprüfbaren Fakten erzeugen | PARTIAL |
| 14 | Reel-Hooks A/B/C statt einer einzigen Variante erzeugen | CODE |
| 15 | Shotlist, Voiceover und Untertitel getrennt strukturieren | CODE |
| 16 | Verfügbare Media-Pipeline für echten Render nutzen | PARTIAL |
| 17 | Landing-Copy als modulare Blöcke erzeugen | PARTIAL |
| 18 | Bild-, Audio- und Markenrechte vor Render prüfen | PARTIAL |
| 19 | Freigabe-Queue mit klarer Vorschau verknüpfen | CODE |
| 20 | Vollständige End-to-End-Testkampagne als Entwurf erzeugen | OPEN |
| 21 | Instagram-Exportformate und Seitenverhältnisse prüfen | OPEN |
| 22 | TikTok-Exportformate und Seitenverhältnisse prüfen | OPEN |
| 23 | Facebook-Reels-Metadaten und APIs prüfen | OPEN |
| 24 | Plattformgerechte Untertitel und Safe Areas ergänzen | OPEN |
| 25 | Automatische Thumbnails mit Marken-Vorlage erzeugen | OPEN |
| 26 | Content-Serien und Redaktionskalender integrieren | OPEN |
| 27 | Idempotente Publishing-Jobs mit Retry begrenzen | OPEN |
| 28 | Plattform-Tokens ausschließlich serverseitig halten | OPEN |
| 29 | Veröffentlichung nur nach sichtbarer Freigabe erlauben | OPEN |
| 30 | Erfolg und Fehler über echte Plattform-IDs zurückmelden | OPEN |
| 31 | Vorhandenes Landingpage-System inventarisieren | OPEN |
| 32 | Landingblöcke mobil und barrierearm gestalten | OPEN |
| 33 | CTA und Produktzuordnung mit stabiler Kampagnen-ID sichern | OPEN |
| 34 | Sichtbare Preis- und Werbehinweise integrieren | OPEN |
| 35 | Cookie-Einwilligung für optionale Messdienste prüfen | OPEN |
| 36 | Varianten A/B per kontrolliertem Experiment ausliefern | OPEN |
| 37 | Checkout-Weiterleitung auf erlaubte Ziele begrenzen | OPEN |
| 38 | Ladezeit und Core Web Vitals optimieren | OPEN |
| 39 | Funnel-Ereignisse mit Dubletten-Schutz erfassen | OPEN |
| 40 | Landing-zu-Checkout-E2E-Test nachweisen | OPEN |
| 41 | Attribution Content→Angebot→Kauf durchgehend vereinheitlichen | PARTIAL |
| 42 | Stripe-Webhooks auf Doppelerfassung testen | OPEN |
| 43 | Erstattungen als negative Erlöse korrekt abbilden | PARTIAL |
| 44 | Produkt- und Kanal-Kostenzuordnung implementieren | PARTIAL |
| 45 | Unbekannte Kosten niemals als Null ausgeben | PARTIAL |
| 46 | Deckungsbeitrag nach Angebot und Kanal berechnen | PARTIAL |
| 47 | MRR, Cash-Umsatz und Bestellungen sichtbar trennen | OPEN |
| 48 | Kohorten-Churn und Retention aus realen Daten ableiten | OPEN |
| 49 | LTV/CAC nur bei ausreichender Datenqualität ausweisen | OPEN |
| 50 | Revenue-Kennzahlen anhand Testbuchungen gegenprüfen | OPEN |
| 51 | Preisuntergrenzen und Zielmargen konfigurierbar machen | PARTIAL |
| 52 | Maximale Preisänderung pro Experiment begrenzen | CODE |
| 53 | Preisvarianten mit vollständiger Kostenrechnung simulieren | PARTIAL |
| 54 | Preiselastizität nur aus randomisierten Testdaten schätzen | OPEN |
| 55 | Konfidenzintervalle und Mindeststichproben durchsetzen | CODE |
| 56 | Deckungsbeitrag je Besucher als primäre Zielmetrik nutzen | PARTIAL |
| 57 | Kundensegmente auf unfaire Unterschiede prüfen | OPEN |
| 58 | Preisänderungen mit Freigabe und Audit-Trail versehen | OPEN |
| 59 | Stripe-Preiswechsel ohne Bestandsabo-Bruch konzipieren | OPEN |
| 60 | Preisrollout und Revert in Sandbox E2E testen | OPEN |
| 61 | Commerce-Loop in bestehende zentrale Orchestrierung einordnen | OPEN |
| 62 | Je Produkt ein Tageslimit für neue Entwürfe erzwingen | CODE |
| 63 | KI-Modell-Quota vor jedem Lauf prüfen | OPEN |
| 64 | Fallback auf konfigurierte LLM-Provider testen | OPEN |
| 65 | Verteilte Prozesssperren und Idempotenz stärken | PARTIAL |
| 66 | Pending-Queue vor Überlauf schützen | CODE |
| 67 | Fehlschläge sichtbar klassifizieren statt verstecken | OPEN |
| 68 | Pause, Fortsetzen und Kill-Switch mobil anbieten | OPEN |
| 69 | Manuelle und automatische Läufe sauber unterscheiden | OPEN |
| 70 | Nach Neustart keine doppelten externen Aktionen auslösen | OPEN |
| 71 | Content-Qualität mit überprüfbaren Rubriken bewerten | PARTIAL |
| 72 | Halluzinierte Produktversprechen automatisch markieren | CODE |
| 73 | Video-Hooks mit echten View-/CTR-Signalen vergleichen | OPEN |
| 74 | Creative-Fatigue-Erkennung integrieren | OPEN |
| 75 | Messlücken als Aufgaben statt erfundene Daten ausgeben | OPEN |
| 76 | Kampagnen-ROI und Grenzkosten nach Variante auswerten | OPEN |
| 77 | Holdout-Experimente für inkrementellen Lift einsetzen | OPEN |
| 78 | Angebot-zu-Zielgruppe-Matching mit Quellen verbessern | OPEN |
| 79 | Regressionstests für Gewinn- und Preissimulation erweitern | CODE |
| 80 | Manipulation von Conversion-Events abwehren | OPEN |
| 81 | Gewählte Neon×Aurora-Fusion als einheitliches Theme umsetzen | OPEN |
| 82 | Home-Schnellaktionen in Commerce Studio verlinken | CODE |
| 83 | Freigabe-Queue für Produkte, Reels und Preise vereinheitlichen | PARTIAL |
| 84 | Große Touch-Ziele und barrierearme Kontraste sicherstellen | PARTIAL |
| 85 | Flackernde Animationen entfernen und Reduce-Motion beachten | PARTIAL |
| 86 | Loading-, Empty-, Offline- und Error-Zustände testen | OPEN |
| 87 | Mandanten- und Admin-Rechte konsequent prüfen | PARTIAL |
| 88 | Datenschutz, Löschfristen und Exportmöglichkeiten verifizieren | OPEN |
| 89 | Geltende Werbe-, Verbraucher- und Plattformregeln prüfen | OPEN |
| 90 | Android-Gerätetest für die Hauptabläufe durchführen | OPEN |
| 91 | CI-TypeScript-, Lint- und Vitest-Gates durchsetzen | PARTIAL |
| 92 | Publishing-/Preis-Sandbox E2E erfolgreich ausführen | OPEN |
| 93 | Realistische Lasttests für Queue und Provider durchführen | OPEN |
| 94 | Gesamte Änderungsserie in logisch prüfbare PRs gliedern | OPEN |
| 95 | Rollback, Backup und Reproduzierbarkeit dokumentieren | OPEN |
| 96 | Backend-Health und Betriebsmetriken überwachen | OPEN |
| 97 | Web-Release mit Live-Smoke-Test nachweisen | OPEN |
| 98 | Android-APK bauen und auf Gerät starten | OPEN |
| 99 | Produkt-Demo und Verkaufsmaterial ohne falsche Zahlen erstellen | OPEN |
| 100 | Abschlussbericht mit Beweisen, verbleibenden Blockern und nächsten Prioritäten liefern | OPEN |

## Abnahme

1. Fuer CODE/PARTIAL CI und Regressionstestbeleg am finalen Commit nachhalten.
2. Fuer alle OPEN-Punkte eigene Implementierung mit Audit, Tests und/oder reale Integration benoetigt.
3. Kein Merge, Deploy und keine APK-Fertigmeldung vor den notwendigen Qualitaets- und Geraetepruefungen.
4. Ohne echte Auftragnehmer-/Provider-Freigabe weder Live-Preiswechsel noch Publishing, Ad-Spend oder Stripe-Write.
