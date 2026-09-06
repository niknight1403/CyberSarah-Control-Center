# CyberSarah Control Center — Nächste geplante Schritte

Stand: 2026-09-06 (nach Abschluss der Sprints 32–41, Commit `bba1724`)

Diese Datei dokumentiert die geplante Weiterentwicklung nach Sprint 41. Die Sprints 42–51 schließen an die etablierte Arbeitsweise an: Jeder Sprint wird separat umgesetzt, getestet und committet. Im Vordergrund steht jetzt die Anbindung der in Sprint 32–40 entstandenen Logic-Module (`usage-budget`, `chat-compression`, `conflict-resolution`, `proposal-queue`, `change-snapshot`, `audit-rotation`, `provider-latency`, `changelog`, `retry-backoff`) an die bestehende Oberfläche und Infrastruktur.

## Sprint 42–51

| Sprint | Ziel | Akzeptanzkriterium |
|---|---|---|
| 42 | Nutzungsbudget in die Qualitätstafel einbinden | Die Qualitätstafel zeigt den verifizierten Budgetzustand (ok, warnung, erschöpft) mit tokenfreier Zusammenfassung; überschrittene Budgets sind sichtbar begründet. |
| 43 | Provider-Latenz-Ranking in den Verbindungstest integrieren | Jeder Verbindungstest zeichnet Latenzmessungen auf, zeigt Ranking und Fallback-Empfehlung; veraltete Messungen werden markiert. |
| 44 | Sync-Konfliktansicht im Workspace ergänzen | Die Datei-Diff-Ansicht zeigt die Konfliktklasse je Datei; nur als sicher bewertete Auflösungen sind automatisch ausführbar, echte Konflikte blockieren den Sync sichtbar. |
| 45 | Vorschlagswarteschlange im Agentenbereich anzeigen | Agenten-Vorschläge erscheinen priorisiert mit Zustand, Ablaufdatum und Duplikatschutz; Zustandsübergänge folgen der geprüften Zustandsmaschine. |
| 46 | Snapshot-Rollback in den Anwendungsfluss integrieren | Vor jeder Anwendung eines Vorschlags wird automatisch ein Snapshot erzeugt; „Rückgängig machen" stellt ausschließlich verifizierte Inhalte wieder her und ist nur einmal ausführbar. |
| 47 | Audit-Rotation an den Audit-Service anbinden | Der externe Audit-Service (`external-action-audit-service`) nutzt die Rotation; Export bleibt tokenfrei und zählt Redaktionen nachvollziehbar. |
| 48 | Backoff-Plan in die Offline-Warteschlange überführen | Die bestehende Offline-Queue (`offline-action-logic`) plant Wiederholungen mit Exponential-Backoff; Konflikte blockieren Wiederholungen, erschöpfte Versuche werden final abgelehnt. |
| 49 | Changelog-Generierung in den Release-Workflow einbinden | Der Release-Preflight erzeugt aus Conventional Commits ein redigiertes Changelog und hängt es an das Handoff-Artefakt an. |
| 50 | Chat-Kompression in die Verlaufspersistenz integrieren | Gespeicherte Entwicklungschats werden beim Überschreiten konfigurierbarer Grenzen deterministisch komprimiert; Verdauungseinträge bleiben stabil hashbar. |
| 51 | Gesamt-Regression, Release-Preflight und Abschluss | TypeScript, Tests, Build, Service-Syntax, Secret-Scan und Git-Status sind erfolgreich; Abschlussbericht liegt vor. |

## Detailplanung Sprint 45 — Vorschlagswarteschlange im Agentenbereich

Grundlage ist das in Sprint 35 verifizierte Modul `lib/proposal-queue-logic.ts` (9 deterministische Tests in `tests/proposal-queue-logic.test.ts`); die Oberflächenanbindung erfolgt in `app/(tabs)/agent.tsx`:

1. **Datenmodell**: Jeder Agenten-Vorschlag aus dem Entwicklungschat wird als `AgentProposal` geführt — mit Ziel-Pfad, Inhalts-Hash, Priorität (`low`, `normal`, `high`, `critical`), Erstellungs- und Ablaufzeitstempel sowie Status (`pending`, `review`, `applied`, `rejected`, `expired`).
2. **Queue-Bewertung**: `evaluateProposalQueue` übernimmt die Ordnung — abgelaufene Vorschläge werden deterministisch auf `expired` gesetzt, Duplikate (gleicher Ziel-Pfad und Inhalts-Hash) verworfen (der älteste Eintrag bleibt erhalten), Sortierung nach Priorität und dann Erstellungszeit, Überlauf verwirft die niedrigst priorisierten Einträge.
3. **Zustandsübergänge**: Bedienung ausschließlich über `transitionProposal` aus demselben Modul; die geprüfte Zustandsmaschine erlaubt `pending → review|rejected|expired`, `review → applied|rejected|expired`; angewendete, abgelehnte und abgelaufene Vorschläge sind endgültig — keine Sprünge oder Rückholungen.
4. **Anzeige im Agentenbereich**: Priorisierte Liste mit Status-Badge, Priorität, Ablaufdatum und Hinweisen auf verworfene Duplikate; abgelaufene Vorschläge bleiben sichtbar, sind aber nicht mehr anwendbar. Die Darstellung bleibt tokenfrei (keine Inhalte, Secrets oder Endpoints).
5. **Speichergrenze**: Das Warteschlangenlimit (`maxQueued`) wird konfigurierbar aus der bestehenden Studio-Konfiguration bezogen; die Bewertung bleibt deterministisch und damit testbar.

Akzeptanzkriterium (unverändert): Agenten-Vorschläge erscheinen priorisiert mit Zustand, Ablaufdatum und Duplikatschutz; Zustandsübergänge folgen der geprüften Zustandsmaschine.

## Manuelle Handoff-Punkte (bleiben Nutzeraktionen)

- Android-Publish und APK-Erzeugung über die Publish-Oberfläche anstoßen; das EAS-Buildkontingent ist extern verwaltet und kann aus der Sandbox nicht verbraucht werden.
- APK auf einem echten Android-Gerät installieren und Workspace-Service, Cloud-Key sowie LAN/VPN-Provider-Endpoints testen (kein `127.0.0.1` für Remote-Modelserver).
- Veröffentlichung im Google Play Store gemäß `PLAY_STORE_BEREITSCHAFT.md` prüfen und einreichen.

## Mittel- und langfristige Richtung (nach Sprint 51)

- Betriebserfahrung aus dem Realgerät-Test in die Provider-Routing-Logik zurückfließen lassen (Messwerte, Timeouts, Fallback-Schwellen).
- Monitoring über ntfy und strukturierte Healthchecks konsolidieren und Warnstufen in einer zentralen Betriebsansicht zusammenführen.
- Verschlüsselte Support- und Settings-Backups um die neuen Zustände (Budget, Latenz-Ranking, Snapshots) erweitern, sobald diese persistiert werden.
