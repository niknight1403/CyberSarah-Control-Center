# Sprint-Plan 284–383 (Autonome 100-Sprint-Mission)

**Datum:** 24.09.2026 · **Auftrag:** 100 Sprints autonom nacheinander (Niko, 24.09.), Meldung erst wenn alles grün.
**Baseline:** 183 Testdateien, 1560 Tests grün auf `d15bf5c` · Produktion deployed.

## Arbeitsregeln (für jeden Batch-Worker)

1. Ein Batch = 5 Sprints. Vor jedem Sprint: `docs/SPRINT_TRACKER.md` lesen — der nächste
   nicht abgeschlossene Sprint ist dran. Durchnummeriert und sequenziell, nie überspringen.
2. Jeder Sprint: pure Logik zuerst, dann Integration, dann Tests. Ein Sprint gilt als
   fertig, wenn `npx vitest run` komplett grün ist und `npx tsc --noEmit` keine NEUEN
   Fehler wirft. Kein Sprint ohne Test.
3. Ehrlichkeit: keine Funktionsversprechen, die der Code nicht hält. Ehrlichkeits-Grenzen
   wie in früheren Sprint-Dokus dokumentieren. Keine Platzhalter, keine toten Buttons.
4. Am Ende des Batch: Tracker aktualisieren (Sprints abhaken + Notiz), CHANGELOG.md-
   Eintrag pro Sprint-Serie, Doku `docs/<datum>_SPRINTS_<n>_<slug>.md` mit
   Ehrlichkeits-Grenzen. NICHT committen, NICHT pushen — das macht der Koordinator.
5. Repo liegt im Sandbox-Ordner `CCC`. Immer dort arbeiten, Arbeitskopie sauber halten.
6. Wenn ein Sprint sich als zu groß erweist: ehrlich verkleinern und den Rest im Tracker
   als eigene Folgeaufgabe notieren — nie still verwerfen.

## Die 10 Serien (100 Sprints)

### Serie A · 284–293: Agent-Werkzeuge & Dev-Loop-Tiefe
284: Live-Preview-Zyklus Chat↔Preview (Statusanzeige, Verfolgung, kein Zustandsverlust)
285: Multi-File-Refactoring-Werkzeug für den Dev-Agenten (Transaktion, Rollback)
286: Dev-Agent: Code-Suche-Tool (grep-ähnlich, Syntax-Range-Extraktion)
287: Dev-Agent: Test-Runner-Tool (vitest einzelner Datei, Ergebnis-Zusammenfassung)
288: Iterations-Limits ehrlich: maximale Werkzeug-Iterationen pro Aufgabe dokumentiert + konfigurierbar
289: Werkzeug-Fehlerklassen: wiederholbar vs. fatal, ehrliche Retry-Semantik
290: Agent-Kontextfenster: Zusammenfassung vor Überlauf, nichts still verwerfen
291: Diff-Vorschau vor jedem Dev-Agent-Commit im Chat sichtbar
292: Autonome Entwicklung: Sprint-Ziele als GitHub-Issue (bestehende Tools nutzen)
293: Serie-A-Abschluss: Doku + Validierung + CHANGELOG

### Serie B · 294–303: Produkt-Politur & i18n
294: EN-Sprach-Toggle vollständig (UI-Strings beider Sprachen, Persistenz)
295: Onboarding v2: geführter erster Lauf (3 Schritte, ehrliche Erwartungen)
296: Template-Galerie erweitern (5+ Starter, Kategorie-Filter)
297: Chat-Leerer-Zustand: hilfreiche Starter-Prompts statt weißer Fläche
298: Fehlerbildschirme: sprechende Fallbacks statt rotem Diagnose-Overlay im Release-APK
299: Snackbar/Toast-System vereinheitlichen (eine Quelle, konsequentes Styling)
300: Milestone 300: Volle Regression, Startzeit-Messung, Regressionen beseitigen
301: Barrierefreiheit: Fokus-Ordnung, Kontrast-Audit der Kern-Screens
302: Dunkel/Hell-Theme-Konsistenz (Rest-Screens ohne Hardcoded-Farben)
303: Serie-B-Abschluss: Doku + Validierung + CHANGELOG

