# Publishing: multi-instance dispatch runbook

This change adds a **PostgreSQL compare-and-swap claim**, not a provider-level exactly-once guarantee.

## State machine
1. `geplant` (due): a single worker may atomically update the row to `in_bearbeitung`, increment `attempts` and obtain the claimed row.
2. Preflight (LLM/content/credentials) happens only after the claim.
3. Before any external publish call, `mode=dispatching` is persisted on the claimed row.
4. An acknowledged provider response is recorded as `veroeffentlicht` with the provider reference.
5. A **pre-dispatch** failure returns to `geplant` under bounded backoff or becomes `fehlgeschlagen` once retries are exhausted.
6. An exception **after arming the dispatch boundary** becomes `versand_ungeklaert`, never an automatic retry.
7. A claim stuck in `in_bearbeitung` for at least 30 minutes is also quarantined as `versand_ungeklaert`.

## Migration and operational checks

Migration `0021_publishing_atomic_dispatch.sql` must be applied **before** starting the new version. The Render deploy workflow runs the migration phase before the application deploy. On migration failure, the workflow must abort rather than start application code using the new enum values.

Check during deployment:
- PostgreSQL enum `publishing_status` includes `in_bearbeitung` and `versand_ungeklaert`.
- Compare-and-swap claims are confirmed by `UPDATE ... WHERE status='geplant' ... RETURNING`.
- Simultaneous dispatch workers never receive the same claimed row.
- In the API `publishing.status`, uncertain jobs are visible and are not selected by automatic or bulk retry paths.
- Unknown external outcomes **require reconciliation with the social provider's actual post history**.

## Manual reconciliation

Do **not** blindly change `versand_ungeklaert` to `geplant`. Verify whether the platform published a post, and compare timestamp, content and the provider's external ID. If an external post exists, an authorized administrator must reconcile the DB record with that ID. If it is independently proven not to exist, a deliberately approved resubmission may be arranged; otherwise leave the job quarantined.

`versand_ungeklaert` does not mean delivery failed. A dropped HTTP acknowledgement can happen **after** successful provider acceptance. Similarly, a process crash before sending may produce a conservative false-positive quarantine. This safety choice prevents unwitting duplicate posts at the cost of requiring manual intervention.

## Limits

No provider-side idempotency-key support or cross-provider exactly-once semantics are claimed. A true provider/network concurrency integration test and real-platform replay simulation remain separate acceptance gates. The CI checks pure state transitions and the application TypeScript/Lint/Vitest suite, not actual multi-host dispatches.
