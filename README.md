# CyberSarah Control Center

**CyberSarah Control Center** ist die zentrale Plattform hinter CyberSarah: eine Produktiv-App (Web + Android) mit eigenem Node-Server, Multi-Provider-KI-Integration und einem autonomen Master-Agenten. Betrieben wird sie produktiv auf Render (Custom Domain: `app.cybersarah-ki.com`) mit Neon-Postgres als Datenbank.

> Aktueller Stand: **v2.4.0** (Sprint 193). Details je Iteration im [CHANGELOG.md](CHANGELOG.md), geplante Schritte in [NEXT_STEPS.md](NEXT_STEPS.md).

## Überblick

- **App:** Expo (Web-Export) + Capacitor für Android, Design-System „Future-Glass" mit Dark-Cyber-Oberfläche — alle Farbwerte laufen ausschließlich über Tokens aus `lib/design/future-glass.ts`.
- **Server:** Node/TypeScript-Server (`server/`) mit tRPC + Drizzle ORM gegen Postgres (Neon), produktiv auf Render deployt (`render-deploy.yml` mit Auto-Migrate und Custom-Domain-Modus).
- **KI:** Multi-Provider-Routing (OpenAI, Gemini, Anthropic, Groq, OpenRouter, Together, HuggingFace, Forge, Ollama, LM Studio …) mit Key-Pool-Rotation, Failover und endpoint-bewussten Default-Modellen.
- **Master-Agent:** Leitender Superagent mit Sub-Agenten (Analytics/CRM/Content/KI-Dienste), Langzeit-Gedächtnis (`agentLearnings`), Vektor-Gedächtnis, Guardrails, Generative UI und eigenem Entwicklungs-Chat (Repo-Chat).
- **Monetarisierung:** Stripe-Integration (Abo-Verwaltung, Webhooks) und Revenue-OS-Dashboard.
- **Betrieb:** Zentrale Betriebsansicht (`ops.overview`), Dashboard-Betriebswacht, Uptime-Wächter als Actions-Cron, autonomer Tech-Scanner, Backup-Wächter und Backup-Selbstbedienung.

## Voraussetzungen

- Node.js 20+ und npm
- PostgreSQL (lokal oder Neon)
- Für native Builds: Android SDK / Java (der Android-Build läuft aber vollständig auf GitHub Actions, siehe unten)

## Lokale Entwicklung

```bash
npm install
cp .env.example .env          # Werte anpassen (siehe Kommentare in .env.example)
npm run db:push               # Drizzle-Schema generieren + migrieren
npm run db:seed-admin         # optional: Admin-Account anlegen
npm run dev                   # Server (tsx watch) + Expo/Metro (Port 8081) parallel
```

Der Server läuft standardmäßig auf Port 3000, die Web-App auf Port 8081. Für KI-Antworten ohne externe Provider kann lokal `mock-llm.cjs` genutzt werden.

### Wichtige npm-Skripte

