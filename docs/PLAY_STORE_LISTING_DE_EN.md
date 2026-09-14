# Play Store Listing — Texte (DE/EN)

Stand: 14.09.2026 — Sprint 109 (Release **v2.0.0**, versionCode 20000, Paket-ID `com.cybersarah.controlcenter`)

Dieses Dokument enthält die redigierten, einreichungsreifen Store-Listing-Texte für die Play-Console-Einreichung der Version v2.0.0. Deutsch ist die Primärsprache, Englisch als zusätzliche Store-Listing-Sprache hinterlegt. Alle Zeichenlimits entsprechen exakt den Google Play Vorgaben.

## App-Name (max. 30 Zeichen)

- **DE/EN:** `CyberSarah Control Center` (25 Zeichen ✓)

## Kurzbeschreibung (max. 80 Zeichen)

- **DE (77 Zeichen ✓):**
  `KI-Agenten-Studio: Streaming, 3 Themes & Zero-Cost Routing – Deine Kontrolle.`
- **EN (77 Zeichen ✓):**
  `AI Agent Studio: live streaming, 3 themes & zero-cost routing — your control.`

## Langbeschreibung (max. 4000 Zeichen)

### Deutsch (2259 Zeichen ✓)

CyberSarah Control Center ist das mobile Studio und die Betriebszentrale für deine KI-Agenten — vollständig in deiner Hand, ohne Cloud-Zwang.

KI-AGENTEN-CHAT & DIFF-VIEWER
Entwickle und steuere KI-Agenten in einem dedicated Entwicklungsfenster mit Echtzeit-Live-Streaming, syntax-highlightetem Diff-Viewer und interaktiver Vorschau. Verläufe und Zwischenergebnisse bleiben transparent nachvollziehbar.

DREI DESIGN-THEMES
Passe die Benutzeroberfläche jederzeit deinem Stil an: „Cyber Neon" (futuristischer Dark-Mode mit Neon-Glow), „Enterprise Slate" (klar, professionell, hochverdichtet) und „Glas-Modern" (Glassmorphismus mit Frosted-Glass-Gradients).

AUTONOME ZIEL-ZERLEGUNG
Agenten zerlegen komplexe Aufgaben selbstständig in strukturierte Ausführungsgraphen. Integrierte Schleifen-Erkennung stoppt Endlosloops automatisch und leitet kontrollierte Eskalations- und Wiederholungsstrategien ein.

ZERO-COST & FAILOVER ROUTING
Nutze intelligentes Provider-Routing mit automatischer Key-Rotation: Kostenlose Modelle (Groq, OpenRouter, Gemini-Failover) werden bevorzugt, während Rate-Limits und erschöpfte Kontingente durch automatischen Failover unterbrechungsfrei kompensiert werden.

WORKSPACE & GITHUB-ANBINDUNG
Verbinde deine GitHub-Repositories direkt mit dem Workspace. Prüfe Datei-Diffs, löse Konflikte visuell und erstelle Commits oder Pull Requests direkt aus der mobilen Zentrale.

ADMIN-BETRIEBSWACHT & TELEMETRIE
Die integrierte Dashboard-Betriebswacht überwacht System-Health, Provider-Latenzen, PaaS-Status (Render/Neon) und Ausführungsstatistiken in Echtzeit — maximale Transparenz für Admins.

SICHERHEIT & VERSCHLÜSSELTE BACKUPS
Deine API-Schlüssel und Tokens verbleiben sicher verschlüsselt im Android Keystore (SecureStore). Vollständige Support- und Einstellungs-Backups lassen sich Ende-zu-Ende verschlüsselt (PBKDF2/AES) exportieren und wiederherstellen. Redigierte Audit-Protokolle verhindern Secret-Leaks.

RBAC-TIERS & KONTINGENTE
Fließende Skalierung über klare Rollen- und Abo-Stufen (Free, Pro, Developer Max, Elite). Admins verwalten Kontingente und Nutzungsmetering direkt im integrierten Control Dashboard.

