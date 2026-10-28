ALTER TABLE "draftQueue" ADD COLUMN "dedupeKey" varchar(220);
--> statement-breakpoint
CREATE UNIQUE INDEX "draftQueue_dedupe_idx" ON "draftQueue" USING btree ("dedupeKey");
