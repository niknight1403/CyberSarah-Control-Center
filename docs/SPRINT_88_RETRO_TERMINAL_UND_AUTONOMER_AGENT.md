# Sprint 88 — Retro Cyber-Terminal & Autonomer Chat-Agent

**Datum:** 14.09.2026 · **Status:** abgeschlossen · **Tests:** 610/610 grün · **TypeCheck:** sauber

## Ziel (Owner-Direktive 14.09.2026)
1. Chat-Fenster soll den Bildschirm voll ausnutzen (wie im Base44-Superagent-Chat).
2. Der In-App-Chat soll Prompts autonom fertigstellen — mit echten Werkzeugen (Repo lesen/schreiben, Git-Operationen), nicht mit Rückfragen nach Code.
3. "Retro Cyber-Terminal"-Designsystem: echtes Schwarz (#000000), Amber (#FFB000), Monospace.

## Umsetzung

### 1. Retro Cyber-Terminal-Designsystem (neues 5. Design-Theme "retro", neuer Standard)
- `lib/design-theme-logic.ts`: DesignTheme um "retro" erweitert, DEFAULT_DESIGN_THEME = "retro", Storage-Key v3 (Bestandsinstallationen starten einmal frisch mit dem neuen Design), Label "Retro Cyber-Terminal".
- `lib/_core/design-theme-palettes.ts`: Retro-Palette (light+dark identisch): background #000000, surface #0A0A0A, border #4D3A00, foreground/primary #FFB000, muted #8A6D1F, success #3ADB76, warning #FFD24A, error #FF4A3A; Amber-Glow-Effekte, kein Blur.
- Wirkung global: Alle Tabs, Navigationsleiste, Karten und Statusanzeigen laufen über den Theme-Provider automatisch auf Schwarz/Amber.
- Chat-Oberfläche (Terminal-Konsole): Monospace-Typografie in `message-bubble.tsx` (Amber-Sender, harte 6px-Ecken, ASCII-artige Akzentkanten), `chat-composer.tsx` (Terminal-Prompt "> CyberSarah@ControlCenter: Befehl eingeben …", schwarz-amber Input-Box), `chat.tsx` (Monospace-Statuszeilen).

### 2. Chatfenster nutzt volle Bildschirmbreite
- `components/chat/message-bubble.tsx`: Nachrichten-Reihe von 88% auf 100% Breite, Agent-Bubble flex:1 (volle Breite), User-Antworten 92% rechtbündig — entspricht dem Superagent-Chat-Layout.

### 3. Autonomer Chat-Agent mit echten Werkzeugen (Kernstück)
- `lib/dev-agent-tools-logic.ts` (rein, 10 deterministische Tests): 7 Werkzeuge — list_repo_files, read_repo_file, write_repo_file, git_status, commit_changes, push_changes, open_pull_request; Request-Bau gegen den Workspace-Service, Ergebnis-Formatierung für das Modell, autonomer System-Prompt, sicheres JSON-Parsing der LLM-Argumente.
- `server/_core/renderProxy.ts`: neue Funktion callWorkspaceService() — direkter Server-zu-Workspace-Aufruf (nutzt dieselbe Cold-Start-Retry-Logik wie der HTTP-Proxy).
- `server/_core/llm.ts`: Message-Typ um tool_calls erweitert (Multi-Turn-Tool-Calling).
- `server/development-chat.ts`: Agent-Loop (max. 6 Iterationen, danach finale Antwort ohne Tools): Modell → tool_calls → Ausführung gegen den Workspace-Service → tool-Ergebnisse → Modell, bis die finale Antwort steht. Provider "auto" nutzt die Router-Kandidaten mit Failover; GitHub-Token kommt serverseitig aus ADMIN_GITHUB_TOKEN (Sprint 87). Client sendet workspaceId + branch mit (chat.tsx).
- Sicherheitsgrenzen: Admin-Env-Token nur für Admins; Werkzeug-Ergebnisse auf 4.000 Zeichen gekürzt, Dateiliste 250 Einträge, Dateiinhalt 9.000 Zeichen.

### 4. Zero-Cost-LLM-Router
- Bestehender Auto-Router (Sprint 71) hat OpenRouter/Groq/HuggingFace als konfigurierbare Kandidaten; der Agent-Modus nutzt dieselbe Kandidatenkette mit 429/Timeout-Failover.

## Offen / Follow-up (Sprint 89)
- ASCII-Topologie-Karten und Block-Progress-Meter in weiteren Tabs (Swarm-Dashboard, Preview, Admin) — Design-Foundation steht.
- MCP-Connector-Grid im Skills-Tab.
- Live-Verifikation des Agent-Modus gegen den Produktions-Workspace-Service (Render Free Cold-Start beachten).

## Geänderte Dateien
lib/design-theme-logic.ts, lib/_core/design-theme-palettes.ts, lib/dev-agent-tools-logic.ts (neu), tests/dev-agent-tools-logic.test.ts (neu), tests/design-theme-logic.test.ts, server/development-chat.ts, server/_core/renderProxy.ts, server/_core/llm.ts, app/(tabs)/chat.tsx, components/chat/message-bubble.tsx, components/chat/chat-composer.tsx
