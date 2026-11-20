# GxP Governance Foundation

## Scope and status

This is a technical governance foundation, not a validated GxP system, regulatory opinion, certification, or proof of compliance. It is framework-configurable for GMP, GDP, GLP, GCP and generic GxP workflows. A regulated deployment still requires a documented intended-use assessment, risk assessment, validated procedures, qualified infrastructure, supplier assessment, training, and formal validation by the responsible quality organization.

## Implemented control surface

- Admin-only tRPC mutation: `gxpGovernance.evaluateGate`.
- Deterministic assessment for document changes, quality events, deviations, CAPA, training, releases and support escalations.
- The initiating actor is taken from the authenticated server session, never from client input.
- Requires a controlled SOP reference and traceable evidence identifiers.
- Document changes and releases require a change-control reference.
- High-risk activities remain blocked until a trusted quality-approval workflow exists.
- The API does not accept approver IDs. Client-declared identities are not evidence of approval and must never be treated as signatures.
- Evidence references are constrained to opaque identifiers; free-form text and email-like identifiers are rejected.
- Every successful gate assessment is written to the dedicated `gxp_audit_events` table. The event contains minimized assessment metadata only; SOP/evidence references and customer content are not copied.
- Audit events are linked by SHA-256 hashes. Writers take a PostgreSQL transaction-scoped advisory lock so concurrent events cannot fork the chain.
- Database triggers reject UPDATE, DELETE and TRUNCATE on the audit table. Admin-only `gxpGovernance.auditIntegrity` recomputes the chain and reports the first broken event.
- The result is assessment-only. It always returns `allowedToExecute: false`; it cannot approve, release, close, modify, or send anything.

## CX Workforce relationship

CX can flag a support case as a potential quality event or deviation for assessment. It must not create a formal deviation/CAPA record or notify regulators automatically. A qualified quality owner must review and decide the regulated workflow.

## Required before any regulated production use

1. Define intended use, applicable regulations/annexes, system boundary and GxP impact.
2. Establish validated requirements, risk controls, traceability matrix and test evidence.
3. Harden the audit ledger operationally: restricted database roles, protected backups/WORM export, trusted time source, retention controls, external hash anchoring and periodic independent verification. The current database trigger/hash chain is tamper-evident against ordinary application writes, not proof against a database owner or privileged operator.
4. Add identity federation, role separation, a trusted approval registry and electronic signatures with signature meaning where applicable.
5. Implement controlled document/SOP lifecycle, training records, change control, deviation and CAPA workflows.
6. Validate backup/restore, disaster recovery, access reviews, supplier controls and periodic review.
7. Conduct formal validation and quality approval; do not represent this foundation as compliant until then.

## Safety boundary

No autonomous quality decisions, electronic signatures, record approvals, release decisions, customer replies or external writes are enabled by this module.
