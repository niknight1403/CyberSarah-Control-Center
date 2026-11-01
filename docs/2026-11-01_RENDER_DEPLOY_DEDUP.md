# Render deployment quota hardening – 2026-11-01

Verified in Render My Workspace: `cybersarah-control-center` and `cybersarah-workspace`
have `autoDeployTrigger: commit` on `main`; their PR previews are disabled.
`.github/workflows/render-deploy.yml` previously triggered another API-driven
deployment on the same pushes. The redundant `push` trigger was removed.

The workflow still supports manual `workflow_dispatch` for deliberate application,
workspace or domain maintenance. The Render Git integration remains the production
auto-deployment owner. No Render service was restarted and no live keys were changed.

**Important operational implication:** The GitHub workflow formerly handled
migrations and secret synchronization. Removing its automatic trigger means these
operations no longer happen automatically through that workflow on every commit.
Before releasing database schema changes or new secrets, invoke the manual Render
Deploy workflow with the appropriate target or run an independently verified,
approved migration mechanism. Avoid enabling Stripe dispatch before schema exists.

Build quota status is not thereby reset. Verify the next `main` commit creates
one Render application deploy, not a redundant second API-triggered deploy;
confirm workspace deployment behavior separately. GitHub CI and production E2E
must pass before merging the revenue PR.
