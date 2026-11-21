# Revenue OS storage upload security

The upload capability endpoints require a server-to-server credential:

- Environment variable: `REVENUE_OS_STORAGE_API_KEY`
- Request header: `X-Revenue-Storage-Key`
- Applies to: `POST /api/storage/uploads/request-url` and `POST /api/storage/uploads/confirm`
- If the variable is absent, both endpoints fail closed with HTTP 503.
- A missing or mismatched header is rejected with HTTP 403.
- The credential must only be configured in the API server environment and must never be placed in dashboard code, mobile builds, logs, or browser storage.

The endpoints continue to accept only PNG, JPEG, and WebP files up to 15 MB. MP4 is intentionally not enabled.

## Remaining limitations

The upload intent is now stored in the Revenue OS PostgreSQL database (`storage_upload_intents`) with a unique object path, declared MIME type/size, expiry, and atomic `pending` → `confirming` → `confirmed`/`rejected` state. The API fails closed when the database is unavailable. This survives process restarts and coordinates confirmation across instances. The principal is currently the single server identity `revenue-os-storage-service`; it is not an end-user or tenant binding. Do not treat this as multi-tenant ownership isolation until authenticated operator/tenant context is integrated.

Confirmation validates the actual GCS metadata against both the global allowlist/15 MB cap and the request's declared MIME type/size. A mismatch is deleted and marked rejected. Transient storage failures release the claim for retry. Confirmation does not itself grant public ACL visibility. Public visibility must remain a separate, explicit operation after a verified publishing workflow.
