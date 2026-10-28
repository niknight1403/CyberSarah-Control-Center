import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("Render app deployment migration gate",()=>{
  it("always migrates the production database before deploying the app",()=>{
    const workflow=readFileSync(".github/workflows/render-deploy.yml","utf8");
    expect(workflow).toContain("node scripts/production-schema-preflight.mjs");
    expect(workflow).toContain("node scripts/render-deploy.mjs --migrate");
    expect(workflow).toContain("- 'drizzle/**'");
  });

  it("ships an idempotent repair migration for production growth relations",()=>{
    const repair=readFileSync("drizzle/0019_repair_growth_schema.sql","utf8");
    const journal=readFileSync("drizzle/meta/_journal.json","utf8");
    for(const table of ["revenue_attribution_events","revenue_cost_events","b2b_network_nodes","b2b_network_edges","influencer_learning_states"]){
      expect(repair).toContain('CREATE TABLE IF NOT EXISTS "'+table+'"');
    }
    expect(journal).toContain('"tag": "0019_repair_growth_schema"');
  });

  it("keeps the journal-permission fallback pinned to the verified latest migration",()=>{
    const migrate=readFileSync("scripts/run-drizzle-migrations.mjs","utf8");
    const preflight=readFileSync("scripts/production-schema-preflight.mjs","utf8");
    expect(migrate).toContain('latest!=="0020_draft_queue_dedupe"');
    expect(migrate).toContain("journalPermissionDenied");
    expect(migrate).toContain("draftQueue_dedupe_idx");
    expect(preflight).toContain('ADD COLUMN IF NOT EXISTS "dedupeKey"');
    expect(preflight).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "draftQueue_dedupe_idx"');
  });
});
