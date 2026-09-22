# Threat Model

## Project Overview

CyberSarah Revenue OS is a private Replit deployment for a solo operator that manages autonomous revenue and content agents, a React dashboard, a PostgreSQL database, object storage, OpenAI content generation, and Stripe payment workflows. The production backend is an Express API under `/api`; the frontend is a same-origin dashboard. Because the current deployment visibility is `private`, Replit's outer access controls reduce direct public-internet reachability, but the application still must protect sensitive state and data from any requester that can legitimately reach the private app or induce the operator's browser to send requests.

## Assets

- **Revenue and finance data** — transaction history, campaign ROI, revenue opportunities, and Stripe-derived records. Exposure or tampering would misstate business performance and affect financial decisions.
- **Automation control plane** — agent state, orchestrator jobs, expansion scans, trading controls, and auto-posting actions. Unauthorized use could trigger external side effects, spend tokens, or publish unwanted content.
- **Integration secrets and connector state** — OpenAI API keys, Stripe credentials, social platform tokens, and webhook endpoints. Disclosure or misuse could enable account takeover of external services or fraudulent actions.
- **Generated content and uploaded objects** — AI-generated images, stored files, and posting payloads. These may contain unpublished business material and should not become readable just because a path is known.
- **Operational telemetry** — agent logs, system status, and fallback/error state. These reveal internal behavior, external integration status, and business activity.

## Trust Boundaries

- **Browser to API** — the dashboard client is untrusted and every state-changing API route must enforce its own access expectations.
- **API to PostgreSQL** — the API has broad write access to business and control-plane tables; route-level flaws can directly alter persistent state.
- **API to external services** — the backend sends privileged requests to Stripe, OpenAI, object storage sidecar services, and user-configured webhooks. User-controlled destinations or payloads here can become SSRF, data exfiltration, or unwanted action triggers.
- **API to object storage** — files live in public and private buckets, but access is mediated by application routing and ACL metadata. The app must not treat path knowledge as authorization.
- **Private deployment boundary** — Replit blocks public internet access to this deployment, but that boundary should not be the only protection for sensitive endpoints or files.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**/*.ts`, `artifacts/dashboard/src/main.tsx`
- **Highest-risk backend areas:** `routes/einstellungen.ts`, `routes/storage.ts`, `routes/orchestrator.ts`, `routes/master.ts`, `routes/revenue.ts`, `lib/webhookHandlers.ts`, `agents/InfluencerAutoPostAgent.ts`
- **Public vs authenticated surface:** same-origin dashboard and `/api/**`; no dedicated app-layer auth middleware is currently present, so route-local protections matter.
- **Dev-only areas to usually ignore:** `artifacts/mockup-sandbox/**` per project assumptions; generated `dist/**` artifacts unless needed to confirm production reachability.

## Threat Categories

### Spoofing

The application relies heavily on the private deployment boundary and currently has no visible app-layer session enforcement in the API router. Because the system exposes financial data and automation controls, every sensitive route must only trust callers that are intentionally authorized to use the private deployment. External callbacks also need strong service authentication: Stripe webhooks must be signature-verified whenever the route is reachable.

### Tampering

Many routes directly update campaign state, agent state, webhook destinations, revenue opportunities, and other control-plane records. The system must ensure that only intended callers can trigger those changes and that server-side validation rejects unsafe destinations, malformed state transitions, and forged payment events. File/object access controls must be enforced server-side rather than implied by obscurity of object paths.

### Information Disclosure

Finance data, logs, object storage files, webhook endpoints, and integration status are all sensitive in this product. API responses and file-serving routes must not expose private objects or internal telemetry merely because the deployment is private or because the requester knows an identifier or path.

### Denial of Service

The API can start agent runs, queue jobs, trigger scans, call OpenAI, call Stripe, and post to third-party webhooks. Expensive or side-effecting routes must remain protected against repeated or unintended triggering so that a reachable attacker cannot burn credits, flood external services, or stall the operator’s automation loop.

### Elevation of Privilege

This app is intentionally single-operator and does not need multi-tenant RBAC, but it still must not let a less-trusted reachable caller gain full control over agents, secrets-adjacent settings, or private stored content. Access to `/api` control routes, private object reads, and outbound webhook configuration must not collapse into full-control capability just because the deployment boundary was crossed once.

For future scans, treat the absence of a separate in-app user model as non-reportable by itself in this project. Re-propose it only when a concrete reachability flaw makes third-party use realistic (for example, browser-mediated access, leaked deployment access, or another boundary bypass).