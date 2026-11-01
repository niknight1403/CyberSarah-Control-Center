# Revenue hardening: 10 independently tested milestones (2026-11-01)

This change builds on PR #165's opt-in meter ledger. The implementation is deliberately **pure and not wired into live triggers**. Each numbered milestone has a matching deterministic Vitest case in `tests/revenue-sprint-primitives.test.ts`.

1. **Tenant billing gate:** verify tenant-to-Stripe mapping, active subscription and enabled flag before a meter can be selected.
2. **Meter-queue observability:** count pending, in-flight, sent, failed and retried events from persisted rows.
3. **Stripe reconciliation:** detect local sent event IDs missing in provider receipts. Requires a real Stripe receipt-fetching adapter before production.
4. **CRM page safety:** parse next-page cursor and detect loops before continuing HubSpot sync.
5. **CRM checkpoint validation:** validate batch count and determine safe continuation cursor. Persistence still needs implementation.
6. **Outreach consent gate:** require approval, recorded consent, non-unsubscription and verified sending domain.
7. **Suppression checks:** normalize recipient addresses before suppression-set lookup. The suppression set must come from a durable authoritative datastore.
8. **Outreach scheduling:** generate future UTC dispatch times without sending messages.
9. **Weekly content planning:** calculate draft due time; publishing stays approval-gated.
10. **Attributable revenue snapshots:** calculate MRR, conversion and API events from explicitly identified data with timestamp; reject malformed totals. This is **not** a live Stripe aggregation.

## Go-live blockers

- Integrate with existing authenticated tRPC routes and actual database tables. No UI or cron is enabled here.
- Implement real HubSpot page fetch and encrypted tenant credentials; resolve vendor permissions.
- Persist and audit suppression, consent, marketing approvals and checkpoint state.
- Validate verified-domain configuration, rate limits, unsubscribe handling and legal basis for B2B outreach before delivery.
- Wire MRR to reconciled Stripe subscriptions and API calls to trustworthy server-side telemetry.
- Validate fresh CI, Docker/PM2 runtime and provider sandbox E2E before claims of production readiness.

## Verification
```bash
npm ci
npm test -- tests/revenue-sprint-primitives.test.ts
npm test
npm run check
npm run build
```

## Admin tRPC integration (follow-up)
The existing `revenueIntegrations` tRPC router now exposes six admin-only endpoints:
`safetyStatus`, `schedulePreview`, `outreachWindowPreview`,
`outreachPolicyPreview`, `crmPaginationPreview`,
`meterQueuePreview`, and `attributedMetricsPreview`.
All are queries and accept caller-provided preview data; they make no
outbound requests, charge no customers and send no messages. The returned
policy decision is **not** authorization for sending until durable consent,
suppression and approved records are checked server-side. Do not advertise
preview metrics as measured MRR.

## Additional API-level regression coverage
`tests/revenue-integrations-api.test.ts` exercises the actual admin tRPC
caller and checks forbidden access for unauthenticated/non-admin users,
explicitly disabled live functionality, draft-only planning, no-send outreach
previews, supplied-data provenance and invalid KPI rejection. The test stubs
the request context and does not contact external providers.

This is a **test implementation**, not a claim of successful CI or real
provider E2E. Build status must be taken from the corresponding PR head SHA.
