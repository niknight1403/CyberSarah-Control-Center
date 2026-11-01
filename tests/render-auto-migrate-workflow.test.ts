import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("Render app deployment migration gate",()=>{
  it("keeps manual production migration gates while Render owns automatic main deploys",()=>{
    const workflow=readFileSync(".github/workflows/render-deploy.yml","utf8");
    expect(workflow).toContain("node scripts/production-schema-preflight.mjs");
    expect(workflow).toContain("node scripts/render-deploy.mjs --migrate");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("  push:\n");
  });

  it("ships an idempotent repair migration for production growth relations",()=>{
    const repair=readFileSync("drizzle/0019_repair_growth_schema.sql","utf8");
    const journal=readFileSync("drizzle/meta/_journal.json","utf8");
    for(const table of ["revenue_attribution_events","revenue_cost_events","b2b_network_nodes","b2b_network_edges","influencer_learning_states"]){
      expect(repair).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(journal).toContain('"tag": "0019_repair_growth_schema"');
  });
});
