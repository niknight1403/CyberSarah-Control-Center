# Revenue OS storage upload security

The upload capability endpoints accept either a verified Revenue OS user session (Bearer token) or a server-to-server credential:

- Environment variable: `REVENUE_OS_STORAGE_API_KEY`
- Request header: `X-Revenue-Storage-Key`
- Applies to: `POST /api/storage/uploads/request-url` and `POST /api/storage/uploads/confirm`
- A valid `Authorization: Bearer <session-token>` is verified with the Revenue OS session verifier and binds the intent to `users.id`. The optional `X-Tenant-ID` header is accepted only when the user has a matching row in `tenant_memberships`; one membership is selected automatically, multiple memberships require an explicit selection, and users without memberships remain user-scoped.
- Otherwise, a valid server key creates a service-owned intent without a user owner.
- The server key must only exist in the API server environment; never put it in dashboard code, mobile builds, logs, or browser storage.
- If neither identity is valid, the request fails closed (HTTP 403, or HTTP 503 when no server key is configured).

The endpoints continue to accept only PNG, JPEG, and WebP files up to 15 MB. MP4 is intentionally not enabled.

## Remaining limitations

The upload intent is now stored in the Revenue OS PostgreSQL database (`storage_upload_intents`) with a unique object path, declared MIME type/size, expiry, and atomic `pending` → `confirming` → `confirmed`/`rejected` state. The API fails closed when the database is unavailable. This survives process restarts and coordinates confirmation across instances. Session-created intents store `owner_user_id` and optional `tenant_id`, each with a foreign key. Tenant selection is validated against the explicit `tenant_memberships` relation and is never trusted from the request header alone. Confirmation remains scoped to the same verified user principal. Server-key-created intents remain service-owned.

The API server attempts to synchronize the Revenue OS schema with `drizzle-kit push` during startup when `DATABASE_URL` is configured. Startup logs must be checked to confirm that this succeeded in the deployed environment; this repository change does not prove that a production database has been migrated.

Confirmation validates the actual GCS metadata against both the global allowlist/15 MB cap and the request's declared MIME type/size. A mismatch is deleted and marked rejected. Transient storage failures release the claim for retry. Confirmation does not itself grant public ACL visibility. Public visibility must remain a separate, explicit operation after a verified publishing workflow.
