import {describe,expect,it} from "vitest";
import {latestMigrationMillis,migrationJournalMode,pendingMigrationMeta,sanitizeMigrationStatement} from "../lib/migration-runner-logic.mjs";

describe("production migration journal logic",()=>{
  it("uses the newest applied timestamp",()=>expect(latestMigrationMillis([{created_at:"100"},{created_at:250},{created_at:"200"}])).toBe(250));
  it("returns only migrations newer than the journal high-water mark",()=>{
    const pending=pendingMigrationMeta([{folderMillis:100},{folderMillis:200},{folderMillis:300}],[{created_at:200}]);
    expect(pending.map(x=>x.folderMillis)).toEqual([300]);
  });
  it("prefers an initialized public journal",()=>expect(migrationJournalMode({publicRows:[{hash:"a"}],legacyRows:[{hash:"b"}]})).toEqual({mode:"public",bootstrap:false}));
  it("bootstraps the public journal from readable legacy history",()=>expect(migrationJournalMode({publicRows:[],legacyRows:[{hash:"b"}]})).toEqual({mode:"legacy-bootstrap",bootstrap:true}));
  it("refuses to guess when no journal exists",()=>expect(migrationJournalMode({publicRows:[],legacyRows:[]})).toEqual({mode:"uninitialized",bootstrap:false}));
  it("skips whitespace-only migration statements",()=>expect(sanitizeMigrationStatement(" \n ")).toBe(""));
});
