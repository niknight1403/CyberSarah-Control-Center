# GxP / Quality Compliance Guardrails

## Scope and status

This document defines the safe integration boundary for a configurable quality/compliance layer in CyberSarah. It is an engineering foundation only. It does **not** claim GxP compliance, regulatory validation, certification, or suitability for a regulated production environment.

The initial default profile is **general quality governance**. Regulated profiles (GMP, GLP, GCP, GDP and related jurisdiction-specific controls) must remain disabled until the operator identifies the regulated domain, applicable jurisdiction, intended use, system boundary, and validation owner.

## Non-negotiable automation gates

1. **No autonomous regulated decision:** AI may classify, summarize, retrieve approved procedures and prepare drafts. It must not release a batch, disposition a deviation, approve a CAPA, change a controlled document, authorize a refund with regulated impact, or close a quality event.
2. **Human authorization:** controlled actions require an authenticated, role-authorized human approval. High-impact actions should require independent second-person approval (four-eyes) where the applicable procedure requires it.
3. **Auditability:** record actor/service identity, UTC timestamp, action, object identifier, before/after version references, reason, policy version, approval identities and outcome. Audit events must be append-only at the application boundary and tamper-evident at rest.
4. **Controlled records:** preserve document identity, version, effective date, owner, review status, approval evidence and supersession relationship. Never silently overwrite an approved version.
5. **Data integrity:** define access control, attribution, contemporaneous recording, original-record preservation, accuracy, completeness and retention for each record class.
6. **AI traceability:** retain model/provider identifier, model version where available, prompt/template version, retrieved source identifiers and versions, output hash, confidence/abstention state, reviewer and final disposition. Avoid storing unnecessary personal or sensitive data.
7. **Fail closed:** missing identity, permission, policy, source provenance, audit persistence or approval means the controlled action is blocked.
8. **Incident handling:** security, data-integrity and quality events route to a human owner; the AI may prepare a draft but cannot resolve or suppress the event.

## Integration points

- **CX Workforce:** support messages that mention product quality, safety, adverse events, complaints, data integrity or regulated records are routed to a quality-review queue. The customer-facing response remains draft-only until approved.
- **AI Workforce:** agents receive a policy decision before tool execution. The policy decision is logged and must be rechecked immediately before a controlled write.
- **Knowledge base:** only approved, effective procedures may be used for operational guidance. Draft, obsolete or superseded documents are excluded by default.
- **Documents:** versioned review and approval lifecycle; no direct AI publication.
- **Audit:** append-only event interface, integrity verification and export for authorized reviewers.
- **Access:** least privilege, separation of duties, periodic access review and emergency-access logging.

## Required implementation sequence

1. Confirm intended industry, regulated activity, jurisdiction and applicable standards with the system owner.
2. Produce a system inventory, data-flow map, GxP impact assessment and risk assessment.
3. Define roles, separation-of-duties matrix, record classes, retention and electronic-signature requirements.
4. Implement append-only audit events with integrity verification and tested backup/restore.
5. Implement policy enforcement at every server-side write boundary (not only in the UI).
6. Implement controlled-document versioning, approval and effective-date enforcement.
7. Add validation evidence: requirements traceability, risk-based test protocols, executed results, deviations and release approval.
8. Run a dedicated test environment and qualification/validation process before any regulated use.

## Acceptance criteria for a future production release

- Unauthorized and unapproved writes are blocked server-side.
- Audit events are attributable, timestamped, append-only and integrity-verifiable.
- Every controlled action references the active policy and controlled-document versions.
- Approval and signature evidence is bound to the exact record version and action.
- Replay, duplicate delivery, retry, clock drift, backup/restore and permission-change scenarios are tested.
- Validation evidence is reviewed and approved by the responsible quality function.
- Production enablement is an explicit, documented release decision.

## Explicit exclusions in this foundation

No electronic signatures, validated audit trail, validated computer system, Part 11 / Annex 11 compliance, GMP release workflow, adverse-event reporting, or regulated record retention is implemented or claimed by this document. These require a defined intended use and dedicated technical and quality validation.


## Implemented technical foundation (PR branch)

- Admin-only `gxpCompliance.readiness` reports the explicitly non-validated state and disabled regulated profiles.
- Admin-only `gxpCompliance.evaluateAction` records a policy decision and **always blocks** controlled actions because no verified approval workflow exists yet. A caller-supplied approval reference is recorded but is not treated as authorization.
- Admin-only `gxpCompliance.auditRecent` reads recent application audit records.
- Audit records use unique keys and SHA-256 record digests. This is an application-level integrity aid only; the current KV-backed store is not independently immutable, tamper-proof, or a validated regulatory audit trail.
- If the audit store is unavailable, policy evaluation throws and the controlled action remains blocked.

These endpoints are not a substitute for server-side enforcement at every business write path. No existing batch, CAPA, document, refund or quality workflow is wired to this gate yet. The router is a guarded foundation, not an active system-wide interlock.

## CX quality-signal handling added in this branch

- `cxWorkforce.recordTriage` now detects a conservative set of potential quality-event terms (for example deviation/CAPA, contamination, product defect, recall, adverse effect and data-integrity indicators).
- A detected signal forces `humanReviewRequired=true` and adds the metadata escalation reason `potential_gxp_quality_event`.
- The persisted CX case stores only the matched rule terms and review flags as governance metadata; it does not store the original customer message or subject.
- `automaticDispositionAllowed` is always false. This is keyword-based triage support, not a validated classifier and not a determination that a report is legally a regulated quality event.
- Ordinary support messages remain on the existing CX route. All customer replies remain draft-only; no HubSpot writes or outbound messages were added.
## Dedicated CX quality-event queue

- Admin-only `cxWorkforce.qualityEventQueue` lists persisted CX cases that contain a potential quality signal.
- Newly detected signals receive the workflow marker `awaiting_human_quality_review`; routine cases are marked `not_applicable`.
- This queue is a review inbox only. It does not permit closure, CAPA approval, disposition, document release, or customer communication.
- There is not yet an assignment/ownership workflow, status-transition API, SLA engine, or immutable event history. Those must be implemented and tested before operational or regulated use.