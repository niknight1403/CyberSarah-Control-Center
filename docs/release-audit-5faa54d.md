# CyberSarah Control Center — Release Audit

## Status

Der Release-Stand ist **bereit für den Publish-Handoff**. Ein Produktions- oder APK-Publish wurde nicht automatisiert ausgelöst; dieser Schritt wird ausschließlich über die Management-Oberfläche gestartet.

| Prüfschritt | Ergebnis |
|---|---|
| TypeScript (`pnpm check`) | Erfolgreich |
| Vitest | 54 bestanden, 1 übersprungen |
| Workspace-Service-Syntax | Erfolgreich (`node --check`) |
| Git-Diff-Whitespace | Erfolgreich |
| GitHub-Workflow-Format | Erfolgreich |
| Agenten-E2E | Repository-Attach und Proposal-Antwort erfolgreich |
| Local-AI-Fallback | Ollama/LM Studio/Custom → Gemini getestet |
| Token-Leaks | Keine Schlüsselwerte in Audit-Ausgaben |
| Release-Commit | `5faa54d6a4ab074c5afda0f156769c116036bb95` |

## Provider- und Sicherheitsstatus

Neue Installationen wählen Gemini als kostenkontrollierten Standardprovider. OpenRouter Free, Hugging Face mit begrenztem Free-Guthaben, Ollama und LM Studio sind optional verfügbar. Serverseitig werden vorhandene Environment-Secrets nur anhand des Provider-Namens gebunden; Werte werden weder in UI, Logs noch Audit-Events geschrieben. Lokale Provider fallen bei einem fehlgeschlagenen Agentenaufruf auf Gemini zurück, sofern der Fallback nicht deaktiviert oder identisch ist.

## CI/CD und Benachrichtigungen

Der CI-Workflow validiert Installation, TypeScript, Tests, Workspace-Service-Syntax und Server-Build. Ein separater Release-Workflow schreibt den Status in die GitHub-Summary und übermittelt ein optionales, tokenfreies Audit-Event an `EXTERNAL_ACTION_AUDIT_URL`. Die App stellt `notifyReleaseStatus` für lokale Release-Status-Benachrichtigungen bereit; Push-Berechtigungen und Expo-Token-Registrierung bleiben plattformabhängig.

## Publish-Handoff

1. Management-Oberfläche öffnen.
2. Den Checkpoint dieses Release-Stands auswählen.
3. **Publish** anklicken und den Android-Build starten.
4. Das erzeugte APK-Artefakt auf einem echten Android-Gerät installieren und die Medienauswahl, SecureStore-Seam sowie Push-Berechtigungen prüfen.
