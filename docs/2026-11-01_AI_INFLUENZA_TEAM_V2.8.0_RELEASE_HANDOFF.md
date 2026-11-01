# AI Influenza Team — v2.8.0 Release Handoff
Date: 2026-11-01

## Scope
Phase 7 adds AI Influenza Team as a CyberSarah business unit with three recurring service packages, eight specialist agents, B2B CRM pipeline, persistent order/task orchestration, Stripe subscription checkout, verified payment attribution, content/video delivery planning, mobile operations dashboard, and revenue/profit reporting.

## Production gates
The release is not complete until all of the following are verified on the exact merge commit:
- TypeScript validation
- ESLint
- complete deterministic Vitest suite
- PostgreSQL multi-worker gate
- Gitleaks
- workspace-service syntax/build
- Revenue-OS readiness
- Render deployment health
- Android workflow produces signed admin APK + signed AAB with checksum/signature verification

## Stripe
No automated test creates a live payment.
The package checkout endpoint is a real authenticated Stripe Checkout path and runs only when a user intentionally starts checkout.
Real order state reaches `paid` only through verified Stripe subscription/webhook processing.
Revenue is recognized only from verified paid Stripe invoice events.

## Test customer
`aiInfluenzaTeam.testJourney` is a non-operative QA journey:
- test-only payment status
- no Stripe call
- no contract execution
- no external message
- no publishing action
It verifies the complete workflow/state machine and package delivery plan.

## Deployment
Render uses the existing CyberSarah deployment path; this feature introduces no new public service or separate database.
No new required schema migration is introduced: AI Influenza Team deliberately reuses b2b_network_nodes, revenue_jobs, draftQueue, publishingJobs, billingSubscriptions, revenueAttributionEvents and revenueCostEvents.

## Rollback
Rollback the v2.8.0 merge commit. Existing CyberSarah billing, Revenue OS, publishing and B2B tables remain compatible because no new destructive migration is required.

## External handoffs
A real Android device test remains required after APK build to confirm login, AI Influenza Team navigation, checkout link opening, network resume and dashboard scrolling.
Business success remains separate from technical release: qualified inquiry, sales conversation, paying customer, recurring revenue and positive contribution margin must be measured from real events.
