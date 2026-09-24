# Sprint 345 — Offline-Zustaende (Serie G: Mobile-Politur, 25.09.2026)

## Ziel
Konnektivitaets-Uebergaenge auf Geraeteseite ehrlich steuern: ein einzelner
Verbindungs-Blip (Tunnel, U-Bahn) darf die Anzeige nicht kippen, ein echter
Reconnect muss die betroffenen Bildschirme GENAU EINMAL auffrischen und die
wartenden Offline-Actions (Sprint 48) fortsetzen — ohne stilles Raten.

## Umsetzung (`lib/offline-connectivity-logic.ts`, 6 Tests)
- **Entprellung** (`debounceConnectivity`): erst 3 identische Samples in
  Folge ergeben "online"/"offline"; alles andere bleibt ehrlich "unsicher".
- **Reconnect-Plan** (`planReconnect`): nur beim echten Uebergang offline →
  online werden Bildschirme dedupliziert aufzufrischen (kein Doppel-Refresh),
  die Queue fortgesetzt und ein transparentes Banner gezeigt ("Wieder online
  nach X Min. — N Offline-Aktion(en) werden jetzt ausgefuehrt.").
- **Offline-Banner** (`offlineBannerText`): nur im stabilen Offline-Zustand;
  Dauer wird nie aufgerundet (floor), Herkunft der Daten offen benannt.
- **Queue-Resume** (`shouldResumeQueue`): startet NUR bei stabilem Online —
  "unsicher" wartet weiter (kein halber Push, Sprint 48 Konflikt-Risiko).
- **Diagnose-Uebersicht** (`describeConnectivity`): Zustand, Dauer und
  wartende Aktionen fuer Support-/Diagnose-Ansichten.

## Grenzen (bewusst)
Kein NetInfo-Hook in der UI gebaut — dieser Sprint liefert die reine
Entscheidungslogik; die Geraet-Anbindung (NetInfo-Subscription → Samples)
folgt mit dem UI-Politur-Sprint der Serie. Die Offline-Datenzustaende selbst
(Cache-Servierung, Alters-Labels) sind seit Sprint 119 vorhanden und werden
von dieser Logik ergaenzt, nicht ersetzt.
