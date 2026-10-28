# Agentforge telemetry integration

The service exposes two machine-to-machine endpoints:

- `POST /api/agentforge/events` validates the event type and allowlisted metadata, persists it idempotently, then publishes it on the authenticated dashboard stream.
- `POST /api/agentforge/checkpoints` validates the SHA-256 checkpoint chain and refuses sensitive field names before persisting the record.

Set a 32-byte random hex token as `AGENTFORGE_TELEMETRY_TOKEN` in the Control Center deployment. Set the same value as `CYBERSARAH_TELEMETRY_TOKEN` in Agentforge2 and configure `CYBERSARAH_TELEMETRY_URL` to the Control Center origin. Keep both values in the deployment secret store; do not put them in source, app settings or URLs.

Apply the `0017_agentforge_mesh` Drizzle migration before enabling the endpoints. The GitHub deployment workflow applies checked-in migrations. `GET /api/agentforge/stream` uses the existing user session and supports `Last-Event-ID` replay. The dashboard hook is admin-only and retains only the latest 60 metadata events.

The telemetry contract deliberately excludes prompts, model reasoning, tool arguments, answer text and secret values. Provider cost is shown only when the source provides a numeric cost field; otherwise the dashboard does not estimate it.
