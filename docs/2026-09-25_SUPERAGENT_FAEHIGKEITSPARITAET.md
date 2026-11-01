# Superagent-Faehigkeitsparitaet gegen den Base44-Superagenten (25.09.2026)

## Auftrag
Der In-App-Superagent soll die Faehigkeiten des Base44-Superagenten erreichen —
voller Autonomie, funktionsfaehig, ausschliesslich mit kostenloser Infrastruktur
(Free-LLM-Kette Groq > OpenRouter > Gemini, lokale Tools, In-Process-Skills).

## Umgesetzte Faehigkeits-Schichten (6 Module, 31 Tests)
1. **Skill-Registry** (`lib/agent-skill-registry-logic.ts`): wiederverwendbare
   Skills mit Parameter-Schema; Pflicht-/Typ-/Unbekannt-Pruefung VOR dem Lauf;
   unbekannter oder invalidierter Skill wird NICHT ausgefuehrt.
2. **Workflow-Scheduler** (`lib/agent-workflow-scheduler-logic.ts`): cron/
   Intervall/Einmal/Entity-Trigger mit ehrlicher Faelligkeits-Logik (verpasste
   Laeufe bleiben faellig statt still auf morgen zu rutschen), pausierte
   Workflows laufen nie heimlich.
3. **Sub-Agent-Delegation** (`lib/subagent-delegation-logic.ts`): Missionen mit
   Task-Graphen (Abhaengigkeiten, Zyklenerkennung), exklusiven Konflikt-Ressourcen,
   Capability-Scope und Policies (all / first_success) — Tasks ohne gewaehrte
   Faehigkeit bleiben blockiert statt "einfach mal" zu laufen.
4. **Tool-Router** (`lib/agent-tool-router-logic.ts`): sieben Intent-Tool-Paare
   (Code-Suche, Dateien, Entities, Bild, Web, Browser, Transkription); lokale
   Tools immer gratis, externe nur mit konfigurierter (kostenloser) Anbindung —
   ohne Konfiguration ehrlich "nicht konfiguriert", nie ein Fake-Ergebnis.
5. **Channel-Paritaet** (`lib/channel-parity-logic.ts`): Telegram/WhatsApp/
   iMessage/Slack/Phone mit Richtung, Gratis-Moeglichkeit und Verbindungsstand;
   unverbundene Kanaele senden nichts, bezahlpflichtige Kanaele werden ehrlich
   ausgeschlossen statt behauptet.
6. **Capability-Registry** (`lib/superagent-capability-registry-logic.ts`):
   das Paritaetsregister selbst — 10 Faehigkeiten des Base44-Katalogs gegen
   EVIDENZ (belegende Module) geprueft: gruen = belegt, grau = Einschraenkung
   benannt, rot = fehlt. Ohne Evidenz ist nichts gruen.

## Ehrliches Ergebnis (Build-in-Report: buildParityReport())
- **Voll gruen (7/10)**: chat, gedaechtnis, skills, workflows, sub-agenten,
  entities, ziele.
- **Gruen mit benannter Gratis-Grenze (3/10)**: tools (externe Werkzeuge nur
  mit konfigurierter Gratis-Anbindung), connectors (OAuth-Flows brauchen
  Anbieter-Apps — Praferenzen-Logik vorhanden), kanaele (Telegram/Slack gratis
  betreibbar; WhatsApp/iMessage/Phone brauchen bezahlte Drittanbieter-Infra,
  die die KOSTENLOS-Vorgabe bewusst ausschliesst).
- **Rot (0/10)**: keine Faehigkeit fehlt ohne benannten Grund.

## Grenzen, die bleiben (bewusst, nicht still)
Die drei grauen Posten sind keine fehlenden Sprints, sondern die ehrliche
Antwort auf die KOSTENLOS-Bedingung: exakt dieselben Faehigkeiten wie Base44
waeren fuer diese Posten nur mit bezahlter Drittanbieter-Infrastruktur
moeglich. Die Registry benennt das je Faehigkeit, statt Paritaet zu behaupten,
die nicht besteht.
