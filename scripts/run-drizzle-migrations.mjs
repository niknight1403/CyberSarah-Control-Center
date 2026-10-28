#!/usr/bin/env node
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { deployPgPoolConfig, maskSecrets } from "../lib/render-deploy-logic.mjs";

const raw=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(raw)){
  console.error("[db-migrate] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const { Pool }=pg;
const pool=new Pool({...deployPgPoolConfig(raw),max:1,connectionTimeoutMillis:10_000});
try{
  const db=drizzle(pool);
  await migrate(db,{migrationsFolder:"drizzle"});
  console.log("[db-migrate] Drizzle-Migrationen erfolgreich angewendet.");
}catch(error){
  const e=error instanceof Error?error:new Error(String(error));
  const details={
    name:e.name,
    message:e.message,
    code:e.code,
    detail:e.detail,
    hint:e.hint,
    table:e.table,
    column:e.column,
    constraint:e.constraint,
  };
  console.error("[db-migrate] Migration fehlgeschlagen:",maskSecrets(JSON.stringify(details)));
  process.exitCode=1;
}finally{
  await pool.end();
}