### Serie C · 304–313: Medien v2
304: Video BYO-Key: Anbieter-Key-Verwaltung in Settings (nie erfinden, prüfen, maskieren)
305: Audio-Pipeline: Stimmenauswahl pro Projekt (Edge-TTS-Stimmen, Vorschau)
306: Medien-Studio: Render-Warteschlange mit ehrlichem Fortschritt
307: Szenen-Skript-Editor: manuelle Nachbearbeitung des deterministischen Skripts
308: Bild-Generierung: Fallback-Kette (FLUX → Gradient) mit ehrlicher Ergebniskennzeichnung
309: Medien-Cache: Ablauf + Aufräumauftrag (Speicher ehrlich begrenzen)
310: Untertitel-Export (SRT aus Skript, Zeitmarken aus TTS-Dauer)
311: Medien-Studio: Batch-Export (mehrere Projekte, Fehlerfortsetzung)
312: Ergebnis-Verlauf: gerenderte Medien pro Nutzer mit Status
313: Serie-C-Abschluss: Doku + Validierung + CHANGELOG

### Serie D · 314–323: Umsatz-Reihe 2
314: Quota-Enforcement-Modus-Schalter im Admin (monitor ↔ enforce, Audit-Log)
315: Upgrade-Prompt-Komponente an allen Quota-Grenzen (einheitlich)
316: Stripe-Checkout-Rückweg: Erfolg/Abbruch-Seiten mit klarem Zustand
317: Abrechnungs-Screen: Rechnungshistorie aus Stripe (echte Daten)
318: Tier-Vergleichs-Screen (Lite/Pro/Expert mit ehrlichen Grenzen)
319: Testmodus-Kennzeichnung: Stripe-Test-Modus sichtbar markiert
320: Kündigungs-Flow: Abo-Kündigung in der App (Bestätigung + Konsequenzen)
321: MRR-Dashboard v2: Churn, Neukunden, Zahlungsverlauf aus Stripe
322: Ops-Alerts: Zahlungsausfälle an Admin (Zustellung verifizieren)
323: Serie-D-Abschluss: Doku + Validierung + CHANGELOG

### Serie E · 324–333: Zuverlässigkeit & Sicherheit
324: Observability: strukturierte Server-Logs mit Korrelations-ID
325: Rate-Limits: pro Route und Nutzer (echte Begrenzung)
326: DB-Sicherheits-Pass: RLS-Deckung verifizieren + Tests
327: Backup-Restore-Doku + Restore-Übung (beweisbar)
328: Crash-Reporting v2: clientseitige Fehler klassifizieren
329: Selbstheilungs-Pass: bekannte Muster mit automatischer Wiederherstellung
330: Dependency-Audit: riskante Bumps einzeln mit voller Regression
331: Geheimnis-Hygiene: Regex-Guards erweitern, Vault-Abdeckung
332: Health-Deep-Check: /api/ready prüft DB + Abhängigkeiten mit Timeouts
333: Serie-E-Abschluss: Doku + Validierung + CHANGELOG

### Serie F · 334–343: Integrationen
334: E-Mail-Integration v2: Anhänge, Vorlagen-Verwaltung
335: Kalender-Integration: Termine lesen/erstellen (Provider-abstrahiert)
336: Webhook-Eingang: nutzerdefinierte Webhooks mit Signatur-Prüfung
337: Export-Center: Datenexport (JSON/CSV) aller nutzer-eigenen Daten
338: Import-Wizard: strukturierter Import (Validierung vor Schreiben)
339: API-Keys für Nutzer: persönliche Schlüssel mit Scope-Begrenzung
340: API-Doku-Screen: eigene Endpunkte ehrlich erklärt
341: Slack/Discord-Ausgangs-Webhooks: Agent-Benachrichtigungen
342: Integrations-Diagnose: echter Probe-Call je Integration
343: Serie-F-Abschluss: Doku + Validierung + CHANGELOG

