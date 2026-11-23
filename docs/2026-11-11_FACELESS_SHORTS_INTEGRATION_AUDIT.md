# Faceless Shorts Engine — Integrationsaudit

**Datum:** 2026-11-11  
**Repository:** `niknight1403/CyberSarah-Control-Center`  
**Ziel:** Die Faceless-Shorts-/Reels-Funktion in die bestehende CyberSarah-Plattform integrieren, ohne parallele Apps, Datenbanken, Billing- oder Publishing-Systeme aufzubauen.

## 1. Verifizierter Bestand

| Fähigkeit | Vorhandene Implementierung | Einordnung |
|---|---|---|
| Mobile/Web-App | Expo Router, React Native, TypeScript | Wiederverwenden |
| Authentifizierung | bestehender tRPC-Auth-Kontext und `openId` | Wiederverwenden |
| Datenbank | PostgreSQL/Neon + Drizzle | Kein Prisma-Zweitstack |
| KI-Routing | bestehendes Multi-Provider-Routing | Für Skript-/Prompt-Generierung verwenden |
| Faceless-Channel-Planung | `lib/faceless-channel-logic.ts`, `server/faceless-channel-service.ts` | Bereits vorhanden |
| Content-Freigabe | `draftQueue` mit Pending/Approved/Rejected | Bestehendes Human Gate |
| Channel-Autopilot | `server/channel-autopilot.ts` | Nicht duplizieren |
| TTS | `server/tts.ts`, `lib/tts-logic.ts` | Bereits vorhanden (Edge TTS) |
| Szenenmanuskript | `lib/scene-script-logic.ts` | Bereits vorhanden |
| Szenenbilder | `server/image-generation.ts` | Bereits vorhanden |
| Video-Assembly | `server/media-pipeline.ts`, `lib/video-assembly-logic.ts` | FFmpeg, 1080p, Untertitel |
| Medienoberfläche | `app/(tabs)/media-studio.tsx` | Bestehende UI erweitern |
| Render-Queue-Logik | `lib/render-queue-logic.ts` | Vorhandene Logik prüfen und anbinden |
| Social Publishing | `publishingJobs`, `server/publishing-router.ts` | Bestehenden Publisher verwenden |
| Monetarisierung | Stripe-/Revenue-OS-Integration | Keine zweite Billing-Implementierung |

## 2. Verifizierte Grenzen

1. Die Faceless-Channel-Engine materialisiert Content-Pläne und plattformspezifische Short-Drafts in `draftQueue`. Das ist noch nicht gleichbedeutend mit einem fertig gerenderten Video.
2. Die Medienpipeline verarbeitet freigegebenen Quelltext über Szenenmanuskript, TTS, Szenenbilder und FFmpeg zu MP4 mit Untertiteln.
3. Der Medien-Router verlangt eine ausdrückliche Freigabe. Diese Schranke bleibt bestehen.
4. Die aktuelle Medienpipeline gibt das MP4 als Data-URL zurück und cached Base64-Daten in den bestehenden Model-Router-Settings. Das ist kein belastbarer, langlebiger Medien-Artefaktspeicher für eine skalierende SaaS-Produktion.
5. Der bestehende Channel Autopilot darf intern planen und Drafts erstellen. Externes Publishing, Ausgaben, Affiliate-Anmeldungen und Preisänderungen bleiben explizit freigabepflichtig.
6. Die vorhandene Pipeline erzeugt noch keinen nachgewiesenen vollständigen, idempotenten Ablauf „Nische/Thema → KI-Skript → Voice/Visuals → dauerhaft gespeichertes MP4 → Freigabe → plattformspezifisches Publishing → verifizierte Attribution“.

## 3. Zielarchitektur ohne Duplikate

```text
Faceless Channel / Studio UI
          |
          v
facelessChannel tRPC router
          |
          v
Draft Queue (bestehender Human Gate)
          |
          | explizite Freigabe
          v
Production Orchestrator
   |      |       |       |
   v      v       v       v
Research Script  TTS    Visuals
          \       |       /
           \      v      /
             FFmpeg Render
                   |
                   v
       Persistent Media Artifact Store
                   |
                   v
       Quality Gate + Preview
                   |
            explizite Freigabe
                   |
                   v
      Existing Publishing Service
                   |
                   v
     Platform Evidence + Attribution
                   |
                   v
        Existing Revenue OS
```

## 4. Umsetzungsreihenfolge

