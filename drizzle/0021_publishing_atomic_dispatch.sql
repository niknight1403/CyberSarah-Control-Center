-- Atomic claim states; uncertain outcomes must never be blindly replayed.
ALTER TYPE "public"."publishing_status" ADD VALUE IF NOT EXISTS 'in_bearbeitung';
--> statement-breakpoint
ALTER TYPE "public"."publishing_status" ADD VALUE IF NOT EXISTS 'versand_ungeklaert';
