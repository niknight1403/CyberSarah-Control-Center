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

The issued-upload registry is currently process-memory only. It is not durable across restarts or multiple API instances, and it does not yet bind an upload to an authenticated operator/tenant record. Do not use this path as a production multi-instance upload workflow until a persistent upload-intent table with owner, expiry, state, and one-time confirmation is implemented.

The upload confirmation validates the actual GCS metadata. Confirmation does not itself grant public ACL visibility. Public visibility must remain a separate, explicit operation after a verified publishing workflow.
