# GxP Governance Foundation

## Scope and status

This is a technical governance foundation, not a validated GxP system, regulatory opinion, certification, or proof of compliance. It is framework-configurable for GMP, GDP, GLP, GCP and generic GxP workflows. A regulated deployment still requires a documented intended-use assessment, risk assessment, validated procedures, qualified infrastructure, supplier assessment, training, and formal validation by the responsible quality organization.

## Implemented control surface

- Admin-only tRPC mutation: `gxpGovernance.evaluateGate`.
- Deterministic assessment for document changes, quality events, deviations, CAPA, training, releases and support escalations.
- Requires a controlled SOP reference and traceable evidence identifiers.
- Document changes and releases require a change-control reference.
- High-risk activities require two distinct quality approvers other than the initiating actor.
- Evidence references are constrained to opaque identifiers; free-form text and email-like identifiers are rejected.
- The result is assessment-only. It always returns `allowedToExecute: false`; it cannot approve, release, close, modify, or send anything.

## CX Workforce relationship

CX can flag a support case as a potential quality event or deviation for assessment. It must not create a formal deviation/CAPA record or notify regulators automatically. A qualified quality owner must review and decide the regulated workflow.

## Required before any regulated production use

1. Define intended use, applicable regulations/annexes, system boundary and GxP impact.
2. Establish validated requirements, risk controls, traceability matrix and test evidence.
3. Implement immutable, tamper-evident audit records with trusted time source and retention controls.
4. Add identity federation, role separation, electronic signatures and signature meaning where applicable.
5. Implement controlled document/SOP lifecycle, training records, change control, deviation and CAPA workflows.
6. Validate backup/restore, disaster recovery, access reviews, supplier controls and periodic review.
7. Conduct formal validation and quality approval; do not represent this foundation as compliant until then.

## Safety boundary

No autonomous quality decisions, electronic signatures, record approvals, release decisions, customer replies or external writes are enabled by this module.
