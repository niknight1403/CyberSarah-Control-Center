# Zero-cost quota mitigation (2026-11-01)

## Actions committed
- `vercel.json` configures `bash scripts/vercel-ignore-build.sh` so preview builds are skipped; **production builds remain permitted**.
- Revenue-only GitHub workflow now runs for relevant revenue files, with targeted tests but without duplicating full-suite CI and server builds.
- Main CI and Render production-deploy gates remain unchanged.

## Boundaries / verification
Vercel docs clarify that ignored or canceled builds **still count as deployments** and can affect quotas. Thus this reduces preview compute but does not reset exhausted deployment slots or bypass hard limits. If the account is already rate-limited, wait for the platform quota reset, pause/disconnect Vercel Git preview deployment integration, or use the existing Render deployment as the production route (after CI). No paid upgrade was purchased or required in this change.

Vercel can require configuration at project level: Settings > Build and Deployment > Ignored Build Step and verify the command is honored. Prefer disabling Git preview deployments entirely when deployment **count** is the exhausted resource; an ignore script alone is insufficient. Audit whether two Git-integrated projects target this same repository.

No change to production secrets, Stripe live billing, or Render deployment. A successful end-to-end build remains to be verified independently.
