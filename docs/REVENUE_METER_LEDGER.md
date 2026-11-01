# Stripe metered-billing durability increment (2026-11-01)

## What is implemented
`server/revenue-meter-ledger.ts` provides parameterized SQL storage for
validated usage events, unique IDs, replay collision protection, cross-worker
`FOR UPDATE SKIP LOCKED` claims, 90-second leases, bounded retries and
attempt-fenced acknowledgement. Stripe sends reuse the persistent event ID.
Its Vitest suite uses deterministic SQL and HTTP fakes.

## Deployment gate (not automatically enabled)
1. Apply `METER_LEDGER_SCHEMA` to the existing PostgreSQL database in a
   controlled migration after a backup. This file does **not** automatically
   execute DDL or modify production data.
2. Map customer IDs and meter event names to active Stripe meter configuration.
   Only enqueue server-verified, billable usage after validating subscription and
   tenant ownership. Never accept a client-supplied customer ID or billable units.
3. Inject a `pg` Pool (its `query` method satisfies `SqlClient`) and run
   `dispatchOneMeterEvent` from an **explicitly enabled** worker.
4. Use Stripe test mode for initial dispatch and reconcile every event to Stripe
   Meter Events and subscription invoices before enabling live keys.
5. Monitor failed attempts, billing disputes, and queue age. Keep a manual
   replay path requiring an audit trail.
6. Run `npm test -- tests/revenue-meter-ledger.test.ts`, `npm test`,
   `npm run check`, `npm run build`, then validate Docker and PM2 where used.

## Important limits
No production worker, schedule, customer-mapping, secret propagation or webhook
reconciliation is enabled by this change. Provider-side idempotency and network
outages demand independent end-to-end verification. A timeout after sending may
have reached Stripe; the stable event ID is required for safe retry. This module
alone does not establish billing correctness or live MRR.

Also outstanding: HubSpot credentialed incremental synchronization,
Firecrawl DNS/private-IP defenses, consent evidence and suppression-list
enforcement for outreach, weekly publishing approval and real-time KPI
aggregation from authoritative Stripe/Postgres data.

## Admin database-backed queue health (2026-11-01)
The `revenueIntegrations.meterQueueHealth` admin query uses the existing Drizzle
Postgres pool and `readMeterQueueHealth`. It is read-only and returns
`available:false` when the database is missing, migration not applied or a query
fails. A missing table must **never** be represented as an empty healthy queue.

Database prerequisites: apply the reviewed `METER_LEDGER_SCHEMA` migration
from `server/revenue-meter-ledger.ts`. The new endpoint does not apply schema,
enqueue usage, dispatch Stripe events, start workers, change customer records
or collect live MRR.

## Observed delivery blocker
The latest PR-head commit has no confirmed GitHub Actions workflow runs from
the available status query. The external Vercel status reports a build-rate-limit
upgrade URL; this does not prove application code is broken. Investigate the
provider's build quota or disable unnecessary PR preview builds before rerunning
full CI and staging E2E. Do not merge or activate live billing on this evidence.
