import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
// @ts-ignore Runtime deploy logic is intentionally plain ESM.
import {isRestrictedDrizzleJournalError} from "../lib/render-deploy-logic.mjs";

describe("production migration journal fallback",()=>{
 const migrator=readFileSync("scripts/run-drizzle-migrations.mjs","utf8");
 const deploy=readFileSync("scripts/render-deploy.mjs","utf8");
 const preflight=readFileSync("scripts/production-schema-preflight.mjs","utf8");
 const m20=readFileSync("drizzle/0020_draft_queue_dedupe.sql","utf8");

 it("only bootstraps an alternate journal after verified preflight",()=>{
  expect(migrator).toContain('MIGRATION_PREFLIGHT_VERIFIED!=="1"');
  expect(deploy).toContain('MIGRATION_PREFLIGHT_VERIFIED: "1"');
  expect(deploy).toContain("production-schema-preflight.mjs");
 });
 it("recognizes the real pg 42501 message and structured schema form",()=>{
  const messageError=Object.assign(new Error("migration failed"),{cause:{code:"42501",message:"permission denied for schema drizzle"}});
  const schemaError=Object.assign(new Error("migration failed"),{cause:{code:"42501",schema:"drizzle",message:"permission denied"}});
  const otherSchema=Object.assign(new Error("migration failed"),{cause:{code:"42501",message:"permission denied for schema private"}});
  expect(isRestrictedDrizzleJournalError(messageError)).toBe(true);
  expect(isRestrictedDrizzleJournalError(schemaError)).toBe(true);
  expect(isRestrictedDrizzleJournalError(otherSchema)).toBe(false);
  expect(isRestrictedDrizzleJournalError(Object.assign(new Error("permission denied for schema drizzle"),{cause:{code:"42P01"}}))).toBe(false);
 });
 it("uses public only for the scoped migration journal fallback",()=>{
  expect(migrator).toContain('migrationsSchema:"public"');
  expect(migrator).toContain("isRestrictedDrizzleJournalError(error)");
  expect(migrator).toContain("public.__drizzle_migrations");
 });
 it("keeps the latest draft queue repair idempotent",()=>{
  expect(m20).toContain("ADD COLUMN IF NOT EXISTS");
  expect(m20).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  expect(preflight).toContain("0020_draft_queue_dedupe.sql");
 });
 it("refuses bootstrap without an existing production baseline",()=>{
  expect(migrator).toContain("if(!row.baseline) return {baseline:false,bootstrapped:false}");
  expect(migrator).toContain("public.\\\"users\\\"");
 });
});
