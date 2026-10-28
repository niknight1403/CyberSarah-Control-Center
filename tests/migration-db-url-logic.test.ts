import { describe,expect,it } from "vitest";
import { migrationConnectionString,resolveMigrationPgConfig } from "../lib/migration-db-url-logic.mjs";

describe("production migration PostgreSQL SSL parity",()=>{
  it("maps sslmode=require to encrypted no-verify for drizzle-kit",()=>{
    expect(migrationConnectionString("postgresql://u:p@10.0.0.1:443/db?sslmode=require")).toContain("sslmode=no-verify");
  });
  it("uses explicit rejectUnauthorized=false for runtime-style pg preflight",()=>{
    const cfg=resolveMigrationPgConfig("postgresql://u:p@10.0.0.1:443/db?sslmode=require");
    expect(cfg.connectionString).not.toContain("sslmode");
    expect(cfg.ssl).toEqual({rejectUnauthorized:false});
  });
  it("keeps verify-full strict",()=>{
    const cfg=resolveMigrationPgConfig("postgresql://u:p@db.example.com/db?sslmode=verify-full");
    expect(cfg.ssl).toEqual({rejectUnauthorized:true});
    expect(migrationConnectionString("postgresql://u:p@db.example.com/db?sslmode=verify-full")).toContain("sslmode=verify-full");
  });
  it("keeps local/no-ssl connections unforced",()=>{
    expect(resolveMigrationPgConfig("postgresql://u:p@localhost:5432/db").ssl).toBe(false);
  });
});