### Serie G · 344–353: Mobile-App-Politur
344: Navigation-Pass: Zurück-Verhalten, Deep-Links, Tab-Zustand
345: Offline-Zustände: klare Meldung statt stiller Fehler
346: Lade-Erlebnis: Skeletons statt Spinner-Wüsten auf Kern-Screens
347: Push-Benachrichtigungen: lokale Erinnerungen (ehrlich ohne FCM)
348: APK-Größe + Startzeit messen und verbessern
349: Android: Predictive Back + Rückck-Animationen
350: Tastatur-Handling: Chat-Eingabe, Formulare, kein Overlay-Verstecken
351: Tablet-Layout: Zwei-Spalten-Designs auf breiten Screens
352: App-Icon/Splash-Politur + Store-Screenshots-Doku erneuern
353: Serie-G-Abschluss: Doku + Validierung + CHANGELOG

### Serie H · 354–363: Admin & Ops
354: Admin-Dashboard v2: Systemzustand mit echten Metriken
355: Ops-Playbook-Screen: Incident-Abläufe als Checkliste
356: Feature-Flags: zentrale Flags mit Nutzer-Anteil
357: Nutzer-Verwaltung: Liste, Rollen, Suche
358: Audit-Log: administrative Aktionen nachvollziehbar
359: Deployment-Status-Screen: letzter Deploy, Commit, Health
360: Konfigurations-Screen: maskierte Umgebungs-Ansicht
361: Wartungsmodus: Ankündigung + klarer Sperrbildschirm
362: Log-Viewer im Admin: gefiltert, PII-maskiert
363: Serie-H-Abschluss: Doku + Validierung + CHANGELOG

### Serie I · 364–373: Agent-Intelligenz
364: Prompt-Versionierung + A/B-Vergleichsmetrik
365: Selbst-Kritik-Schritt: Lösung gegen Akzeptanzkriterien prüfen
366: Werkzeug-Auswahlstatistik: Nutzung messen, Nie-Nutzung ehrlich räumen
367: Gedächtnis-Konsolidierung v2: Wichtiges bleibt, Vermengtes ordnen
368: Aufgaben-Zerlegung: große Ziele in prüfbare Teilschritte
369: Fortschritts-Berichte: Agent meldet Zustand langer Aufgaben
370: Qualitäts-Tore: Akzeptanzkriterien vor Ausführung, Prüfung danach
371: Misserfolg-Analyse: fehlgeschlagene Läufe klassifizieren
372: Provider-Rotation v2: Qualitäts-/Kosten-Metriken je Provider
373: Serie-I-Abschluss: Doku + Validierung + CHANGELOG

### Serie J · 374–383: Finale & Release
374: Volle Regression + Test-Lücken schließen
375: Performance-Pass: Antwortzeiten messen, heißeste Pfade optimieren
376: Doku-Pass: README, OPERATIONS, Sprint-Dokus verlinkt und aktuell
377: CHANGELOG-Vollständigkeit seit 284
378: Security-Final: Serie-E-Befunde geschlossen
379: Staging-Smoke: Produktion-Rollout mit Health-Verifikation
380: APK-Final: beide APKs bauen, Kernflüsse abtesten
381: Release v2.6.0: Tag, Release-Notes, Assets verlinkt
382: 100-Sprint-Bilanz: ehrlicher Bericht erreicht/nicht erreicht
383: Abschluss-Validierung: alles grün — Tests, CI, Produktion, APK. Melden.

## Verlauf

Siehe `docs/SPRINT_TRACKER.md` (wird je Batch aktualisiert).
