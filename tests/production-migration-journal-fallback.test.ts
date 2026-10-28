import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

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
 it("uses public only for the migration journal fallback",()=>{
  expect(migrator).toContain('migrationsSchema:"public"');\n  expect(migrator).toContain('cause?.code==="42501"');\n  expect(migrator).toContain('schema\\\\s+"');
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