| Skript | Zweck |
|---|---|
| `npm run dev` | Server + Metro parallel starten |
| `npm run check` | TypeScript-Prüfung (`tsc --noEmit`) |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run test` | Vitest-Suite ausführen |
| `npm run test:coverage` | Coverage-Report (Logik-Suite, v8-Provider) |
| `npm run verify:system` | System-Verifikation (`scripts/system-verify.ts`) |
| `npm run web:smoke` | Web-Export-Smoke-Test |
| `npm run db:push` | Drizzle-Schema generieren + migrieren |
| `npm run db:seed-admin` | Admin-Account anlegen |
| `npm run build` / `npm start` | Produktions-Build / Start des Servers |
| `npm run qr` | QR-Code für mobile Nutzung generieren |

## Tests & Qualität

- Vollständige Vitest-Suite (1196 Tests in 145 Dateien, Stand Sprint 191), inkl. deterministischer Test-Hooks (`setModelRouterKvForTests`, `setInvokeLlmForTests`) statt `vi.mock` — die Suite läuft damit auch ohne echte `DATABASE_URL` grün.
- CI (`ci.yml`): TypeScript, Lint, Tests, Server-Build, Release-Audit; [Gitleaks](.github/workflows/gitleaks.yml) scannt jeden Push/PR auf Secrets (blockierend).
- Dependabot liefert wöchentliche Update-PRs (npm, GitHub Actions); Major-SDK-Sprünge (z. B. Expo-SDK-Upgrades) bleiben eigene Sprints.

## Android-Build

Der APK-Build läuft **nicht über EAS**, sondern vollständig auf GitHub Actions über [build-apk.yml](.github/workflows/build-apk.yml) (Expo-Web-Export → Capacitor → Gradle). Start: *Actions → Build Android APK → Run workflow* auf `main`. Signierte Release-APK und Play-Store-AAB landen als Release/Artefakt.

Unterlagen: [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md), [PLAY_STORE_BEREITSCHAFT.md](PLAY_STORE_BEREITSCHAFT.md), [docs/PLAY_STORE_SUBMISSION_GUIDE.md](docs/PLAY_STORE_SUBMISSION_GUIDE.md), [docs/APK_VARIANTEN.md](docs/APK_VARIANTEN.md).

## Deployment (Render + Neon)

Produktiv läuft der Server auf Render mit Neon-Postgres; deploys erfolgen automatisch über [render-deploy.yml](.github/workflows/render-deploy.yml) (inkl. Auto-Migrate und `--domain`-Modus für Custom Domains). Der Workspace-Service persistiert Audit-Events und WIP-Dateien über Neon (Schema `workspace_service`).

Unterlagen: [docs/render-deployment.md](docs/render-deployment.md), [docs/SPRINT_84_CUSTOM_DOMAIN.md](docs/SPRINT_84_CUSTOM_DOMAIN.md), [docs/SPRINT_85_PERSISTENT_DISK.md](docs/SPRINT_85_PERSISTENT_DISK.md), [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Konfiguration

Alle Umgebungsvariablen sind mit Erklärungen in [.env.example](.env.example) dokumentiert: Kernbetrieb (DB, JWT, Origins, Rate-Limits), optionale OAuth-Logins, KI-Provider-Keys (ENV-Keys dürfen Key-Pools enthalten und rotieren autonom), Stripe (live/test), Render-/Discord-/Ops-Integrationen und der autonome Engineering-Optimizer-Loop. **Echte Werte nur in die lokale `.env` — niemals committen**; Secrets-Handling und Release-Abläufe: [docs/SECRETS_AND_RELEASE.md](docs/SECRETS_AND_RELEASE.md).

## Projektstruktur (Auszug)

```
app/            Expo-Screens (expo-router)
components/     UI-Komponenten (Glass-Primitives: GlassCard, GlowButton, MetricTile …)
lib/            Client-Logik inkl. lib/design (Design-Tokens, Glass-Atmosphere-Logik)
server/         Node-Server: tRPC-API, Provider-Routing, LLM-Integration, Secret-Vault
workspace-service/  Autonomer Workspace-Service (Preview, Persistenz über Neon)
drizzle/        Migrationen (Drizzle ORM)
scripts/        Seed-, Verify-, QR-, Smoke-Test- und Deploy-Skripte
tests/          Vitest-Suite (Logik + Backend)
android/        Eingcheckede native Quellen der Wahrheit für Capacitor-Builds
docs/           Sprint-Berichte, Runbooks, Play-Store- und Deployment-Unterlagen
```

Festgelegte Grundentscheidungen: `android/` bleibt eingecheckt und ist die Quelle der Wahrheit für native Builds (Capacitor-APK-Pipeline); `app.config.ts` steuert die Expo-/Web-Seite. Kein Umbau auf Expo-CNG; Major-Upgrades laufen als separate Sprints.

## Dokumentation

- [CHANGELOG.md](CHANGELOG.md) — alle Änderungen je Release/Sprint
- [NEXT_STEPS.md](NEXT_STEPS.md) — Roadmap und festgelegte nächste Schritte
- [docs/SPRINT_PLAN_22_31.md](SPRINT_PLAN_22_31.md), [SPRINT_PLAN_32_41.md](SPRINT_PLAN_32_41.md) — Sprint-Planung
- [docs/ROADMAP_AB_SPRINT_107.md](docs/ROADMAP_AB_SPRINT_107.md) — Roadmap
- [docs/DEPENDENCY_MATRIX.md](docs/DEPENDENCY_MATRIX.md) — Abhängigkeiten
- [DATENSCHUTZ.md](DATENSCHUTZ.md) — Datenschutzerklärung
- [docs/](docs/) — Sprint-Abschlussberichte (u. a. Autonomie-Programm 74–82, V2-Release 97–106, On-Server-KI, Review & Betriebswacht)

## Sicherheitsgrundsätze

- Keine Secrets im Code; Gitleaks blockiert jeden Push/PR mit Fund (voller Verlauf).
- Release-APKs werden über Keystore-Secrets in GitHub Actions signiert und per `apksigner` geprüft; Service-Account-Keys bleiben außerhalb des Repos.
- Admin-Telemetrie und Elite-Features sind RBAC-geschützt (Rollen-Tiers mit Admin-Dashboard).

---

© CyberSarah — Wartung und Weiterentwicklung erfolgen sprintweise; jede Änderung folgt dem Akzeptanzkriterium: TypeScript sauber, volle Vitest-Suite grün, Server-Build erfolgreich, CI grün.
