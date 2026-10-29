# 2026-10-29 — Digistore24: 10 production-hardening sprints

## Scope & acceptance
1. **Money:** sales positive, refunds/chargebacks negative regardless of upstream sign; malformed or oversized amounts rejected.
2. **Identity:** missing commission IDs rejected instead of grouping into the shared "unknown" order.
3. **Historical idempotency:** preserve existing keys (`d24:<id>:sale|refund`, `<order>:<event>`) so earlier conversions are not replayed on upgrade. Oversized keys become SHA256-based.
4. **Bounded upstream reads:** 1–90 day windows, at most 20 pages per transaction type, accurate page count.
5. **Timestamp handling:** validate timestamps and use a defined fallback if malformed.
6. **Data minimization:** only safe allowlisted fields in JSON payload, no raw buyer identifiers; keyed HMAC for email when server secret exists.
7. **API failures:** sanitize upstream errors and distinguish auth, rate-limit, unavailable, rejected.
8. **Polling vs IPN:** REST is a fallback only when IPN is not configured. Parallel polling is blocked. Refund and chargeback are retrieved separately.
9. **Atomic persistence:** both API and IPN insert event and update aggregates in a single DB transaction; invalid SHA512 signatures fail closed.
10. **Deploy gate & regression:** validate real read-only commission permission before forwarding a key; invalid keys are quarantined and transient failures stop deployment rather than silently deleting a working key. Deterministic tests plus CI/secret scan required.

## Live limitations and caution
- Existing Digistore24 GitHub API key was observed invalid on 2026-10-28 (`result=error, code=2`). This change cannot issue a real new key.
- No `DIGISTORE24_IPN_SECRET` nor legacy passphrase was present in the GitHub Secrets as checked on 2026-10-28.
- A valid read-only API key is required for REST commission sync. A valid Digistore24 IPN passphrase is required for signaturgeschuetzte real-time IPN.
- No real payments or checkout were generated during this implementation.
- The REST/IPN mode is mutually exclusive to avoid future double ingestion, but historical revenue already written by both sources may require an explicit reconciliation audit; it is **not** silently rewritten.
- No revenue guarantee. Publishing, prices, purchases and external campaigns stay approval-gated.

## Operational verification
- `npm run check` + `npm run lint` + `npm run test:coverage` in canonical PR CI.
- Render deploy must pass schema preflight/migrations and `/api/health` check.
- Missing IPN secret must yield 503 (not an accepted unsigned IPN); configured secret must reject unsigned payloads with 401.
- Ensure missing/invalid REST key reports unavailable or quarantined, never fabricated conversions.
