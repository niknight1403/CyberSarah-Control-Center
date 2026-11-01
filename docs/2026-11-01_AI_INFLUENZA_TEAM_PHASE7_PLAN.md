# AI Influenza Team — Phase 7 Integration Plan
Date: 2026-11-01

## Objective
Add **AI Influenza Team** as a revenue business unit inside CyberSarah Control Center (CCC). The first product goal is one fully bookable and deliverable recurring service with a traceable customer/order lifecycle.

## Repository audit — reuse map

| Requirement | Existing CCC capability | Integration decision |
|---|---|---|
| Billing / subscriptions | Stripe Checkout, Billing Portal, verified webhooks, billingSubscriptions | Reuse; add agency package checkout metadata and sync |
| Customer / lead graph | b2b_network_nodes + b2b_network_edges | Reuse; AI agency lead/customer metadata lives on B2B nodes |
| Orders / tasks / retries | revenue_jobs | Reuse; business-unit jobs use ai-influenza-* kinds and dedupe keys |
| Content drafts | draftQueue + campaign bridge | Reuse; no second content queue |
| Social delivery | publishingJobs + approval/retry/policy gates | Reuse; no direct uncontrolled publishing |
| Revenue analytics | revenueAttributionEvents, revenueCostEvents, Revenue Supervisor | Reuse; agency payment/cost events are tagged by business unit |
| Agent intelligence | specialist agents + control-center autopilot | Add an 8-agent agency registry and deterministic task routing |
| LLM routing | managed provider chain, rate limits, circuit breakers, local fallback | Reuse; no new provider router |
| Auth / permissions | protectedProcedure + adminProcedure | Package checkout requires authenticated user; operational control is admin-only |
| Mobile UI | Expo/React Native tabs, dark/neon design system | Add a dedicated AI Influenza Team tab |
| Release | CI, Gitleaks, PostgreSQL gate, Render deploy, Android APK workflow | Reuse existing gates |

## Data ownership
No parallel CRM or payment database is introduced.

- **Lead / customer**: b2b_network_nodes
- **Relationship state**: b2b_network_edges
- **Order / task / retry**: revenue_jobs
- **Content approval**: draftQueue
- **Publishing**: publishingJobs
- **Subscription truth**: billingSubscriptions + verified Stripe webhook state
- **Revenue truth**: verified Stripe invoice/payment events tagged in revenueAttributionEvents
- **Cost truth**: revenueCostEvents tagged with AI Influenza Team order/package metadata

## Permission model
- Public/unauthenticated: no operational mutation.
- Authenticated customer: view package catalog, create Stripe checkout, open Stripe portal.
- Admin: create/qualify leads, orchestrate orders, approve work, record verified delivery costs, inspect health.
- External publishing, contracts, money movement, and sensitive customer actions stay behind existing explicit authorization/policy gates.

## Autonomy modes
- **manual**: every workflow transition requires approval.
- **assisted** (default): internal planning/content/task work can proceed; external actions require approval.
- **autopilot**: only pre-authorized reversible/low-risk internal steps may proceed within configured budgets.

## Ten-sprint implementation sequence
1. Audit and integration plan.
2. Business domain, packages, agent team, workflow/RBAC contracts.
3. Persistent order/task orchestration on revenue_jobs.
4. Stripe package checkout, subscription sync, portal and verified payment attribution.
5. CRM lead pipeline and compliant contact-preparation workflow.
6. Content/video delivery planning on existing draft/media/publishing systems.
7. Mobile AI Influenza Team dashboard and agent control.
8. Revenue/profit/cost analytics and reporting.
9. Unit/integration/security/E2E regression and performance checks.
10. Production readiness, deploy/release documentation and release handoff.

## Non-negotiable truth rules
No fabricated customers, revenue, payment success, provider capacity, or test result. A sandbox/test customer is explicitly labeled test-only. No live payment is triggered by automated tests.
