# GitHub-Portfolio-Konsolidierung — 2026-10-28

## Zielbild

CyberSarah-Control-Center bleibt die Haupt-App, der zentrale Revenue-/Creator-Hub sowie die Steuerungs-, Freigabe- und Monitoring-Ebene. Agentforge2 bleibt die eigenstaendige ausfuehrende VillaForge-Orchestrierungs-Engine. Die beiden Systeme werden ueber versionierte, secret-freie Telemetrie-/Checkpoint-Vertraege gekoppelt; kein Quellcode-Monolith und keine zweite Revenue-Wahrheit.

Inventur: 68 ueber die GitHub-Installation sichtbare Repositories plus das weiterhin erreichbare `projekt-nullpunkt` wurden gesichtet. Relevante Kandidaten wurden bis auf Datei-/Implementierungsebene verglichen. Leere, alte oder fachfremde Repositories wurden bewusst nicht in die Haupt-App kopiert.

## Sofort uebernommen

### Agentforge2 / AGI-Agenten

Uebernommen wird das belastbare Kontrollmuster `Observe -> Decide -> Heal/Retry -> Verify`, nicht die SQLite-/Villa-Laufzeit selbst. CyberSarah besitzt bereits Provider-Failover, Self-Healing, Quality Gate, Prompt Contract, Specialist Agents und Agentforge-Telemetrie.

Neu in diesem Sprint:
- `lib/ultra-orchestrator-logic.ts`: reine, testbare Entscheidungspolitik.
- `server/control-center-autopilot.ts`: jeder reale Autopilot-Lauf liefert die naechste sichere Aktion `HEAL | RETRY | VERIFY | OBSERVE`.
- Tests erzwingen Prioritaet: echte Blockade vor Rate-Limit vor Verifikation.
- Revenue-Autopilot-Chancen werden als direkt messbare Loop-Experimente mit `experiment`, `unit`, `targetValue` und `currentValue` persistiert; damit sind autonome Entwuerfe nicht nur Textvorschlaege, sondern vollstaendige, in Loop Engineering uebernehmbare Messplaene.

Agentforge2 bleibt getrennt, weil es Villa-Lifecycle, Worker, Projekt-Workspace und Ausfuehrung besitzt. CyberSarah empfaengt bereits metadata-only Events/Checkpoints und bleibt Control Plane.

### CyberSarah Revenue-Familie

Bereits produktiv adoptiert bzw. konsolidiert:
- `cybersarah-revenue-os` / `cybersarah-revenue-os-app` / `cybersarah-revenue`: Revenue-Module, HARA, SaaS, Cross-Sell, Expansion, Influencer-/Content-Logik, Stripe/Digistore24-Muster.
- Revenue-Code liegt im Control Center unter `modules/revenue-os` bzw. in nativen Server-/Router-Modulen.
- Integration Registry, Digistore24, Resend/E-Mail, externe Aktions-Gates, Stripe-Metering, FLUX-Bildgenerierung und Revenue-Drafts sind bereits vorhanden.
- Es wird keine zweite Revenue-Datenquelle oder zweite Publishing-Queue eingefuehrt.

### projekt-nullpunkt

Die wertvollen Muster sind bereits adoptiert: FLUX/Hugging-Face-Bildpfad und Media-Pipeline-Grundlagen. Das Repo bleibt als Medien-/Experimentquelle separat; keine erneute Kopie.

## Verbinden, nicht zusammenlegen

- `Agentforge2`: Ausfuehrungs-Engine; Verbindung ueber Agentforge-Telemetrie, Checkpoints und spaeter versionierte Event-Vertraege.
- `AgentForge`: separater Live-Hub/Legacy-Hub; keine zweite Haupt-App.
- `Nexusforge`: eigenstaendiges Produkt; nicht in CyberSarah einbetten.
- `openhands` / `openhands-devbox`: Entwicklungs-/Computer-Worker; nur als kontrollierter Connector/Worker verwenden.
- `eve-slack-agent`: Kanalvorbild; nur bei echter Slack-Konfiguration als Connector, kein Quellcode-Merge.
- `villaforge-automonetize-ai-marketplace` / `automonetize-marketplace`: PayKit nicht uebernehmen. CyberSarah besitzt bereits Stripe SDK, Webhook-Idempotenz, Subscription-Tiers, Metering und Access-Control; eine zweite Lizenz-/Checkout-Wahrheit waere ein Rueckschritt.
- `villaforge-design-lab`: nicht uebernehmen. Die statischen Theme-/Audit-Antworten sind schwacher als das bestehende Future-Glass-System.
- `villaforge-werkzeug-schmiede`: nicht uebernehmen. Der Generator erzeugt derzeit nur Stub-CLI-Dateien und unterschreitet das CyberSarah-Quality-Gate.

