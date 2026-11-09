---
name: openhands-devbox-quality-engineering
description: Validate scoped code changes with the repository's existing tests, static checks and failure handling.
---

# Qualität und Verifikation

Nutze diesen Skill vor dem Abschluss einer Codeänderung oder bei Aufgaben zu Tests, Stabilität und Fehlerbehandlung.

- Ermittle aus Manifesten und CI-Konfiguration die tatsächlich vorhandenen Test-, Lint-, Typprüfungs- und Build-Befehle.
- Führe die kleinste relevante Prüfmenge aus; ergänze nur Checks, die die Änderung sinnvoll abdecken.
- Prüfe Erfolgscodes und Ausgaben. Ein fehlender Befehl ist kein bestandener Test.
- Untersuche neue Fehlerpfade, Validierung und Ressourcenbereinigung, nicht nur den Happy Path.
- Vermeide Tests mit destruktiven Änderungen an geteilten oder produktiven Daten.
- Melde jedes übersprungene, nicht verfügbare oder fehlgeschlagene Kommando explizit.
