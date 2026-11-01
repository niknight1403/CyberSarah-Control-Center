# Revenue Compounding — 10 Sprints (2026-10-28)

This increment extends the existing CyberSarah Revenue Control Plane. It does not create a second revenue database, publishing queue, payment path, or autonomous-spend path.

1. Funnel leak diagnosis: measured stage drop-offs are ranked by evidence and severity.
2. Retention economics: churn, retention, ARPU, estimated LTV, LTV:CAC and payback are computed only from supplied cohort/cost data.
3. Lifecycle planner: onboarding, checkout recovery, dunning, cross-sell and win-back are prioritized; outbound execution remains approval-gated.
4. Creative fatigue: current CTR/conversion decay is compared with the previous measurement window.
5. Incrementality: exposed and holdout cohorts are required before causal scale recommendations.
6. Referral loop: invites/customer, referral conversion and viral coefficient are measured without assumed benchmarks.
7. Offer economics: contribution after refunds and variable costs outranks gross-revenue vanity metrics.
8. Risk-adjusted prioritization: impact, confidence, effort and risk produce one deterministic next-best-action queue.
9. Compounding health: profit, retention, causal lift, funnel health and organic share form a conservative health state; missing dimensions score as missing rather than invented success.
10. Production integration: the Revenue OS v2 overview now exposes funnel intelligence, creative health, growth priorities, compounding health and explicit measurement gaps.

## Safety and autonomy boundary

The intelligence layer may measure, rank, recommend and prepare experiments autonomously. Existing external-action gates remain authoritative for paid spend, price changes, outbound lifecycle messages, publishing, destructive actions and other irreversible effects.

## Current measurement gaps

The canonical data plane already supplies funnel, attribution, subscription summary and cost signals. True retention cohorts still need customer-level cancellation/history events; causal incrementality needs exposed/holdout assignment; referral compounding needs invite/referral events. The overview reports these gaps explicitly instead of fabricating values.
