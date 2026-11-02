/**
 * Real PostgreSQL acceptance gate for the AI Influenza Team order lifecycle
 * (CI only, database `influenza_ci`, no Stripe, no external send).
 *
 * Proves against real persistence instead of the in-memory simulation:
 *   customer node -> order -> delivery tasks -> step advances -> completion,
 * including the two safety guards (approval gate, "paid" only through Stripe)
 * and the idempotency of task enqueueing.
 */
import assert from "node:assert/strict";
import { Pool } from "pg";

function assertSafeTarget(): string {
  const value = (process.env.AI_INFLUENZA_INTEGRATION_DATABASE_URL ?? "").trim();
  if (!value) throw new Error("Safety gate: AI_INFLUENZA_INTEGRATION_DATABASE_URL fehlt.");
  const target = new URL(value);
  if (target.protocol !== "postgresql:" || !["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/influenza_ci") {
    throw new Error("Safety gate: dieser Test laeuft nur gegen lokale PostgreSQL-Datenbank influenza_ci.");
  }
  return value;
}

const databaseUrl = assertSafeTarget();
process.env.DATABASE_URL = databaseUrl;
process.env.ENVIRONMENT = process.env.ENVIRONMENT ?? "test";

const { getDb } = await import("../server/db");
const schema = await import("../drizzle/schema");
const { AI_INFLUENZA_WORKFLOW_STEPS, AI_INFLUENZA_PACKAGES, buildAiInfluenzaMonthlyPlan, canAdvanceAiInfluenzaStep, nextAiInfluenzaStep } = await import("../lib/ai-influenza-team-logic");
type AiInfluenzaWorkflowStep = (typeof AI_INFLUENZA_WORKFLOW_STEPS)[number];
const service = await import("../server/ai-influenza-team-service");

async function createSchema(pool: Pool) {
  // Minimal, idempotent DDL: only the two tables the lifecycle touches.
  await pool.query(`CREATE TABLE IF NOT EXISTS "b2b_network_nodes" (
    "id" serial PRIMARY KEY,
    "node_key" varchar(180) NOT NULL UNIQUE,
    "kind" varchar(24) NOT NULL,
    "name" varchar(220) NOT NULL,
    "domain" varchar(255),
    "fit" integer NOT NULL DEFAULT 0,
    "intent" integer NOT NULL DEFAULT 0,
    "trust" integer NOT NULL DEFAULT 0,
    "relationship_strength" integer NOT NULL DEFAULT 0,
    "estimated_value_cents" integer,
    "opted_out" boolean NOT NULL DEFAULT false,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "last_activity_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS "revenue_jobs" (
    "id" serial PRIMARY KEY,
    "dedupe_key" varchar(180) NOT NULL UNIQUE,
    "kind" varchar(64) NOT NULL,
    "status" varchar(24) NOT NULL DEFAULT 'queued',
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "result" jsonb,
    "attempts" integer NOT NULL DEFAULT 0,
    "last_error" text,
    "deferred_until" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`);
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await createSchema(pool);
    await pool.query(`TRUNCATE "revenue_jobs", "b2b_network_nodes" RESTART IDENTITY CASCADE`);

    const db = await getDb();
    assert.ok(db, "Datenbankverbindung fehlt.");

    // 1) Kunde anlegen (echter Persistenzpfad, kein In-Memory-Objekt).
    const nodeKey = `ci-influenza-${Date.now()}`;
    await db.insert(schema.b2bNetworkNodes).values({ nodeKey, kind: "company", name: "CI Testkunde GmbH", metadata: { testOnly: true } });

    // 2) Auftrag anlegen: testOnly, damit der Zahlungs-Schritt ohne Stripe erlaubt ist.
    const created = await service.createAiInfluenzaOrder({ customerNodeKey: nodeKey, packageId: "growth", mode: "assisted", createdByOpenId: "ci-user", testOnly: true });
    assert.equal(created.payload.paymentStatus, "test-only");
    assert.equal(created.payload.step, "market-analysis");
    assert.equal(created.payload.businessUnit, "ai-influenza-team");

    // 3) Liefer-Tasks: Planmenge, und ein zweiter Lauf erzeugt keine Dubletten.
    const plan = buildAiInfluenzaMonthlyPlan("growth");
    const first = await service.enqueueAiInfluenzaDeliveryTasks(created.payload);
    assert.equal(first.created, plan.length);
    const second = await service.enqueueAiInfluenzaDeliveryTasks(created.payload);
    assert.equal(second.created, 0, "Wiederholtes Enqueue darf keine neuen Tasks anlegen.");
    assert.equal(second.reused, plan.length);

    // 4) Freigabe-Gate: risikobehafteter Schritt ohne Freigabe muss blockieren.
    const jobId = created.job.id;
    let steps = 0;
    let approvalGateChecked = false;
    while (steps++ < AI_INFLUENZA_WORKFLOW_STEPS.length + 2) {
      const read = await pool.query<{ payload: Record<string, unknown>; status: string }>("SELECT payload, status FROM revenue_jobs WHERE id = $1", [jobId]);
      assert.ok(read.rows[0], "Auftrag verschwunden.");
      const order = read.rows[0].payload;
      const from = String(order.step) as AiInfluenzaWorkflowStep;
      const next = nextAiInfluenzaStep(from);
      if (!next) break;
      const gate = canAdvanceAiInfluenzaStep({
        mode: "assisted", from, to: next, approved: false,
        budgetCents: Number(order.monthlyBudgetCents ?? 0), estimatedCostCents: 0,
      });
      if (!gate.allowed && /Freigabe/i.test(gate.reason) && !approvalGateChecked) {
        await assert.rejects(
          () => service.advanceAiInfluenzaOrder({ jobId, approved: false }),
          /Freigabe/i,
          "Risikobehafteter Schritt muss ohne Freigabe blockieren.",
        );
        approvalGateChecked = true;
      }
      await service.advanceAiInfluenzaOrder({ jobId, approved: true, estimatedCostCents: 0 });
    }
    assert.ok(approvalGateChecked, "Der Freigabe-Gate-Test wurde nie erreicht.");

    const finalRead = await pool.query<{ payload: Record<string, unknown>; status: string }>("SELECT payload, status FROM revenue_jobs WHERE id = $1", [jobId]);
    const finalRow = finalRead.rows[0];
    assert.ok(finalRow, "Auftrag am Ende nicht gefunden.");
    assert.equal(String(finalRow.payload.step), "renewal", "Workflow muss in 'renewal' enden.");
    assert.equal(finalRow.status, "completed");

    // 5) Schutzregel: ein echter Auftrag darf 'paid' nicht ohne Stripe erreichen.
    await db.insert(schema.b2bNetworkNodes).values({ nodeKey: `${nodeKey}-real`, kind: "company", name: "CI Realkunde GmbH" });
    const real = await service.createAiInfluenzaOrder({ customerNodeKey: `${nodeKey}-real`, packageId: "starter", mode: "assisted", createdByOpenId: "ci-user", testOnly: false });
    const realJobId = real.job.id;
    let blocked = false;
    for (let i = 0; i < AI_INFLUENZA_WORKFLOW_STEPS.length; i++) {
      try {
        await service.advanceAiInfluenzaOrder({ jobId: realJobId, approved: true, estimatedCostCents: 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /Stripe/i, `Unerwarteter Blockiergrund: ${message}`);
        blocked = true;
        break;
      }
    }
    assert.ok(blocked, "Ein echter Auftrag darf den paid-Status nicht ohne Stripe erreichen.");

    // 6) Uebersicht spiegelt echte Zeilen.
    const overview = await service.aiInfluenzaTeamOverview();
    assert.ok(overview.counts.orders >= 2, "Overview muss beide Auftraege zaehlen.");
    assert.ok(AI_INFLUENZA_PACKAGES.growth.monthlyPriceCents > 0);

    console.log("PASS: AI-Influenza-Auftragslebenszyklus gegen PostgreSQL (Kunde -> Order -> Tasks -> Renewal), Freigabe-Gate und Stripe-Schutzregel belegt.");
  } finally {
    await pool.end();
  }
}

await main();
