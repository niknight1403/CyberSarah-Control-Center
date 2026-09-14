# Sprint 95 — Administrator-Elite-Override & Autonomer Tech-Scanner

**Status:** Erledigt (14.09.2026) · **Version:** v1.3.6 · **CI:** `validate` grün

## Ziel

Umsetzung der Master-Systemdirektive „Administrator Elite Override & Autonomous
R&D Core": (1) privilegiertes Routing für den Administrator, (2) ein autonomer,
kontinuierlicher Tech-Scanner als R&D-Quelle, (3) ein geschlossener
Integrationskreis aus CI, Deploy und Berichtswesen.

## Modul 1 — Administrator-Elite-Override

Bereits vorhanden (kein Doppelbau): Admins sind von der Fair-Use-Tagesquote
ausgenommen (`evaluateChatQuota`, Sprint 59) und Auto-Routing ist für sie
permanent aktiv (`shouldAutoRoute`, Sprint 78/86).

Neu in diesem Sprint — **priorisiertes Elite-Routing**
(`lib/model-router-logic.ts`):

- `buildProviderOrder` erhält `adminPriority`: Provider mit Faehigkeit ≥ 8
  fuer die Task-Art erhalten +2 Score — Admins starten immer auf den
  staerksten Modellen, ohne dass schwache Provider benachteiligt oder
  Verfuegbarkeits-Regeln (Cooldowns, Konfiguration) umgangen werden.
- Verdrahtet an beiden Routing-Stellen des Servers: Agent-Modus
  (`resolveAgentProviderCandidates`) und Auto-Route
  (`handleAutoRoutedChat`) — jeweils `role === "admin"`.
- 16 Router-Tests gruen, u. a.: Elite-Bonus exakt +2 nur fuer Faehigkeits-
  Top-Provider, keine Drueberwegung von Cooldowns.

## Modul 3 — Autonomer Tech-Scanner (R&D-Agent)

Neue Komponente, taeglich laufend, ohne externe Keys:

- **Bewertungslogik rein** (`lib/tech-scan-logic.ts`): 24 gewichtete
  Relevanz-Signale entlang des Stacks (Mobile: Expo/React-Native/Capacitor/
  Android; Agenten: MCP/LLM/Tool-Use; Backend: Drizzle/tRPC/Neon/Postgres;
  Billing: Stripe; DevOps: Vitest/TypeScript/GitHub Actions), Sterne-Bonus
  (max +2), Mindest-Relevanz 3, max. 4 Funde je Bereich, deterministische
  Sortierung und Markdown-Report-Formatierung.
- **Datensammlung als Skript** (`scripts/tech-scanner.mjs`): oeffentliche
  Quellen — GitHub Search (neue, vielbeachtete Repos zu MCP/Agenten/Mobile,
  letzte 14 Tage, via `GITHUB_TOKEN`), Hugging Face (aktuellste
  Text-Generations-Modelle) und npm Registry (aktuellste Versionen der sechs
  Kern-Abhaengigkeiten inkl. lokal installiertem Stand im Text).
- **Workflow** (`.github/workflows/tech-scanner.yml`): taeglich 05:30 UTC
  (07:30 MESZ) sowie manuell per `workflow_dispatch`. Baut das Skript mit
  esbuild zu einem Node-20/22-kompatiblen Bundle, committet den Report als
  `docs/research/LATEST_TECH_SCAN.md` (`[skip ci]`, kein CI-Overhead) und
  aktualisiert den offen `tech-scan`-gelabelten Issue (oder legt ihn an).
- **Erster echter Lauf** (14.09.2026): 86 Rohdaten aus GitHub (40),
  Hugging Face (40) und npm (6) → 9 relevante Funde — u. a.
  `google-seo-mcp` (GA4/Search-Console-MCP-Server) und
  `animate-react-native/ggwave`. Der Report liegt bei
  `docs/research/LATEST_TECH_SCAN.md`.

## Modul 2 & 4 — Integritaet und Integrationskreis (Bestandsaufnahme)

- **Kein „Zero-Failure" versprochen, sondern gelebte Fallback-Kette:**
  Provider-Failover mit Health-Tracking, Key-Rotation und Auto-Routing
  greifen bei Ausfaellen automatisch; Business-Tools sind Nur-Lese
  (Guardrails Sprint 94); Gitleaks + Dependabot + validate-CI bewachen
  main. Ehrlich: absolute Fehlerfreiheit kann kein System garantieren —
  die Selbstheilungs-Mechanismen decken die bekannten Ausfallklassen ab.
- **Geschlossener Update-Loop bereits aktiv:** Dependabot entdeckt
  Erneuerungen → `validate`-CI testet autonom → Merge nach gruenem Lauf →
  Render-Deploy (`--migrate`) bringt es ohne manuelle Zwischenschritte in
  Produktion. Der Tech-Scanner ergaenzt die Dependency-Seite um die
  R&D-Entdeckungsseite; die Code-Synthese bleibt beim Master-Agenten
  (Sprint-Modell), damit jede Aenderung die Akzeptanzkriterien
  (check/test/build/Gitleaks) durchlaeuft — bewusst kein unbeaufsichtigtes
  Auto-Mergen fremder Patches in Produktion.

## Tests

- 639 Tests gruen (+6): 5 Tech-Scan-Logik-Faelle (Signal-Gewichtung,
  Sterne-Bonus-Kappung, Bereichs-Begrenzung, Report-Formatierung,
  Leer-Fall) und 1 Elite-Override-Fall im Router.
- Akzeptanz: `npm run check` sauber, `npm run test:coverage` gruen,
  `npm run build` erfolgreich, Scanner lokal gegen echte APIs verifiziert
  (GitHub 40, HuggingFace 40, npm 6 Rohdaten).

## Nächste Schritte

1. Tech-Scanner-Lauf nach erstem Schedule (morgen 07:30 MESZ) verifizieren.
2. Funde mit Relevanz ≥ 8 in Sprint-Planung uebernehmen (Kandidat:
   google-seo-mcp — GA4-Integration bereits vorhanden, passt zum MCP-Hub).
3. Langfristig: Relevanz-Signale nach echten Sprint-Erfahrungen nachschärfen.
