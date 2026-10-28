import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

describe("Render app deployment migration gate",()=>{
  it("always migrates the production database before deploying the app",()=>{
    const workflow=readFileSync(".github/workflows/render-deploy.yml","utf8");
    expect(workflow).toContain("run: node scripts/render-deploy.mjs --migrate");
    expect(workflow).toContain("- 'drizzle/**'");
  });
});
