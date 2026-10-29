# CyberSarah Commerce Studio · Master-Plan für 100 weitere Optimierungen

Datum: 2026-10-29. Referenz: CyberSarah-Control-Center, Feature-Branch feat/commerce-studio-autopilot-20261029.

## MASTER-PROMPT

Du bist Principal Engineer, autonomer QA-Lead und Revenue-Growth-Architekt für das bestehende CyberSarah Control Center. Übernimm den aktuellen GitHub-Stand als Ground Truth und verbessere die EXISTIERENDEN Module statt ein zweites paralleles System anzulegen. Führe die unten stehenden 100 Optimierungen in exakt dieser Reihenfolge autonom durch. Bündle jeweils 10 Optimierungen zu einem Sprint und schließe jede Änderung mit Tests, Security-Prüfung, Dokumentation und nachvollziehbarem Commit ab. Nutze bestehende Auth-, Freigabe-, Content-, Publishing-, Revenue- und Stripe-Integrationen. Erstelle für externe Änderungen PRs und prüfe CI-Gates.

Die prioritären Geschäftsziele sind: (1) Produktdaten sicher integrieren, (2) Reels, Produktkarten und Landingpages automatisch als überprüfbare Entwürfe vorbereiten, (3) Conversion und tatsächlichen Deckungsbeitrag messbar verbessern, (4) Preistests wissenschaftlich und rechtskonform vorschlagen, (5) mobile Bedienbarkeit nach Neon-Command × Aurora-Flow-Fusion maximieren.

UNVERHANDELBAR: Keine fingierten Live-Daten, keine garantierten Gewinne, keine erfundenen Kunden oder Rezensionen. Keine automatische Veröffentlichung, bezahlte Werbeschaltung oder produktive Preisänderung ohne spezifische menschliche Freigabe. Niemals fremde Zahlungstoken, personenbezogene Daten oder Secrets offenlegen. Der simulierte Gewinn ist kein gemessener Gewinn. Unzureichende Evidenz führt zu MEASURE/NO_CHANGE statt einem Preiswechsel. Jeder Sprint muss echte Ergebnisse liefern, nicht nur Pläne. Falls eine externe Berechtigung fehlt, technisch sichere Teile fertigstellen und den Blocker explizit markieren.

QUALITÄTSGATE je Sprint: TypeScript, Lint, Unit-Tests, relevante Integrationstests, Auth/Mandanten-Schutz, Sicherheit, Build und dokumentiertes Resultat. Ein grüner Status gilt nur mit realen Tool-Ausgaben und einem überprüfbaren Commit. Bei Fehlern Ursache beheben, nicht schönschreiben; blockierte Tasks ausweisen, keine falschen Erfolgsmeldungen. Vor größeren Änderungen Recovery-Checkpoint anlegen. Nach Sprint 10 Abschlussbericht und reproduzierbare Artefakte liefern.

## Die 100 verbindlichen Optimierungen

### 01–10 · Produktdaten & Integrationen

1. Stripe-Produkte read-only und paginiert synchronisieren
2. Mehrfachimporte anhand stabiler Produkt-IDs verhindern
3. Produktbilder und Nutzungsrechte dokumentieren
4. Währung, Steuern und Bruttopreise korrekt trennen
5. Digitale und physische Produkte sauber unterscheiden
6. Produktvarianten und Abonnementintervalle modellieren
7. Affiliate-Angebote mit Disclosure-Status importieren
8. Produktvalidierung mit Pflichtfeld-Check implementieren
9. Quelle und Änderungszeit jedes Produktdatensatzes speichern
10. Katalog-Synchronisation mit 100 Testprodukten prüfen

### 11–20 · Content-Studio-Autopilot

11. Produktbrief zu standardisiertem Content-Paket normalisieren
12. Persona- und Zielgruppen-Matching aus Evidenz entwickeln
13. Produktkarten mit überprüfbaren Fakten erzeugen
14. Reel-Hooks A/B/C statt einer einzigen Variante erzeugen
15. Shotlist, Voiceover und Untertitel getrennt strukturieren
16. Verfügbare Media-Pipeline für echten Render nutzen
17. Landing-Copy als modulare Blöcke erzeugen
18. Bild-, Audio- und Markenrechte vor Render prüfen
19. Freigabe-Queue mit klarer Vorschau verknüpfen
20. Vollständige End-to-End-Testkampagne als Entwurf erzeugen

### 21–30 · Reels, Distribution & Publishing

21. Instagram-Exportformate und Seitenverhältnisse prüfen
22. TikTok-Exportformate und Seitenverhältnisse prüfen
23. Facebook-Reels-Metadaten und APIs prüfen
24. Plattformgerechte Untertitel und Safe Areas ergänzen
25. Automatische Thumbnails mit Marken-Vorlage erzeugen
26. Content-Serien und Redaktionskalender integrieren
27. Idempotente Publishing-Jobs mit Retry begrenzen
28. Plattform-Tokens ausschließlich serverseitig halten
29. Veröffentlichung nur nach sichtbarer Freigabe erlauben
30. Erfolg und Fehler über echte Plattform-IDs zurückmelden

### 31–40 · Landingpages & Conversion

31. Vorhandenes Landingpage-System inventarisieren
32. Landingblöcke mobil und barrierearm gestalten
33. CTA und Produktzuordnung mit stabiler Kampagnen-ID sichern
34. Sichtbare Preis- und Werbehinweise integrieren
35. Cookie-Einwilligung für optionale Messdienste prüfen
36. Varianten A/B per kontrolliertem Experiment ausliefern
37. Checkout-Weiterleitung auf erlaubte Ziele begrenzen
38. Ladezeit und Core Web Vitals optimieren
39. Funnel-Ereignisse mit Dubletten-Schutz erfassen
40. Landing-zu-Checkout-E2E-Test nachweisen

