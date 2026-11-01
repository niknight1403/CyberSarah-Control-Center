import {desc} from "drizzle-orm";
import {revenueDailyStats} from "../drizzle/schema";
import {providerCircuitSnapshot} from "../lib/provider-circuit-breaker-logic";
import {resolveDigistore24IpnSecret} from "../lib/digistore24-ipn-config";
import {buildRevenueThroughputSnapshot} from "../lib/revenue-throughput-logic";
import {getDb} from "./db";
import {collectRevenueAutopilotSnapshot} from "./revenue-autopilot";
import {getAdministratorStripeHealth} from "./stripe-admin-health";

export async function revenueThroughputOverview(){
  const [snapshot,stripeHealth]=await Promise.all([
    collectRevenueAutopilotSnapshot(),
    getAdministratorStripeHealth(),
  ]);

  let databaseReady=false;
  let rows:Array<{day:string;revenueCents:number;conversions:number}>=[];
  try{
    const db=await getDb();
    if(db){
      databaseReady=true;
      rows=await db.select({
        day:revenueDailyStats.day,
        revenueCents:revenueDailyStats.revenueCents,
        conversions:revenueDailyStats.conversions,
      }).from(revenueDailyStats).orderBy(desc(revenueDailyStats.day)).limit(14);
    }
  }catch{
    databaseReady=false;
  }

  const ordered=[...rows].sort((a,b)=>b.day.localeCompare(a.day));
  const recent=ordered.slice(0,7);
  const previous=ordered.slice(7,14);
  const sum=(items:typeof rows,key:"revenueCents"|"conversions")=>items.reduce((total,row)=>total+Math.max(0,Number(row[key])||0),0);
  const circuits=providerCircuitSnapshot();

  return {
    ...buildRevenueThroughputSnapshot({
      currentMrrEur:snapshot.mrrEur,
      activeSubscriptions:snapshot.activeSubscriptions,
      landingViews:snapshot.landingViews,
      signups:snapshot.signups,
      checkoutStarts:snapshot.checkoutStarts,
      upgrades:snapshot.upgrades,
      stripeCheckoutSuccessRate:snapshot.stripeCheckoutSuccessRate,
      invoiceSuccessRate:snapshot.invoiceSuccessRate,
      recent7RevenueCents:sum(recent,"revenueCents"),
      previous7RevenueCents:sum(previous,"revenueCents"),
      recent7Conversions:sum(recent,"conversions"),
      previous7Conversions:sum(previous,"conversions"),
      stripeConnected:stripeHealth.status==="connected",
      stripeWebhookConfigured:stripeHealth.webhookSecretConfigured,
      digistoreIpnConfigured:Boolean(resolveDigistore24IpnSecret()),
      digistoreApiConfigured:Boolean(process.env.DIGISTORE24_API_KEY?.trim()),
      databaseReady,
      providerCircuitsOpen:circuits.filter(item=>item.state==="OPEN").length,
      providerCircuitsTotal:circuits.length,
    }),
    generatedAt:new Date().toISOString(),
    evidence:{
      dailyRevenueRows:rows.length,
      stripeCheckedAt:stripeHealth.checkedAt,
      stripeStatus:stripeHealth.status,
      mrrSource:"existing SaaS/Stripe overview",
      revenueVelocitySource:"revenue_daily_stats latest 14 days",
    },
  };
}
