# Sprint 47 Abschlussbericht

Datum: 2026-09-06
Ziel-Repository: `niknight1403/CyberSarah-Control-Center`

## Umfang

Sprint 47 bindet die Audit-Rotation aus Sprint 37 an den externen Audit-Service (`external-action-audit-service`) an. Laut Roadmap gilt: Der Service nutzt die Rotation; der Export bleibt tokenfrei und zählt Redaktionen nachvollziehbar.

| Bereich | Datei | Inhalt |
|---|---|---|
| Store-Modul | `lib/external-audit-store-logic.ts` | `createRotatingAuditStore`, `recordAuditEvent` (zeichnet auf, ruft den optionalen Transport und rotiert sofort über die geprüfte Sprint-37-Logik), `auditEntryFromEvent` (bestimmtes Mapping), `exportStoreAudit` (tokenfreier Export mit Redaktionszähler) |
| Service-Anbindung | `lib/external-action-audit-service.ts` | `withRotation(rotationConfig)` liefert einen an die Rotation gebundenen Recorder (`record`, `export`, `store`); bestehende Exporte bleiben unverändert |
| Tests | `tests/external-audit-store-logic.test.ts` | 9 deterministische Tests: Mapping, Transport, Limit-Rotation, Altersfenster, ungültige Konfigurationen, Tokenfreiheit des Exports, Service-Integration, deterministische Exporte, Metadaten-Sanitisierung |

## Umsetzung im Detail

- **Rotation bei jeder Aufzeichnung**: Jedes aufgezeichnete Ereignis wird sofort über `rotateAuditLog` geführt — Einträge jenseits des Limits und außerhalb des Altersfensters werden entfernt, jüngste haben Vorrang. Die Regeln stammen unverändert aus Sprint 37.
- **Zwei stufige Sanitisierung**: Der Service redigiert sensible Metadaten-Schlüssel beim Ereignis (`[REDACTED]`), der Export entfernt verbleibende sensible Schlüssel vollständig und redigiert freie Textwerte (`[redigiert]`).
- **Nachvollziehbare Redaktionen**: `redactedFieldCount` zählt entfernte Schlüssel und redigierte Werte; im Testfall 1 + 1 = 2.
- **Unveränderte Basis**: Die bestehende Service-API (`create`, `sanitize`, `record`) bleibt vollständig erhalten; `withRotation` ist rein additive Anbindung.

## Validierung

| Prüfung | Ergebnis |
|---|---|
| TypeScript `npx tsc --noEmit` | Erfolgreich |
| Vitest `pnpm test` | 45 Testdateien, 223 Tests bestanden (44 Dateien / 214 Tests vor Sprint 47) |
| Server-Build `pnpm build` | Erfolgreiche Ausführung |
| Secret-Scan der geänderten Dateien | Erfolgreich |

## Anschluss

Sprint 48 überführt den Backoff-Plan in die Offline-Warteschlange (`offline-action-logic`), siehe `NEXT_STEPS.md`.
