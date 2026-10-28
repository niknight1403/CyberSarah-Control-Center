#!/usr/bin/env node
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { deployPgPoolConfig, maskSecrets } from "../lib/render-deploy-logic.mjs";
import { migrationJournalMode,pendingMigrationMeta,sanitizeMigrationStatement } from "../lib/migration-runner-logic.mjs";

const raw=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(raw)){
  console.error("[db-migrate] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const {Pool}=pg;
const pool=new Pool({...deployPgPoolConfig(raw),max:1,connectionTimeoutMillis:10_000});
const PUBLIC_JOURNAL='public."__cybersarah_migrations"';
const LEGACY_JOURNAL='drizzle."__drizzle_migrations"';

async function tableRows(client,table){
  try{
    const result=await client.query(`select hash, created_at from ${table} order by created_at asc`);
    return result.rows;
  }catch(error){
    if(error?.code==="42P01"||error?.code==="3F000")return [];
    throw error;
  }
}

try{
  const migrations=readMigrationFiles({migrationsFolder:"drizzle"});
  const client=await pool.connect();
  try{
    await client.query("select pg_advisory_lock(hashtext('cybersarah-production-migrations'))");
    await client.query(`create table if not exists ${PUBLIC_JOURNAL} (
      id bigserial primary key,
      hash text not null,
      created_at bigint not null
    )`);
    await client.query(`create unique index if not exists "__cybersarah_migrations_hash_idx" on ${PUBLIC_JOURNAL} (hash)`);

    let publicRows=await tableRows(client,PUBLIC_JOURNAL);
    let legacyRows=[];
    try{
      legacyRows=await tableRows(client,LEGACY_JOURNAL);
    }catch(error){
      if(error?.code!=="42501")throw error;
      console.warn("[db-migrate] Legacy-Journal ist nicht lesbar; nutze ausschließlich das öffentliche CyberSarah-Journal.");
    }

    const mode=migrationJournalMode({publicRows,legacyRows});
    if(mode.bootstrap){
      await client.query("begin");
      try{
        for(const row of legacyRows){
          await client.query(
            `insert into ${PUBLIC_JOURNAL} (hash,created_at) values ($1,$2) on conflict (hash) do nothing`,
            [row.hash,Number(row.created_at)],
          );
        }
        await client.query("commit");
        publicRows=await tableRows(client,PUBLIC_JOURNAL);
        console.log(`[db-migrate] ${legacyRows.length} Legacy-Journal-Einträge nach public.__cybersarah_migrations übernommen.`);
      }catch(error){
        await client.query("rollback");
        throw error;
      }
    }

    if(mode.mode==="uninitialized"){
      throw Object.assign(new Error(
        "Kein lesbares bestehendes Migrationsjournal gefunden. Historische Migrationen werden aus Sicherheitsgründen nicht blind erneut abgespielt."
      ),{code:"MIGRATION_JOURNAL_UNINITIALIZED"});
    }

    const pending=pendingMigrationMeta(migrations,publicRows);
    if(!pending.length){
      console.log("[db-migrate] Keine ausstehenden Migrationen.");
    }else{
      for(const migration of pending){
        await client.query("begin");
        try{
          for(const rawStatement of migration.sql){
            const statement=sanitizeMigrationStatement(rawStatement);
            if(statement)await client.query(statement);
          }
          await client.query(
            `insert into ${PUBLIC_JOURNAL} (hash,created_at) values ($1,$2) on conflict (hash) do nothing`,
            [migration.hash,migration.folderMillis],
          );
          await client.query("commit");
          console.log(`[db-migrate] Migration ${migration.folderMillis} angewendet.`);
        }catch(error){
          await client.query("rollback");
          throw error;
        }
      }
    }
    await client.query("select pg_advisory_unlock(hashtext('cybersarah-production-migrations'))");
    console.log("[db-migrate] Produktionsmigrationen erfolgreich synchronisiert.");
  }finally{
    client.release();
  }
}catch(error){
  const e=error instanceof Error?error:new Error(String(error));
  const cause=e.cause&&typeof e.cause==="object"?e.cause:null;
  const details={name:e.name,message:e.message,code:e.code,detail:e.detail,hint:e.hint,schema:e.schema,table:e.table,column:e.column,constraint:e.constraint,cause:cause?{name:cause.name,message:cause.message,code:cause.code,detail:cause.detail,hint:cause.hint,schema:cause.schema,table:cause.table,column:cause.column,constraint:cause.constraint}:null};
  console.error("[db-migrate] Migration fehlgeschlagen:",maskSecrets(JSON.stringify(details)));
  process.exitCode=1;
}finally{
  await pool.end();
}
