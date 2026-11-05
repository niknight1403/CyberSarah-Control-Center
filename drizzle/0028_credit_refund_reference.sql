-- Erstattungen brauchen einen Weg zurueck: wird eine Stripe-Zahlung
-- zurueckerstattet, muss die Gutschrift zu dieser Zahlung auffindbar sein.
-- Beim Buchen der Gutschrift wird deshalb der payment_intent mitgeschrieben.
ALTER TABLE "credit_ledger_entries" ADD COLUMN IF NOT EXISTS "payment_intent" varchar(190);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_ledger_payment_intent_idx" ON "credit_ledger_entries" ("payment_intent");