Hinweis: Für die Repository-Synchronisation wird ein kompatibler Workspace-Service (z. B. Render-Deployment) benötigt.

### English (2015 Zeichen ✓)

CyberSarah Control Center is the mobile studio and operational control hub for your AI agents — fully under your control, with zero cloud vendor lock-in.

AI AGENT CHAT & DIFF VIEWER
Develop and control AI agents in a dedicated workspace window featuring real-time live streaming, syntax-highlighted diff viewer, and interactive preview. Agent execution steps and history remain fully traceable.

THREE DESIGN THEMES
Switch your interface theme on the fly: "Cyber Neon" (futuristic dark mode with neon glow), "Enterprise Slate" (clean, professional, high-density), and "Glass Modern" (glassmorphism with frosted glass and gradients).

AUTONOMOUS GOAL DECOMPOSITION
Agents break down complex targets into structured execution graphs. Built-in loop detection stops infinite retries automatically and triggers graceful escalation and retry logic.

ZERO-COST & FAILOVER ROUTING
Smart provider routing with automated key rotation prefers zero-cost models (Groq, OpenRouter, Gemini failover). Rate limits and depleted quotas heal automatically through seamless failovers.

WORKSPACE & GITHUB INTEGRATION
Connect your GitHub repositories directly to the workspace. Inspect file diffs, resolve conflicts visually, and submit commits or pull requests right from your mobile device.

ADMIN CONTROL & TELEMETRY
The integrated Admin Telemetry Dashboard monitors system health, provider latency, PaaS status (Render/Neon), and execution metrics in real time.

SECURITY & ENCRYPTED BACKUPS
Your API keys and credentials stay encrypted locally in the Android Keystore (SecureStore). Complete support and settings backups export with end-to-end encryption (PBKDF2/AES). Redacted audit logs prevent secret leaks.

RBAC TIERS & QUOTAS
Scale effortlessly across structured subscription tiers (Free, Pro, Developer Max, Elite). Admins manage quotas and usage metering directly in the built-in control dashboard.

Note: A compatible self-hosted workspace service (e.g. Render deployment) is required for full repository synchronization.

## Versionshinweise v2.0.0 (What's new)

### DE
Neu in v2.0.0:
• KI-Agenten-Chat mit Live-Streaming, Code-Diff-Viewer und interaktiver Vorschau
• Drei schaltbare Oberflächen-Themes (Cyber Neon, Enterprise Slate, Glas-Modern)
• Zero-Cost-Provider-Routing mit Groq, OpenRouter & Gemini-Failover + autonomer Key-Rotation
• Autonome Ziel-Zerlegung mit Ausführungsgraphen & automatischer Schleifen-Erkennung
• Workspace-GitHub-Anbindung mit visueller Diff- und Konfliktbehebung
• Admin-Betriebswacht & PaaS-Telemetry-Dashboard (Render/Neon-Health, Latenzen)
• Ende-zu-Ende verschlüsselte Support- & Einstellungs-Backups (SecureStore + PBKDF2/AES)
• RBAC-Tiers (Free, Pro, Developer Max, Elite) mit Kontingentverwaltung

### EN
New in v2.0.0:
• AI Agent Chat with live streaming, code diff viewer and interactive preview
• Three switchable UI themes (Cyber Neon, Enterprise Slate, Glass Modern)
• Zero-cost provider routing featuring Groq, OpenRouter & Gemini failover + key rotation
• Autonomous goal decomposition with execution graphs & loop detection
• Workspace GitHub integration with visual diff inspection and conflict resolution
• Admin Telemetry Dashboard monitoring PaaS health (Render/Neon) and model latencies
• End-to-end encrypted support & settings backups (SecureStore + PBKDF2/AES)
• RBAC tiers (Free, Pro, Developer Max, Elite) with quota management

## Keywords (für die interne Suche, max. 100 Zeichen)

`ki agent, künstliche intelligenz, ai assistant, automation, github, groq, openrouter, diff viewer, agent workspace`
