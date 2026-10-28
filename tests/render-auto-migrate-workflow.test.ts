import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("Render app deployment migration gate",()=>{
  it("always migrates the production database before deploying the app",()=>{
    const workflow=readFileSync(".github/workflows/render-deploy.yml","utf8");
    expect(workflow).toContain("node scripts/production-schema-preflight.mjs");
    expect(workflow).toContain("node scripts/render-deploy.mjs --migrate");
    expect(workflow).toContain("- 'drizzle/**'");
  });

  it("ships idempotent production repairs",()=>{
    const repair=readFileSync("drizzle/0019_repair_growth_schema.sql","utf8");
    const dedupe=readFileSync("drizzle/0020_draft_queue_dedupe.sql","utf8");
    const journal=readFileSync("drizzle/meta/_journal.json","utf8");
    for(const table of ["revenue_attribution_events","revenue_cost_events","b2b_network_nodes","b2b_network_edges","influencer_learning_states"]){
      expect(repair).toContain('CREATE TABLE IF NOT EXISTS "'+table+'"');
    }
    expect(dedupe).toContain('ADD COLUMN IF NOT EXISTS "dedupeKey"');
    expect(dedupe).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "draftQueue_dedupe_idx"');
    expect(journal).toContain('"tag": "0020_draft_queue_dedupe"');
  });

  it("fails closed unless the full current migration schema and unique index are verified",()=>{
    const migrate=readFileSync("scripts/run-drizzle-migrations.mjs","utf8");
    const preflight=readFileSync("scripts/production-schema-preflight.mjs","utf8");
    expect(migrate).toContain('latest!=="0020_draft_queue_dedupe"');
    expect(migrate).toContain("journalPermissionDenied");
    expect(migrate).toContain("expectedRuntimeObjects");
    expect(migrate).toContain("expected.tables.some");
    expect(migrate).toContain("expected.columns");
    expect(migrate).toContain("i.indisunique");
    expect(migrate).toContain("i.indisvalid");
    expect(preflight).toContain('ADD COLUMN IF NOT EXISTS "dedupeKey"');
    expect(preflight).toContain("i.indisunique");
    expect(preflight).toContain("i.indisvalid");
  });
});
