-- Sprint 26 — Zustand eines pausierten Zahlungsabrufs dauerhaft lesen.
ALTER TABLE "billingSubscriptions"
  ADD COLUMN IF NOT EXISTS "pausedBehavior" text;
