# CyberSarah CX Workforce — implementation boundary

## Current release slice

This slice adds an admin-only, deterministic CX triage foundation. It is deliberately not described as an autonomous AI responder.

- Classifies supplied support text into security, refund, billing, technical, account, product, complaint, or general.
- Produces priority, queue, conservative confidence, human-review requirement, and a German response draft.
- Security incidents are critical and routed to security review.
- Refunds, complaints, and low-confidence cases require a human.
- Replies are draft-only. This slice does not send email, create/update HubSpot tickets, issue refunds, or change customer records.
- The admin readiness endpoint distinguishes HubSpot token configuration from live ticket/conversation connectivity.
- Admins can persist triage cases in a database-backed queue using the existing settings key/value table (no schema migration). The queue stores classification metadata and response drafts only; original messages, subjects and customer email addresses are not persisted. External references are SHA-256 deduplicated per source.

## tRPC surface

- `cxWorkforce.readiness`: admin-only integration boundary and remaining prerequisites.
- `cxWorkforce.previewTriage`: admin-only single-request preview.
- `cxWorkforce.batchPreview`: admin-only batch preview, maximum 50 items; no external writes.
- `cxWorkforce.liveInboxSnapshot`: read-only ticket and conversation metadata snapshot; reports ticket and Conversations API access independently, limits each response to 50 records, and never returns message bodies.
- `cxWorkforce.recordTriage`: persists an admin-submitted triage result without storing the original message.
- `cxWorkforce.caseQueue`: reads the latest persisted cases for admin review.

## Production integration still required

1. Validate the private-app scopes for tickets read/write and conversations read.
2. Add a signed inbound webhook or bounded poller for the configured support inbox.
3. Extend the metadata-only case queue with inbound ticket/message deduplication, immutable audit events, retry scheduling, and dead-letter state. The current queue deduplicates optional external references but is not yet an inbound event processor.
4. Add retrieval over approved CyberSarah support documentation; never invent prices, refund eligibility, SLAs, or product capabilities.
5. Add an approval UI and an audited send path. Keep security, billing, refunds, complaints, legal threats, and low-confidence cases human-gated.
6. Run an end-to-end test using a dedicated test inbox and synthetic customer; never create sample records in the live CRM.

## Validation

Unit tests cover routing, escalation, draft-only behavior, conservative fallback, and input bounds. The repository CI must run typecheck, lint, and the full test suite for this stacked PR (base branch: `feat/unified-observability-growth-command-center`). Both `push` and `pull_request` workflow filters include that base branch so PR synchronization runs the full gate.
