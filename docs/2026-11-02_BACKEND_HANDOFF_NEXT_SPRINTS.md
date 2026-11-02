# Backend Handoff: Next Sprint Roadmap

## Status

The local backend harness is stable and validated.

- `python -m pytest tests/backend -q` -> 24 passed
- `python scripts/backend_health_check.py` -> health check passed
- `python -m backend --help` -> CLI entrypoint working

## Achieved in the current autonomous cycle

- Backend near contract-complete for task ledger, logs, agent state, chat streaming, WebSocket live events
- SQLite startup resilience improved
- env-driven database and mode settings supported
- smoke and health scripts created
- API contract documentation captured

## Recommended next priorities

1. Confirm backend entrypoints match any external consumer or frontend contract
2. Add a production-ready config layer for local vs hosted use
3. Extend API docs generation for OpenAPI coverage
4. Optionally integrate the backend harness into a local dev/startup runner of the broader app

## Suggested remaining tasks

- Document environment variables in repo-level setup docs
- Add a route-level OpenAPI validation pass
- Evaluate whether the backend should be exposed via a single startup script in the top-level project
- Decide whether to keep the backend as a local harness or merge it into a larger service bootstrap
