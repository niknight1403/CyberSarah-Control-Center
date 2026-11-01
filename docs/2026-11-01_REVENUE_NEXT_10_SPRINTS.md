# Revenue Evolution — 10 autonome Sprints — 2026-11-01

## Sprint 1 — Gross MRR Acquisition Velocity
Measured `newMrr1dEur` and `newMrr7dEur` are propagated into the Revenue Supervisor. A 30-day gross acquisition run-rate is derived without pretending churn-adjusted net MRR.

## Sprint 2 — Checkout Friction Radar
Checkout completion is classified as insufficient-data, healthy, watch or critical using measured Stripe/funnel signals. The next CRO action is deterministic and evidence-gated.

## Sprint 3 — Cross-Sell Efficiency
Existing cross-sell recommendations and conversions now produce a measured conversion rate, evidence level and measure/optimize/scale action.

## Sprint 4 — B2B Sales Readiness
B2B nodes are classified as hot, warm, nurture or blocked from fit, intent, trust, relationship strength, recency and value evidence. Opt-outs remain blocked.

## Sprint 5 — Next-Best B2B Action
The B2B expansion queue now includes a recommended channel and CTA mode while preserving the existing external-action approval gate.

## Sprint 6 — Provider Capacity
Revenue LLM capacity is classified as healthy, degraded, critical or unknown based on provider circuit state. Degraded mode recommends throttling non-critical generation.

## Sprint 7 — Revenue Incident Classifier
Raw blockers become typed incidents for payments, database, provider, funnel and growth domains with severity, owner and safe repair guidance.

## Sprint 8 — Persistent Incident Queue
Revenue incidents are deduplicated into the existing `revenue_jobs` queue as `revenue-repair` jobs, keeping critical issues recoverable across process restarts.

## Sprint 9 — Safe Self-Healing Plan
Incidents are mapped to auto-safe or approval-required repair actions. Automatic actions remain reversible: health rechecks, LLM throttling and CRO/cross-sell drafts. Secrets, prices and money movement are never silently mutated.

## Sprint 10 — Mobile Revenue Executive Board
The mobile Revenue OS surfaces gross-MRR acquisition, checkout friction, cross-sell efficiency, provider capacity, incident/repair state, hot B2B accounts and next-best actions.

## Acceptance criteria
- No fabricated revenue or MRR projection.
- Opt-outs and external-send approval gates remain intact.
- No autonomous price changes or money movement.
- TypeScript, lint, full deterministic tests, PostgreSQL concurrency gate, workspace build, Gitleaks and Revenue-OS readiness must remain green before merge.
