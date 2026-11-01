#!/usr/bin/env bash
# Vercel ignored-build step: exit 0 SKIPS, exit 1 BUILDS.
# Fail open on missing/unknown environment: never accidentally block production.
case "${VERCEL_ENV:-}" in
  preview|development)
    echo "Skipping Vercel nonproduction build; GitHub CI validates changes."
    exit 0
    ;;
  production)
    echo "Production Vercel build permitted."
    exit 1
    ;;
  *)
    echo "Vercel environment unset or unrecognized; allowing build for safety."
    exit 1
    ;;
esac
