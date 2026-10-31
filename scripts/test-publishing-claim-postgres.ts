/**
 * Real PostgreSQL concurrency acceptance gate (CI only): two independent
 * connection pools compete for the exact same application CAS transition.
 * All data is disposable in the publishing_ci database. No external APIs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { claimDuePublishingJob, quarantineStalePublishingClaimsDb } from "../server/publishing-claim";

async function main(): Promise<void> {
  const value = process.env.PUBLISHING_INTEGRATION_DATABASE_URL ?? "";
  const target = new URL(value);
  if (target.protocol !== "postgresql:" ||
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/publishing_ci")
    throw new Error("Safety gate: PostgreSQL test must use local publishing_ci only.");

  const setup = new Pool({connectionString:value,max:2});
  const a = new Pool({connectionString:value,max:2});
  const b = new Pool({connectionString:value,max:2});
  try {
    await setup.query(`CREATE TYPE "publishing_status" AS ENUM
      ('geplant','sandbox_veroeffentlicht','veroeffentlicht','fehlgeschlagen','abgebrochen')`);
    await setup.query(`CREATE TABLE "publishingJobs" (
      id SERIAL PRIMARY KEY,
      user_open_id TEXT NOT NULL,
      product TEXT NOT NULL,
      goal TEXT NOT NULL,
      persona TEXT NOT NULL,
      platform TEXT NOT NULL,
      campaign_day INTEGER NOT NULL,
      dedupe_key TEXT NOT NULL,
      status "publishing_status" NOT NULL DEFAULT 'geplant',
      scheduled_for TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      mode TEXT,
      external_id TEXT,
      asset_url TEXT,
      asset_urls JSONB NOT NULL DEFAULT '[]',
      insights JSONB NOT NULL DEFAULT '{}',
      insights_fetched_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const migration = await readFile(new URL("../drizzle/0021_publishing_atomic_dispatch.sql",import.meta.url),"utf8");
    for (const statement of migration.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean)) {
      await setup.query(statement);
      await setup.query(statement); // migration must be idempotent
    }
    const present = (await setup.query(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'publishing_status'::regtype"
    )).rows.map(x=>x.enumlabel);
    assert(present.includes("in_bearbeitung"));
    assert(present.includes("versand_ungeklaert"));

    const now = new Date("2026-10-31T12:00:00.000Z");
    const created = (await setup.query(`INSERT INTO "publishingJobs"
      (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for)
      VALUES('owner-a','product','reach','nova','x',1,'one', $1) RETURNING id`,
      [new Date(now.getTime()-60_000)])).rows[0].id as number;
    const wa=drizzle(a), wb=drizzle(b);
    // Both workers read the same due candidate before either claims it.
    const parallel = await Promise.all(
      Array.from({length:24},(_,idx)=>claimDuePublishingJob(idx%2?wa:wb,created,"owner-a",now))
    );
    assert.equal(parallel.filter(Boolean).length,1,"exactly one of 24 concurrent workers must win");
    const one = parallel.find(Boolean)!;
    assert.equal(one.status,"in_bearbeitung");
    assert.equal(one.attempts,1);
    const stored=(await setup.query('SELECT status,attempts FROM "publishingJobs" WHERE id=$1',[created])).rows[0];
    assert.equal(stored.status,"in_bearbeitung");
    assert.equal(stored.attempts,1,"losers must not increment attempts");
    assert.equal(await claimDuePublishingJob(wb,created,"owner-a",now),null);

    // Ownership and due-time boundaries must fail closed.
    const laterId=(await setup.query(`INSERT INTO "publishingJobs"
      (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for)
      VALUES('owner-b','product','reach','nova','x',1,'future',$1) RETURNING id`,
      [new Date(now.getTime()+3_600_000)])).rows[0].id as number;
    assert.equal(await claimDuePublishingJob(wa,laterId,"owner-a",now),null);
    assert.equal(await claimDuePublishingJob(wa,laterId,"owner-b",now),null);

    // A crashed worker remains quarantined, never re-enters the auto-queue.
    await setup.query('UPDATE "publishingJobs" SET updated_at=$1 WHERE id=$2',
      [new Date(now.getTime()-35*60_000),created]);
    assert.equal(await quarantineStalePublishingClaimsDb(wb,now),1);
    assert.equal(await quarantineStalePublishingClaimsDb(wa,now),0);
    const uncertain=(await setup.query(
      'SELECT status,last_error,attempts FROM "publishingJobs" WHERE id=$1',[created]
    )).rows[0];
    assert.equal(uncertain.status,"versand_ungeklaert");
    assert.match(uncertain.last_error,/Plattform prüfen/);
    assert.equal(uncertain.attempts,1);
    assert.equal(await claimDuePublishingJob(wa,created,"owner-a",now),null);
    console.log("PASS: PostgreSQL 24-worker CAS, tenant isolation, due-time, stale quarantine, migration replay.");
  } finally {
    await Promise.all([setup.end(),a.end(),b.end()]);
  }
}

main().catch(error=>{console.error("PostgreSQL publishing-claim integration failed:",error);process.exitCode=1;});
