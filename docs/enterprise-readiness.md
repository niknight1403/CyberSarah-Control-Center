# Enterprise Readiness Status

## Implemented and verified

The platform currently provides an Express/tRPC backend, Drizzle ORM with MySQL schema and migrations, local account authentication plus OAuth integration, JWT/session handling, admin-aware RBAC procedures, Stripe Checkout and Billing Portal, signature-verified Stripe webhooks, provider selection with local/cloud status, provider failover, GitHub workspace operations, external-action audit emission, CI validation, PM2 deployment scripts, and mobile account/agent interfaces.

The HTTP entrypoint now uses an explicit CORS allowlist, security response headers, proxy-aware client addressing, and a bounded per-process rate limit. Production origins must be configured through `APP_ALLOWED_ORIGINS`; the default production behavior rejects browser origins when no allowlist is configured.

The server-side validator `scripts/validate-production.sh` checks the protected `.env`, the public `/api/health` response, a real MySQL `SELECT 1`, the PM2 process, and the Nginx server block for `app.cybersarah-ki.com`. It must be run on the target server after secrets are installed; it cannot validate a server that is not reachable from the development workspace.

## Infrastructure not claimed as active

Redis queues, a distributed event bus, LangGraph runtime, FastAPI service, PostgreSQL deployment, Prometheus/Grafana stack, plugin loading, automated API-key rotation, affiliate/CRM/revenue modules, and production backup orchestration are not present in the repository. They must not be represented as enabled until a concrete provider, deployment topology, data-retention policy, and operational ownership are supplied.

The current in-process rate limiter is a protective baseline for a single PM2 process. When multiple backend replicas or a queue worker are introduced, it must be replaced or backed by a shared Redis limiter and queue, with retry, dead-letter, idempotency, and shutdown semantics tested before rollout.

## Required production decisions

Before enabling additional enterprise subsystems, define the canonical deployment target, replica count, Redis availability, backup destination and retention, monitoring endpoint exposure, incident owner, and secret rotation procedure. Keep MySQL unless a tested migration plan justifies PostgreSQL; introducing both databases without a migration need would create operational risk.

The current dependency audit is not clean: the package tree reports transitive high/critical advisories, including `fast-uri` and `tar`, with 140 findings in the current audit output. The application build and tests pass, but this is a release blocker for an enterprise security gate. Remediation requires a controlled dependency upgrade or override plan compatible with the Expo toolchain; do not use an unreviewed force upgrade in production.
