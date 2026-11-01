# CyberSarah – mobile Betriebsbereitschaft (Sprint 21–30, 29.10.2026)

## Ziel
Design-4-Oberfläche mit nachprüfbarer Anzeige von **API- und Datenbank-Bereitschaft** ausstatten. Die Anzeigen beweisen ausdrücklich **nicht**, dass LLM-Provider, Monetarisierung, Android-Gerät, Stripe oder Agenten vollständig funktionieren.

## Nachweis und Grenzen
Der Client ruft anonym `GET /api/ready` an (nicht das prozessbasierte `/api/health`).
- **Bereit** (grün): HTTP 200, `ok === true`, `checks.database === true`
- **Eingeschränkt** (gelb): HTTP 503, `ok === false`, `checks.database === false`
- **Nicht erreichbar** (rot): sonstige Antwort, fehlendes JSON, Verbindungsfehler, Abbruch oder Timeout
- **Prüfe …** (neutral): noch kein Nachweis
- **Ungeprüft** (gelb): letztes Ergebnis ist mindestens 120 Sekunden alt oder Zeitstempel unplausibel

Alle Zustände sind deterministisch in `lib/mobile-readiness-logic.ts` definiert und getestet.

## Betriebsverhalten
- Request-Budget: 6 Sekunden Timeout; absolut auf 250–15000 ms begrenzt.
- Keine Authentifizierungsdaten, Cookies, Tokens oder Query-Parameter in den Prüfrequest. URL-Validierung erlaubt nur HTTP(S) ohne URL-Credentials.
- React Query keyt die Prüfung nach API-Basisadresse und verwaltet Cache/Fehler; kein wiederholtes Logging sensitiver Fehler.
- Polling alle 60 Sekunden, Frische-Tick alle 15 Sekunden. Bei Hintergrundzustand kein automatischer Poll; Vordergrund und Web-Reconnect dürfen erneut prüfen.
- Kopfzeile und Seitenmenü verwenden denselben Datenstand. Manuelles Prüfen über eine barrierefrei beschriftete Aktion, während eines Requests deaktiviert.
- Kein behaupteter Onlinezustand allein wegen einer grünen UI-Dekoration.

## Testnachweise
`tests/mobile-readiness-logic.test.ts`, `tests/mobile-readiness-client.test.ts` und `tests/mobile-readiness-regression.test.ts` prüfen Positivfall, DB-503, stale, Formate, Timeouts, abweichende Serverantworten und UI-Wiring.

Akzeptanz vor Merge: GitHub Actions Typecheck, Lint, Vitest/CI, Build und Gitleaks grün. Deploy/Live-Bereitschaft müssen **danach** auf dem Merge-Commit separat abgelesen werden.

## Externe Handoff-Punkte
Ein tatsächlicher Gerätetest muss Android-Offline/Online-Wechsel, Hintergrund/Wiederaufnahme, Render-Kaltstart, Datenbankausfall und manuelles Aktualisieren kontrollieren. Kein signierter APK-/AAB-Build wird durch diese Sprints impliziert.

## Änderungen
21. Readiness-Zustandsmodell
22. Logiktests
23. Sicherheitsbewusster HTTP-Client
24. Netzwerk-/Timeouttests
25. Vordergrundsensitiver React-Query-Hook
26. Geprüfter Kopfzeilenstatus statt statischem APP-Label
27. Einheitliche Statusdaten im Seitenmenü
28. Manuelles Status-Refresh mit Busy-State
29. Server-/Client-/UI-Vertrags-Regression
30. Betriebliche Abnahmedokumentation