## Eigenstaendige Produktfamilien

Diese Repositories bleiben getrennt; gemeinsame Infrastruktur darf ueber Packages/Connectoren geteilt werden, Produktcode wird nicht in CyberSarah verschmolzen.

### SteelSense / Dart
`SteelSense-Pro-13.04`, `SteelSense-Pro`, `Dartapp`, `steelsense-clean-build`, `SteelSense-Pro-apkgit`, `SteelSense_GitHub_Merged`, `steelsense-pro-neon-fixed`, `SteelSense-autoscoring-`, `-SteelSense-Pro`, `SteelSense-Pro2`, `SteelSense-Pro213.04`, `SteelSense-Pro2-heute1404`, `steelsense-pro-neon`, `SteelSense-Pro-apkgithub`.

Empfehlung: innerhalb der SteelSense-Familie spaeter einen kanonischen Hauptstand bestimmen und Altstaende archivieren; nicht mit CyberSarah mischen.

### Audio / Push / Groovebox
`villaforge-ableton-push-software`, `push-ai-evolution`, `LiveAudioPerformanceStudio`, `D2.-Groovebox-`, `android-push-pro`, `Groovebox-d2mobile`, `LaunchpadControl`, `ableton-push-software`.

Empfehlung: Audio-DSP und Controller-Code als eigene Produktlinie halten. Nur CI/Release-/Agenten-Infrastruktur teilen.

### Weitere eigenstaendige Produkte
`villaforge-tarnsoftware`, `Traiding-Agent`, `private-companion-studio`, `Ai-Freundin`, `Ai-Studio-`, `Filmstudio-`, `comedy-mashup-abend-projekt`, `villaforge-comedy-mashup-abend`, `Comedy-Mashup-Abend`, `villaforge-villa-19-quantumvault-secure-autonomous-`.

`Traiding-Agent` wird nicht in einen autonomen Echtgeldpfad uebernommen; CyberSarah behaelt Trading als Analyse/Paper- bzw. freigabegesteuerte Funktion.

## Agent-/Villa-/Experiment-Repositories

`AGI-Agenten`, `agent-villa-hub`, `Agenten-Villa`, `Agent`, `villaforge-agenten-villa`, `villaforge-agi-agenten-villa`, `villaforge-villa`, `villaforge-test-villa`, `Base44-Architek`, `AROS-Enterprise`.

Entscheidung:
- Muster und Tests duerfen selektiv adoptiert werden.
- Keine parallele Orchestrator-Datenbank in CyberSarah.
- Kein Agent darf durch Import hoehere Tool-/Secret-/External-Action-Rechte erhalten.
- `AGI-Agenten` liefert das Evaluations-/Optimierungsprinzip; die CyberSarah-Fassung nutzt vorhandene Quality-/Self-Healing-Systeme statt den Python-Demozyklus zu kopieren.

## Legacy, leer oder Integrationsfixture

`CyberSarah-`, `CyberSarah`, `CyberSarah-21-`, `CyberSarah-master`, `CyberSarah-pro-migration`, `CyberSarah-pro-`, `villaforge-cybersarah-villa`, `Influenza-`, `Heuteneu`, `desktop-tutorial`, `custom-ai-studio-integration-test-20260821054652`.

Diese Repositories sind keine Quelle einer zweiten Haupt-App. Vor einer spaeteren Archivierung muessen Secrets, Releases und noch benoetigte Artefakte separat geprueft werden.

## Sicherheits- und Wartungsregeln

1. Keine Secrets, DB-Dumps oder lokale Environments aus Alt-Repositories uebernehmen.
2. Keine Binär-/venv-Artefakte in CyberSarah importieren.
3. Neue Adoption nur mit Tests, Typecheck, Security-Scan und bestehendem Quality Gate.
4. Externe Zahlungen, Preiswechsel, Publishing, Loeschungen und sonstige irreversible Aktionen bleiben policy-/freigabegesteuert.
5. CyberSarah ist die einzige Revenue-Control-Plane; Agentforge2 ist Execution Plane.
6. Bei doppelter Funktion gewinnt die aktuellere, getestete CyberSarah-Implementierung; Fremdcode wird nur adoptiert, wenn er einen messbaren Gap schliesst.

## Ergebnis

Die sinnvolle Konsolidierung ist eine faehigkeitsbasierte Federation statt ein Repository-Merge. Dadurch bleiben mobile App, Revenue-Daten, Auth, Billing und Freigaben zentral in CyberSarah, waehrend Agentforge2/NexusForge und Fachprodukte unabhaengig deploybar bleiben. Der in diesem Sprint uebernommene Ultra-Entscheidungsloop ist die erste neue, nicht redundante Adoption aus der aktuellen Gesamtinventur.
