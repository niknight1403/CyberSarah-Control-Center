# Revenue Throughput Supervisor — 2026-11-01

## Mission
Revenue-first control plane for CyberSarah Control Center. The supervisor does not invent revenue. It combines measured funnel, payment, database and provider health into a single prioritized operating view.

## Live audit findings
- CCC Render service is live and starts the Publishing Autopilot, Channel Autopilot and Influencer Learning loops automatically.
- Publishing Autopilot runs every 60 seconds.
- Channel Autopilot runs an Observe → Diagnose → Draft → Learn cycle every 15 minutes.
- Influencer Learning runs every 15 minutes.
- Control Center Autopilot has completed real HARA and Expansion scans successfully in production logs.
- Production logs also show repeated LLM network retries. Provider capacity therefore remains a real throughput risk and is surfaced by the supervisor.
- The separate Render database `cybersarah-revenue-os-db` is suspended with a billing suspension. This is not silently treated as a healthy source.
- Stripe webhook handling is signature-verified and distinguishes permanent signature failures from retryable processing failures.
- Digistore24 IPN verifies SHA512 signatures, deduplicates events, writes conversion/revenue data transactionally and refuses events when the secret or database is unavailable.

## Supervisor output
- Current measured Stripe MRR and active subscriptions.
- Latest 7-day revenue versus previous 7-day revenue.
- 30-day revenue run-rate derived from measured daily revenue.
- Funnel conversion and narrowest measurable bottleneck.
- Stripe API/catalog health and webhook-secret readiness.
- Digistore24 API/IPN readiness.
- Database readiness.
- LLM provider circuit capacity.
- Revenue-first repair/scale priorities.

## MRR velocity honesty rule
A projected MRR number is **not** emitted until historical MRR and churn/cohort snapshots exist. Current MRR remains measured. Revenue run-rate is shown separately and must not be mislabeled as recurring revenue.

## Autonomous boundaries
Analysis, scoring, persona selection, content drafts, B2B prioritization, funnel diagnosis and experiment drafting may run autonomously. Unsolicited outreach, irreversible publishing, price changes and money movement remain behind existing approval/policy gates.


## Verified readiness evidence
The repository Revenue-OS readiness gate confirmed on 2026-11-01 that Stripe is reachable in LIVE restricted-key mode, the protected Revenue Bridge is reachable with authenticated reads, the Groq free LLM route is ready, Revenue DB access is available through the protected bridge, and commerce mode is LIVE. Direct database tunnel attempts remain unavailable and are therefore not treated as the production source of truth.