### Sprint 1 — Integrationsaudit (dieses Dokument)
- Bestehende Komponenten und Verträge erfasst.
- Keine neue Datenbank, kein zweites Billing, kein paralleler Publisher.
- Produktionslücken klar abgegrenzt.

### Sprint 2 — Persistente Video-Artefakte
- Storage-Adapter mit S3-kompatiblem Backend und lokalem Testadapter.
- Speicherung von MP4, Thumbnail, Untertiteln, Szenenmanifest und Lizenzmetadaten.
- Keine Base64-MP4-Payloads als dauerhafte Datenbank- oder KV-Ablage.
- Signed URLs, Größenlimits, MIME-Prüfung, Retention und Löschpfad.
- Tests für fehlgeschlagene Uploads, Wiederholungen und Zugriffstrennung.

### Sprint 3 — Draft-to-Render Orchestrierung
- Nur explizit freigegebene Content-Drafts werden renderbar.
- Idempotente Job-IDs und persistente Checkpoints pro Stufe.
- Wiederaufnahme nach Worker-Abbruch ohne doppelte TTS-/Bildkosten, soweit Provider-Caches dies ermöglichen.
- Echte Statuswerte statt künstlichem Fortschritt.

### Sprint 4 — Script-to-Short Generator
- KI-Skript mit Hook, Szenen, Voiceover-Text, Visual-Prompts und CTA.
- Fakten-/Quellenprüfung, Marken-/Nischenregeln, Dauer- und Plattformvalidierung.
- Kostenbudget und Provider-Cascade pro Produktionsstufe.
- Der Generator erstellt zunächst nur einen Pending-Draft.

### Sprint 5 — Mobile Studio Integration
- Draft auswählen, Skript bearbeiten, Stimme und Stil wählen.
- Rendern erst nach bewusster Freigabe.
- Vorschau, Download und Qualitätsbericht aus persistenten Artefakten.

### Sprint 6 — Publishing-Integration
- Bestehenden Publishing-Service verwenden.
- Plattformberechtigungen, Tokenstatus, Formate und Upload-Limits vorab prüfen.
- Geplantes/veröffentlichtes Ergebnis anhand externer Plattform-IDs verifizieren.
- Keine Erfolgsmeldung allein aufgrund eines angenommenen API-Aufrufs.

### Sprint 7 — Billing und Kostenwahrheit
- Bestehende Stripe-/Revenue-OS-Logik erweitern.
- Credits und Kosten je Job transaktionssicher erfassen.
- Keine neue Subscription-Tabelle und keine parallele Stripe-Webhooksuite.
- Unit-Economics anhand gemessener Provider- und Renderkosten berechnen.

## 5. Abnahmekriterien für den ersten End-to-End-Release

- Ein Thema kann einen echten, editierbaren Skript-Draft erzeugen.
- Ein Mensch kann den Draft prüfen und ausdrücklich freigeben.
- Der freigegebene Draft erzeugt genau einen nachvollziehbaren Renderjob.
- Voiceover, Visuals, Untertitel und MP4 werden tatsächlich erzeugt.
- Das MP4 wird dauerhaft gespeichert und über einen autorisierten Download bereitgestellt.
- Qualitätsprüfung und Fehlerursachen sind sichtbar.
- Publishing bleibt ein separater, ausdrücklich freizugebender Schritt.
- Veröffentlichungen werden anhand echter Plattformantworten verifiziert.
- Credits und variable Kosten werden nachvollziehbar gebucht.
- TypeScript, Tests, Security-Checks und CI sind grün.

## 6. Sicherheits- und Produktregeln

- Keine Veröffentlichung ohne ausdrückliche Freigabe.
- Keine erfundenen Views, Leads, Umsätze, Partnerschaften oder Erfolgsquoten.
- Nur lizenzierte oder selbst erstellte Assets; Lizenzquelle je Asset protokollieren.
- Synthetische Stimmen nur mit zulässiger Nutzung; Voice Cloning nur mit dokumentierter Einwilligung.
- Social Tokens verschlüsselt speichern und nie an Clients zurückgeben.
- Pro Organisation/User strikt autorisieren; keine fremden Drafts oder Medienartefakte ausliefern.
- Provider-Timeouts, Rate Limits und Kostenlimits müssen fail-closed behandelt werden.

## 7. Explizit nicht Teil dieses Audits

Dieses Dokument behauptet weder, dass ein neuer Render-Worker, S3-Speicher, vollständige automatische Skriptgenerierung, Social-Publishing-Zugang oder echte Umsatzgenerierung bereits produktiv eingerichtet sind, noch dass die End-to-End-Abnahme bestanden wurde.