### 41–50 · Umsatzmessung & Gewinn

41. Attribution Content→Angebot→Kauf durchgehend vereinheitlichen
42. Stripe-Webhooks auf Doppelerfassung testen
43. Erstattungen als negative Erlöse korrekt abbilden
44. Produkt- und Kanal-Kostenzuordnung implementieren
45. Unbekannte Kosten niemals als Null ausgeben
46. Deckungsbeitrag nach Angebot und Kanal berechnen
47. MRR, Cash-Umsatz und Bestellungen sichtbar trennen
48. Kohorten-Churn und Retention aus realen Daten ableiten
49. LTV/CAC nur bei ausreichender Datenqualität ausweisen
50. Revenue-Kennzahlen anhand Testbuchungen gegenprüfen

### 51–60 · Preisautopilot & Optimierung

51. Preisuntergrenzen und Zielmargen konfigurierbar machen
52. Maximale Preisänderung pro Experiment begrenzen
53. Preisvarianten mit vollständiger Kostenrechnung simulieren
54. Preiselastizität nur aus randomisierten Testdaten schätzen
55. Konfidenzintervalle und Mindeststichproben durchsetzen
56. Deckungsbeitrag je Besucher als primäre Zielmetrik nutzen
57. Kundensegmente auf unfaire Unterschiede prüfen
58. Preisänderungen mit Freigabe und Audit-Trail versehen
59. Stripe-Preiswechsel ohne Bestandsabo-Bruch konzipieren
60. Preisrollout und Revert in Sandbox E2E testen

### 61–70 · Autonomie & Orchestrierung

61. Commerce-Loop in bestehende zentrale Orchestrierung einordnen
62. Je Produkt ein Tageslimit für neue Entwürfe erzwingen
63. KI-Modell-Quota vor jedem Lauf prüfen
64. Fallback auf konfigurierte LLM-Provider testen
65. Verteilte Prozesssperren und Idempotenz stärken
66. Pending-Queue vor Überlauf schützen
67. Fehlschläge sichtbar klassifizieren statt verstecken
68. Pause, Fortsetzen und Kill-Switch mobil anbieten
69. Manuelle und automatische Läufe sauber unterscheiden
70. Nach Neustart keine doppelten externen Aktionen auslösen

### 71–80 · KI-Intelligenz & Tests

71. Content-Qualität mit überprüfbaren Rubriken bewerten
72. Halluzinierte Produktversprechen automatisch markieren
73. Video-Hooks mit echten View-/CTR-Signalen vergleichen
74. Creative-Fatigue-Erkennung integrieren
75. Messlücken als Aufgaben statt erfundene Daten ausgeben
76. Kampagnen-ROI und Grenzkosten nach Variante auswerten
77. Holdout-Experimente für inkrementellen Lift einsetzen
78. Angebot-zu-Zielgruppe-Matching mit Quellen verbessern
79. Regressionstests für Gewinn- und Preissimulation erweitern
80. Manipulation von Conversion-Events abwehren

### 81–90 · Mobile UX & Sicherheit

81. Gewählte Neon×Aurora-Fusion als einheitliches Theme umsetzen
82. Home-Schnellaktionen in Commerce Studio verlinken
83. Freigabe-Queue für Produkte, Reels und Preise vereinheitlichen
84. Große Touch-Ziele und barrierearme Kontraste sicherstellen
85. Flackernde Animationen entfernen und Reduce-Motion beachten
86. Loading-, Empty-, Offline- und Error-Zustände testen
87. Mandanten- und Admin-Rechte konsequent prüfen
88. Datenschutz, Löschfristen und Exportmöglichkeiten verifizieren
89. Geltende Werbe-, Verbraucher- und Plattformregeln prüfen
90. Android-Gerätetest für die Hauptabläufe durchführen

### 91–100 · Deployment, Betrieb & Verkauf

91. CI-TypeScript-, Lint- und Vitest-Gates durchsetzen
92. Publishing-/Preis-Sandbox E2E erfolgreich ausführen
93. Realistische Lasttests für Queue und Provider durchführen
94. Gesamte Änderungsserie in logisch prüfbare PRs gliedern
95. Rollback, Backup und Reproduzierbarkeit dokumentieren
96. Backend-Health und Betriebsmetriken überwachen
97. Web-Release mit Live-Smoke-Test nachweisen
98. Android-APK bauen und auf Gerät starten
99. Produkt-Demo und Verkaufsmaterial ohne falsche Zahlen erstellen
100. Abschlussbericht mit Beweisen, verbleibenden Blockern und nächsten Prioritäten liefern

## Abnahmekriterien

- 100 Aufgaben wurden technisch geprüft, für jede existiert ein überprüfbarer Status DONE/BLOCKED/DEFERRED.
- Produktimport aus Stripe ist idempotent und verändert Live-Preise nicht unbemerkt.
- Neue Content-Assets liegen vor Freigabe in der bestehenden Draft-Queue.
- Bei fehlenden Kosten oder zu kleiner Stichprobe bleibt Preisautopilot bei NO_CHANGE.
- Es gibt echte CI-/E2E-Nachweise und eine belastbare Android-/Web-Freigabe, sonst ausdrücklich BLOCKED.
- Output: Commit-SHAs, PR-Links, Testprotokolle, Screenshots, offene Risiken und nächste sinnvolle Schritte.