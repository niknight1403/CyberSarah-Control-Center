/**
 * Read-only, per-administrator operational overview for social publishing.
 * No job contents, tokens, passwords or cross-tenant data leave this query.
 */
import {eq,sql} from "drizzle-orm";
import {publishingJobs} from "../drizzle/schema";
import type {getDb} from "./db";

type PublishingDb=NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function publishingOpsOverviewDb(
  db:PublishingDb,userOpenId:string,now=new Date(),
) {
  const since24h=new Date(now.getTime()-24*60*60_000);
  const staleCutoff=new Date(now.getTime()-30*60_000);
  const [counts]=await db.select({
    total:sql<number>`count(*)::int`,
    due:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='geplant' AND ${publishingJobs.scheduledFor}<=${now})::int`,
    scheduled:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='geplant' AND ${publishingJobs.scheduledFor}>${now})::int`,
    active:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='in_bearbeitung')::int`,
    staleActive:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='in_bearbeitung' AND ${publishingJobs.updatedAt}<=${staleCutoff})::int`,
    uncertain:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='versand_ungeklaert')::int`,
    failed:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='fehlgeschlagen')::int`,
    retryableFailed:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='fehlgeschlagen' AND ${publishingJobs.mode} IS NULL)::int`,
    published24h:sql<number>`count(*) FILTER (WHERE ${publishingJobs.status}='veroeffentlicht' AND ${publishingJobs.publishedAt}>=${since24h})::int`,
  }).from(publishingJobs).where(eq(publishingJobs.userOpenId,userOpenId));
  return {
    ...counts,
    checkedAt:now.toISOString(),
  };
}
