# Sprint 96 — Dashboard-Betriebswacht

**Status:** Erledigt (14.09.2026) · **Version:** v1.3.7 · **Scope:** Dashboard

## Ziel

Die bestehende zentrale Betriebsübersicht aus Sprint 56 wird für Administratoren direkt im Dashboard sichtbar. Damit sind die wichtigsten Betriebspfade ohne Wechsel in einen separaten Admin-Bereich auf einen Blick prüfbar.

## Umsetzung

`app/(tabs)/dashboard.tsx` ergänzt eine geschützte Kachel **„Betriebswacht (Admin)“**. Sie ruft `ops.overview` ausschließlich für Konten mit der Rolle `admin` auf und aktualisiert den Status höchstens einmal pro Minute. Angezeigt werden die Gesamtbewertung (grün, eingeschränkt, kritisch oder unbekannt), die priorisierte Fokusmeldung sowie die einzelnen Prüfpfade für API, Datenbank, Workspace-Service, KI-Chat und Metriken. Veraltete Messungen bleiben als „veraltet“ erkennbar.

Die bestehende `adminProcedure`-Absicherung des Ops-Routers bleibt unverändert. Standardnutzer erhalten keine Anfrage und sehen keine Admin-Telemetrie. Token, Endpoints und andere Geheimnisse werden nicht in die Oberfläche übernommen; die Handlungsanweisungen stammen aus der bereits tokenfreien Betriebslogik.

## Akzeptanzkriterien

- TypeScript-Check (`npm run check`) erfolgreich.
- Dashboard zeigt die Betriebswacht nur für Administratoren.
- Status, Fokusmeldung und Prüfpfade werden aus der bestehenden zentralen Ops-Übersicht bezogen.
- Keine neuen Secrets, Berechtigungen oder externen Konten erforderlich.

## Verifikation

Die vollständige Vitest-Suite und der Produktionsbuild werden nach der Implementierung ausgeführt. Ein Commit oder Push ist nicht Bestandteil dieses Arbeitsschritts und bleibt dem nächsten Release-Schritt vorbehalten.
