# Sprint 119 — Offline-Pufferung des Daten-Hubs

**Datum:** 15.09.2026 · **Status:** Abgeschlossen — TypeScript sauber, 777/777 Tests grün, Server-Build erfolgreich

## Ziel

Letzte Dashboard-Daten lokal puffern und bei Server-Ausfall transparent als Offline-Daten servieren (Realgerät-Erkenntnis aus Sprint 107: ohne Serverkontakt zeigt die App leere Flächen).

## Umsetzung

### Reine Logik — `lib/offline-cache-logic.ts`

- **Umschlag (Envelope):** Schema-Version 1 + Abschnitt + ISO-Zeitstempel + Nutzdaten; pro Abschnitt eigene Keys (`cybersarah.offline-cache.v1.<section>`), niemals gemischt; leerer Abschnitt wirft ehrlich.
- **Strenge Validierung** (`parseOfflineCacheEnvelope`): ungueltiges JSON, falsche Schema-Version, falscher Abschnitt, Zeitstempel aus der Zukunft (Toleranz 2 Min für Uhrdrift) oder überschrittenes Alter (24 h) → Puffer wird verworfen statt geraten.
- **Alters-Labels:** kompakte deutsche Stufen („vor 45 Sek.", „vor 12 Min.", „vor 3 Std.", „vor 2 Tagen"), Zukunft fällt auf 0 Sek. zureck.
- **Anzeige-Zustand** (`resolveOfflineDataState`): klare Priorität **Live > Puffer > Fehler** — der Puffer wird nur bei Abfragefehler und niemals während des Ladevorgangs serviert; Fehlerzustände bleiben sichtbar, kein stilles Fake-Live.

### Hook — `hooks/use-offline-dashboard.ts`

- Erfolgreiche Live-Antworten werden asynchron gepuffert (normalisiert — identische Antworten werden nicht doppelt geschrieben); Schreibfehler sind nicht fatal, der Fallback fehlt dann ehrlich.
- Bei Abfragefehler wird der Puffer einmalig geladen und der strengen Validierung unterzogen; neuer Live-Erfolg setzt die Puffer-Anzeige zurück.
- `refresh()` triggert eine echte Neuabfrage — kein Fake-Refresh. Typ-Sicherheit über `inferRouterOutputs<AppRouter>` statt ReturnType-Konstruktion (tRPC v11).

### Integration — `app/(tabs)/dashboard.tsx`

Der Daten-Hub-Query läuft durch den Offline-Hook. Der Header zeigt bei Puffer-Betrieb transparent „Offline · Daten von vor 5 Min. · tippen zum Aktualisieren" (Tippen = echte Neuabfrage), sonst unverändert Live-Text.

## Tests (14 neu)

- Key-Normalisierung + ehrliches Werfen bei leerem Abschnitt.
- Umschlag-Roundtrip, Verwurfsregeln (JSON/Schema/Abschnitt/Zukunft/24 h-Grenze inkl. Toleranzfenster).
- Alters-Label-Stufen und Zukunftsanomalie.
- Anzeige-Zustand: Live schlägt Puffer, Puffer nur bei Fehler mit Label, Ladezustand wartet still, Fehler ohne Puffer bleibt sichtbar, Nicht-Error-Objekte werden sicher übersetzt.

## Ehrliche Grenzen (dokumentiert)

- Nur der Daten-Hub (Dashboard) ist gepuffert; die admin-only Abfragen (ops/memory/metering) bleiben bewusst live — sie haben Serverzustand als Quelle der Wahrheit.
- Kein automatischer Reconnect-Trigger auf Native (dafür bräuchte es NetInfo als neue Abhängigkeit) — stattdessen manuelle Aktualisierung per Tipp; die Query refetch bei App-Fokus bleibt über React-Query-Defaults aktiv.

## Nächste Schritte (Sprint 120)

Backup-Selbstbedienung: Admin-Panel für den Abruf der letzten Backups (Berechtigungs- und Abruflogik rein, Anzeige im Ops-Bereich).
