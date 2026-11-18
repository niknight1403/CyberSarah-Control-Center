# CyberSarah CX Workforce — implementation boundary

## Current release slice

This slice adds an admin-only, deterministic CX triage foundation. It is deliberately not described as an autonomous AI responder.

- Classifies supplied support text into security, refund, billing, technical, account, product, complaint, or general.
- Produces priority, queue, conservative confidence, human-review requirement, and a German response draft.
- Security incidents are critical and routed to security review.
- Refunds, complaints, and low-confidence cases require a human.
- Replies are draft-only. This slice does not send email, create/update HubSpot tickets, issue refunds, or change customer records.
- The admin readiness endpoint distinguishes HubSpot token configuration from live ticket/conversation connectivity.

## tRPC surface

- `cxWorkforce.readiness`: admin-only integration boundary and remaining prerequisites.
- `cxWorkforce.previewTriage`: admin-only single-request preview.
- `cxWorkforce.batchPreview`: admin-only batch preview, maximum 50 items; no external writes.

## Production integration still required

1. Validate the private-app scopes for tickets read/write and conversations read.
2. Add a signed inbound webhook or bounded poller for the configured support inbox.
3. Persist ticket/message deduplication keys, classification versions, audit records, retries, and dead-letter state.
4. Add retrieval over approved CyberSarah support documentation; never invent prices, refund eligibility, SLAs, or product capabilities.
5. Add an approval UI and an audited send path. Keep security, billing, refunds, complaints, legal threats, and low-confidence cases human-gated.
6. Run an end-to-end test using a dedicated test inbox and synthetic customer; never create sample records in the live CRM.

## Validation

Unit tests cover routing, escalation, draft-only behavior, conservative fallback, and input bounds. The repository CI must still run typecheck, lint, and the full test suite before merge.
