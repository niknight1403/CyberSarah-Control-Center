# B2B Persona + SaaS Loop Engineering Update — 2026-11-01

## Ziel
CyberSarah verbindet das vorhandene B2B-Netzwerk, die sechs KI-Personas und den Revenue-/SaaS-Autopilot zu einem gemeinsamen messbaren Regelkreis.

## Neuer Regelkreis
1. **Observe** — B2B-Nodes, Beziehungen, Fit, Intent, Trust, Aktivität, Wert und Funnel-Signale lesen.
2. **Diagnose** — den engsten messbaren SaaS-Engpass bestimmen: Coverage, Conversion, Retention, Partneraufbau oder Expansion.
3. **Design** — passende KI-Persona und reversible nächste Aktion auswählen.
4. **Draft** — B2B-/SaaS-Hypothese und nächsten Schritt vorbereiten.
5. **Approve / Execute** — irreversible externe Aktionen bleiben hinter bestehenden Freigabe- und Policy-Gates.
6. **Measure** — Conversion, Relationship Strength, Revenue-Attribution und Retention erfassen.
7. **Learn** — Persona- und Loop-Gewichte ausschließlich aus gemessener Evidenz aktualisieren.

## Persona-Zuordnung
- **Juno**: SaaS, B2B, Pricing, Funnel, Conversion, Expansion.
- **Nova**: Automatisierung, technische Value-Proposition, Netzwerk-Coverage.
- **Zara**: Partner, Creator, Distribution und Reichweiten-Experimente.
- **Mira**: Nurture, Re-Engagement und Relationship Retention.
- **Kaya**: wert-/risikoorientierte Expansion und wirtschaftliche Einordnung.
- **Lina**: produktivitäts- und workflowbezogene Kundennutzen-Szenarien.

Die Auswahl ist deterministisch und basiert auf Beziehungstyp, B2B-Priorität, Intent, Trust und Wertsignalen. Opt-out-Nodes werden ausgeschlossen.

## Autonome Fähigkeiten
- B2B-Priorisierung
- Persona-Zuordnung
- Expansion-/Nurture-Queue
- SaaS-Bottleneck-Erkennung
- Loop-Planung
- Draft- und Experiment-Vorbereitung
- Lernen aus gemessenen Performance-Signalen

## Bewusste Grenzen
- Kein ungefragter externer Versand.
- Keine automatische Preis- oder Geldaktion.
- Keine erfundenen KPIs.
- Keine Mutation von Persona-Identität oder Disclosure.
- Externe Aktionen bleiben freigabegesteuert.

## UI
Die Revenue-Autopilot-Karte zeigt jetzt:
- B2B Health
- Anzahl Beziehungen
- Persona-Zuordnungen
- Expansion Queue
- aktiven SaaS-Loop-Fokus
- Owner-Persona
- nächste priorisierte B2B-Aktion

## Tests
`tests/b2b-saas-loop-engineering.test.ts` deckt ab:
- deterministische Persona-Zuordnung,
- Ausschluss blockierter/opt-out Nodes,
- priorisierte Expansion Queue,
- Approval-Gate für externe Aktionen,
- Auswahl des engsten messbaren SaaS-Engpasses.

Zusätzlich muss die vollständige bestehende CyberSarah-CI grün bleiben, insbesondere Control-Center-Autopilot, TypeScript, Lint, komplette Vitest-Suite, Workspace-Build, Gitleaks und PostgreSQL Multi-Worker Gate.
