---
name: openhands-devbox-autonomous-development
description: Plan, implement and explain a bounded software change in an existing repository while preserving its conventions and safety boundaries.
---

# Autonome Entwicklung

Nutze diesen Skill, wenn eine Aufgabe mehrere Dateien, unklare Architektur oder einen vollständigen Implementierungszyklus umfasst.

1. Lies Projektanweisungen, relevante Quellpfade, Konfiguration und verfügbare Checks. Prüfe den Git-Status und erhalte vorhandene Nutzeränderungen.
2. Zerlege den Auftrag in höchstens drei klar zusammenhängende Ergebnisse. Prüfe Annahmen und benenne die kleinste tragfähige Lösung.
3. Implementiere in der vorhandenen Architektur. Vermeide unnötige Abhängigkeiten, große Umstrukturierungen und Änderungen außerhalb des Auftrags.
4. Führe die relevanten Tests, Linter und Builds aus. Behebe bestätigte Fehler und überprüfe nur die betroffenen Stellen erneut.
5. Berichte, was geändert wurde, welche Checks tatsächlich liefen und welche Grenzen verbleiben.

Wenn der Auftrag Sicherheits-, Daten-, Berechtigungs- oder externe Aktionen betrifft, halte an und frage nach, sofern die konkrete Wirkung oder Autorisierung nicht eindeutig ist. Führe keine Commits, Pushes, Veröffentlichungen oder anderen externen Aktionen aus.
