---
name: openhands-devbox-automated-refactoring
description: Automatically perform safe, behavior-preserving refactoring in existing repositories. Use when asked to refactor, simplify, deduplicate, extract, rename, modularize, or clean up code without adding product behavior.
---

# Automatisches Refactoring

Nutze diesen Skill für ausdrücklich gewünschte Strukturverbesserungen an vorhandenem Code. Refactoring verändert die innere Struktur, nicht das beobachtbare Verhalten. Behandle Feature-Arbeit, Bugfixes und Optimierungen mit geänderter Semantik als separate Aufträge.

## Ablauf

1. **Scope erfassen.** Lies Projektanweisungen, relevante Module, Aufrufer, Tests und Formatter-/Lint-Konfiguration. Prüfe `git status` und bewahre vorhandene Nutzeränderungen. Begrenze den Auftrag auf den genannten Bereich; bei offenem Umfang schlage einen kleinen, zusammenhängenden ersten Schritt vor.
2. **Baseline sichern.** Führe die passendsten vorhandenen Tests vor der Änderung aus. Notiere bestehende Fehler, damit sie nicht als Refactoring-Regressionen fehlgedeutet werden. Wenn keine Tests das Zielverhalten absichern, ergänze zuerst gezielte Verhaltenstests auf Basis des beobachteten Vertrags.
3. **Refactoring wählen.** Bevorzuge die kleinste nachvollziehbare Änderung: Duplikate gezielt beseitigen, Funktionen oder Module klar abgrenzen, Namen konsistent machen oder Abhängigkeiten entkoppeln. Nutze vorhandene AST-/IDE-Refactorings und Projektkonventionen, wo verfügbar. Vermeide spekulative Abstraktionen und großflächige Text-Ersetzungen.
4. **In kleinen Schritten ändern.** Halte jede Änderung lokal und überprüfbar. Bewahre öffentliche APIs, Ein-/Ausgaben, Seiteneffekte, Reihenfolge, Fehlerverhalten, Persistenzformate und Kompatibilität. Füge keine Features, stillen Verhaltenskorrekturen, neuen Laufzeitabhängigkeiten oder Konfigurationsänderungen hinzu, sofern sie nicht ausdrücklich beauftragt sind.
5. **Verifizieren.** Führe die Baseline-Tests erneut sowie die relevanten Tests, Typprüfungen, Formatter, Linter und Builds aus. Ergänze Tests für aufgerufene Pfade oder geänderte Verträge. Bewerte Performance-Refactorings nur mit vorhandenen oder gezielt passenden Benchmarks; behaupte keine Verbesserung ohne Messung.
6. **Diff prüfen und berichten.** Prüfe den vollständigen Diff, veränderte Pfade, veraltete Verweise und verbleibende Duplikate. Stelle sicher, dass keine Nutzeränderungen oder generierten Geheimnisse enthalten sind. Berichte Zweck, betroffene Bereiche, tatsächlich ausgeführte Checks und bekannte Baseline-Fehler.

## Entscheidungsgrenzen

- Ändere keine öffentlichen Verträge, Datenbank-/Dateiformate, Migrationen, Berechtigungen, Authentifizierung, Workflows, Deployment-Konfiguration oder Secrets unter dem Vorwand eines Refactorings. Wenn dafür eine Änderung nötig erscheint, trenne sie als Folgeauftrag ab oder frage nach.
- Bei großen, mehrdeutigen oder schwer rückgängig zu machenden Umbauten erst Umfang und Schritte abstimmen; keinen unaufgeforderten Komplettumbau starten.
- Erhalte die vorhandenen Tests als Verhaltensreferenz. Ändere einen Test nicht bloß, damit eine abweichende Implementierung grün wird.
- Verwende ausschließlich sichere Testdaten; führe keine Tests gegen produktive oder geteilte Daten aus.
- Committe, pushe, merge oder veröffentliche nichts im Rahmen dieses Skills. Externe Änderungen benötigen eine separate, konkrete Autorisierung.