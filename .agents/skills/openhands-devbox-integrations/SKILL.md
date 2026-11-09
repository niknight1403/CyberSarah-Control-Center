---
name: openhands-devbox-integrations
description: Select and configure only the MCP integrations required for a task, with least privilege and protected credentials.
---

# Integrationen und Connectoren

Nutze diesen Skill, wenn eine Aufgabe externe Dienste oder zusätzliche Tools benötigt.

1. Ermittle zuerst, ob ein bestehendes Repo-Werkzeug, eine offizielle API oder ein bereits konfigurierter MCP-Server genügt.
2. Wähle nur die kleinste benötigte Integration und bestätige, welche Daten oder Aktionen sie ermöglicht.
3. Bevorzuge offizielle Anbieter- oder OpenHands-Dokumentation. Erfinde keine MCP-URLs, OAuth-Scopes oder Token-Formate.
4. Credentials gehören in die geschützten Einstellungen des aktiven Backends, nicht in Projektdateien, Commits, Logs oder Aufgabenprompts.
5. Teste den Server im OpenHands-UI und prüfe dessen Tool-Liste, bevor du ihn in einer Aufgabe verwendest.
6. OAuth kann interaktive Zustimmung erfordern und ist daher nicht automatisch für geplante/headless Läufe geeignet.
7. Entferne keine bereits vorhandene Integration und erweitere keine Berechtigungen ohne konkrete Notwendigkeit.
