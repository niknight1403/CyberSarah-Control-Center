#!/usr/bin/env bash
# Vercel ignored-build step: 0 skips, 1 builds.
# This avoids preview compilations. Production builds remain enabled.
# NOTE: skipped deployments can still count toward Vercel deployment quotas.
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping nonproduction Vercel build; CI handles feature branches."
  exit 0
fi
echo "Production Vercel build permitted."
exit 1
