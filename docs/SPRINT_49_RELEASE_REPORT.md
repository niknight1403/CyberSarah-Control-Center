# Sprint 49 — Abschlussbericht: Premium-Chatbereich und Admin-Autosetup

**Datum:** 07.09.2026
**Ziel:** Der Chatbereich erhält ein modernes, grafisch hochwertiges Design (Richtung „Dark Command Center"), und der Administrator muss nach dem Login nichts mehr manuell einrichten — alles Konfiguriernde wird autonom integriert.

## 1. Premium-Chatbereich (Design-Richtung A)

Neue Komponenten unter `components/chat/`:

| Komponente | Funktion |
| --- | --- |
| `chat-background.tsx` | Tiefes Navy-Schwarz mit expo-linear-gradient-Verlauf und zwei subtilen Leucht-Akzenten (Cyan, Violett) |
| `message-bubble.tsx` | Nachrichten mit Avatar (CS/HN), Absender-Label („Sarah · KI-Operations"), Zeitstempel, spruchgesteuerter Einblend-Animation (Reanimated `FadeInDown`) — Nutzer-Bubbles cyan-getönt rechts, Agent-Bubbles dunkle Glas-Karten mit Cyan-Akzent links |
| `typing-indicator.tsx` | Drei pulsierende Punkte statt Text-Placeholder während die KI analysiert |
| `chat-composer.tsx` | Pill-Eingabebereich: runde Icon-Werkzeugleiste (Anhängen, GitHub, Skills), Anhang-Chips mit Lösch-Icon, leuchtender runder Senden-Button mit Disabled-Zustand |

Darstellung-Logik in `lib/chat-presentation-logic.ts` (rein deterministisch, 10 Tests in `tests/chat-presentation-logic.test.ts`):

- `formatChatClock` — HH:MM (24h, führende Nullen)
- `formatChatDay` — Heute/Gestern/Wochentag mit deutschem Datum
- `shouldShowTimestamp` — Zeit unter 10-Minuten-Abstand
- `shouldShowDayDivider` — Tages-Trenner
- `senderLabelForRole`, `avatarInitialsForRole` — Labels und Avatar-Kürzel

`app/(tabs)/chat.tsx` wurde vollständig neu gestaltet bei unveränderter Logik: Provider-Auswahl, Attachments, Repository-Anbindung, Chat-Historie, Konnektoren- und Skill-Tabs blieben unangetastet. Nachrichten werden mit `timestampMs` versehen (session-transient; die persistierte Historie bleibt bewusst unverändert, fehlende Zeitstempel werden tolerierend versteckt). Die Liste scrollt automatisch ans Ende; Fehler erscheinen als Karte mit Warn-Icon.

## 2. Admin-Autosetup (Null-Konfiguration nach Login)

`lib/admin-autosetup-logic.ts` (8 Tests in `tests/admin-autosetup-logic.test.ts`):

- **Idempotent** über Versionsmarker (`ADMIN_AUTOSETUP_VERSION`), kein Doppel-Lauf
- **Provider-Entscheidung:** Ohne gespeicherten Provider (oder Provider ohne hinterlegten API-Key) wird automatisch der On-Server-Modus „managed" gesetzt — der Chat ist ohne jede Nutzereingabe bereit. Ein Provider mit funktionierendem Key bleibt unangetastet.
- **Defaults:** Branch `main`, Chat-Inhaltsschutz aktiv, Connector-Präferenzen (Workspace, GitHub, Provider) und Skill-Präferenzen (Agent, Diff, Qualität) initialisiert — kaputte gespeicherte Werte werden normalisiert statt übernommen
- **Bestandsschutz:** Repository, Workspace-URL und bewusste Nutzerauswahl werden nie überschrieben

`lib/use-admin-autosetup.ts` führt den Lauf still nach jedem Administrator-Login aus (`account.tsx` ruft `useAdminAutoSetup`); Fehler werden bewusst geschluckt — der Login bleibt in jedem Fall erfolgreich. Für Nicht-Administratoren passiert nichts.

## 3. Regression

- `tsc --noEmit`: sauber
- Vitest: **291/291 Tests grün** (273 Bestand + 18 neu)
- Server-Bundle (`npm run build`, esbuild): sauber, `node --check` OK
- Workspace-Service: Syntaxprüfung OK

## 4. Abgrenzungen

- Der EAS/Android-Build bleibt wie vereinbart manueller Handoff.
- Zeitstempel der Chat-Historie sind session-transient (Serialisierungsformat v1 unverändert, bewusst kein Formatbruch).
