/**
 * Compounding Revenue Intelligence
 *
 * Ten deterministic growth capabilities. No external action is executed here:
 * this layer turns measured signals into recommendations that can flow through
 * the existing approval/action gates.
 */

export type FunnelStage = { key: string; entrants: number; completions: number; valueCents?: number };
export type FunnelLeak = FunnelStage & { conversionRatePct: number | null; lost: number; severity: number; action: "MEASURE"|"FIX"|"TEST"|"HEALTHY" };

export type RetentionInput = {
  activeStart: number;
  activeEnd: number;
  newCustomers: number;
  cancellations: number;
  mrrCents: number;
  acquisitionCostCents?: number | null;
};
export type RetentionEconomics = RetentionInput & {
  churnRatePct: number | null;
  retentionRatePct: number | null;
  arpuCents: number | null;
  estimatedLtvCents: number | null;
  ltvToCac: number | null;
  paybackMonths: number | null;
  state: "MEASURE"|"PROTECT"|"GROW";
};

export type LifecycleSignal = {
  customerKey: string;
  daysSinceSignup: number;
  daysSinceLastActivity: number;
  checkoutStarted: boolean;
  purchased: boolean;
  activeSubscription: boolean;
  failedPayment: boolean;
};
export type LifecycleAction = LifecycleSignal & {
  action: "ONBOARD"|"CHECKOUT_RECOVERY"|"DUNNING"|"CROSS_SELL"|"WIN_BACK"|"NURTURE";
  priority: number;
  requiresExternalApproval: true;
};

export type CreativeWindow = { creativeKey: string; impressions: number; clicks: number; conversions: number; previousCtrPct?: number | null; previousConversionRatePct?: number | null };
export type CreativeHealth = CreativeWindow & { ctrPct: number | null; conversionRatePct: number | null; fatiguePct: number | null; action: "LEARN"|"REFRESH"|"ITERATE"|"KEEP" };

export type HoldoutMetric = { exposedUsers: number; exposedConversions: number; holdoutUsers: number; holdoutConversions: number; exposedRevenueCents?: number; holdoutRevenueCents?: number };
export type IncrementalityResult = HoldoutMetric & { exposedRatePct: number | null; holdoutRatePct: number | null; absoluteLiftPctPoints: number | null; relativeLiftPct: number | null; incrementalConversions: number | null; incrementalRevenueCents: number | null; action: "MEASURE"|"STOP"|"LEARN"|"SCALE" };

export type ReferralMetric = { customers: number; invites: number; referredSignups: number; referredCustomers: number };
export type ReferralHealth = ReferralMetric & { invitesPerCustomer: number | null; inviteToSignupPct: number | null; signupToCustomerPct: number | null; viralCoefficient: number | null; action: "MEASURE"|"IMPROVE_INVITES"|"IMPROVE_CONVERSION"|"COMPOUND" };

export type OfferMetric = { offerKey: string; exposures: number; conversions: number; revenueCents: number; refundsCents: number; variableCostCents: number };
export type OfferEconomics = OfferMetric & { conversionRatePct: number | null; netRevenueCents: number; contributionCents: number; contributionPerExposureCents: number | null; refundRatePct: number | null; action: "LEARN"|"HOLD"|"TEST"|"SCALE" };

export type GrowthSignal = { key: string; impact: number; confidence: number; effort: number; risk: number; evidence: string; requiresApproval?: boolean };
export type GrowthPriority = GrowthSignal & { score: number; rank: number; action: "DO_NEXT"|"QUEUE"|"LEARN"|"HOLD" };

const finite=(n:number)=>Number.isFinite(n)?n:0;
const nonNegative=(n:number)=>Math.max(0,finite(n));
const ratio=(a:number,b:number)=>b>0?a/b:null;
const pct=(r:number|null)=>r===null?null:Number((r*100).toFixed(2));
const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,finite(n)));

export function diagnoseFunnel(stages:FunnelStage[]):FunnelLeak[] {
  return stages.map(stage=>{
    const entrants=nonNegative(stage.entrants), completions=Math.min(entrants,nonNegative(stage.completions));
    const rate=ratio(completions,entrants), lost=Math.max(0,entrants-completions);
    const evidence=Math.min(1,Math.log10(entrants+1)/2);
    const severity=Math.round(clamp((rate===null?100:(1-rate)*100)*evidence));
    const action:FunnelLeak["action"]=entrants<20?"MEASURE":severity>=55?"FIX":severity>=25?"TEST":"HEALTHY";
    return {...stage,entrants,completions,conversionRatePct:pct(rate),lost,severity,action};
  }).sort((a,b)=>b.severity-a.severity||b.lost-a.lost);
}

export function estimateRetentionEconomics(input:RetentionInput):RetentionEconomics {
  const activeStart=nonNegative(input.activeStart), activeEnd=nonNegative(input.activeEnd);
  const newCustomers=nonNegative(input.newCustomers), cancellations=nonNegative(input.cancellations);
  const mrrCents=nonNegative(input.mrrCents);
  const churn=ratio(cancellations,activeStart);
  const retention=churn===null?null:Math.max(0,1-churn);
  const arpu=ratio(mrrCents,activeEnd);
  const ltv=arpu!==null&&churn!==null&&churn>0?Math.round(arpu/churn):null;
  const cac=input.acquisitionCostCents==null?null:nonNegative(input.acquisitionCostCents);
  const ltvToCac=ltv!==null&&cac!==null&&cac>0?Number((ltv/cac).toFixed(2)):null;
  const payback=arpu!==null&&arpu>0&&cac!==null?Number((cac/arpu).toFixed(2)):null;
  const state:RetentionEconomics["state"]=activeStart<10?"MEASURE":churn!==null&&churn>0.08?"PROTECT":"GROW";
  return {...input,activeStart,activeEnd,newCustomers,cancellations,mrrCents,churnRatePct:pct(churn),retentionRatePct:pct(retention),arpuCents:arpu===null?null:Math.round(arpu),estimatedLtvCents:ltv,ltvToCac,paybackMonths:payback,state};
}

export function planLifecycleActions(signals:LifecycleSignal[]):LifecycleAction[] {
  return signals.map(signal=>{
    let action:LifecycleAction["action"]="NURTURE", priority=35;
    if(signal.failedPayment){action="DUNNING";priority=100;}
    else if(signal.checkoutStarted&&!signal.purchased){action="CHECKOUT_RECOVERY";priority=90;}
    else if(signal.purchased&&signal.activeSubscription&&signal.daysSinceLastActivity<=14){action="CROSS_SELL";priority=65;}
    else if(signal.purchased&&signal.daysSinceLastActivity>=30){action="WIN_BACK";priority=80;}
    else if(!signal.purchased&&signal.daysSinceSignup<=7){action="ONBOARD";priority=70;}
    return {...signal,action,priority,requiresExternalApproval:true as const};
  }).sort((a,b)=>b.priority-a.priority);
}

export function detectCreativeFatigue(windows:CreativeWindow[]):CreativeHealth[] {
  return windows.map(item=>{
    const ctr=ratio(nonNegative(item.clicks),nonNegative(item.impressions));
    const conv=ratio(nonNegative(item.conversions),nonNegative(item.clicks));
    const currentCtrPct=pct(ctr), currentConvPct=pct(conv);
    const ctrDrop=item.previousCtrPct!=null&&item.previousCtrPct>0&&currentCtrPct!==null?Math.max(0,(item.previousCtrPct-currentCtrPct)/item.previousCtrPct):null;
    const convDrop=item.previousConversionRatePct!=null&&item.previousConversionRatePct>0&&currentConvPct!==null?Math.max(0,(item.previousConversionRatePct-currentConvPct)/item.previousConversionRatePct):null;
    const fatigue=ctrDrop===null&&convDrop===null?null:Math.max(ctrDrop??0,convDrop??0);
    const action:CreativeHealth["action"]=item.impressions<100?"LEARN":fatigue!==null&&fatigue>=0.35?"REFRESH":fatigue!==null&&fatigue>=0.15?"ITERATE":"KEEP";
    return {...item,ctrPct:currentCtrPct,conversionRatePct:currentConvPct,fatiguePct:pct(fatigue),action};
  });
}

export function evaluateIncrementality(metric:HoldoutMetric):IncrementalityResult {
  const exposedUsers=nonNegative(metric.exposedUsers),holdoutUsers=nonNegative(metric.holdoutUsers);
  const exposedConversions=nonNegative(metric.exposedConversions),holdoutConversions=nonNegative(metric.holdoutConversions);
  const er=ratio(exposedConversions,exposedUsers), hr=ratio(holdoutConversions,holdoutUsers);
  const absolute=er===null||hr===null?null:(er-hr)*100;
  const relative=er===null||hr===null||hr===0?null:(er-hr)/hr*100;
  const incremental=er===null||hr===null?null:Math.round((er-hr)*exposedUsers);
  const exposedRevenue=nonNegative(metric.exposedRevenueCents??0), holdoutRevenue=nonNegative(metric.holdoutRevenueCents??0);
  const holdoutRevenuePerUser=ratio(holdoutRevenue,holdoutUsers);
  const incrementalRevenue=holdoutRevenuePerUser===null?null:Math.round(exposedRevenue-holdoutRevenuePerUser*exposedUsers);
  const enough=exposedUsers>=100&&holdoutUsers>=100;
  const action:IncrementalityResult["action"]=!enough?"MEASURE":absolute!==null&&absolute<0?"STOP":relative!==null&&relative>=20?"SCALE":"LEARN";
  return {...metric,exposedUsers,exposedConversions,holdoutUsers,holdoutConversions,exposedRatePct:pct(er),holdoutRatePct:pct(hr),absoluteLiftPctPoints:absolute===null?null:Number(absolute.toFixed(2)),relativeLiftPct:relative===null?null:Number(relative.toFixed(2)),incrementalConversions:incremental,incrementalRevenueCents:incrementalRevenue,action};
}

export function evaluateReferralLoop(metric:ReferralMetric):ReferralHealth {
  const customers=nonNegative(metric.customers),invites=nonNegative(metric.invites),signups=nonNegative(metric.referredSignups),referred=nonNegative(metric.referredCustomers);
  const invitesPerCustomer=ratio(invites,customers), inviteToSignup=ratio(signups,invites), signupToCustomer=ratio(referred,signups);
  const viral=invitesPerCustomer===null||inviteToSignup===null||signupToCustomer===null?null:invitesPerCustomer*inviteToSignup*signupToCustomer;
  const action:ReferralHealth["action"]=customers<20?"MEASURE":invitesPerCustomer!==null&&invitesPerCustomer<0.5?"IMPROVE_INVITES":signupToCustomer!==null&&signupToCustomer<0.1?"IMPROVE_CONVERSION":viral!==null&&viral>=0.2?"COMPOUND":"IMPROVE_CONVERSION";
  return {...metric,customers,invites,referredSignups:signups,referredCustomers:referred,invitesPerCustomer:invitesPerCustomer===null?null:Number(invitesPerCustomer.toFixed(3)),inviteToSignupPct:pct(inviteToSignup),signupToCustomerPct:pct(signupToCustomer),viralCoefficient:viral===null?null:Number(viral.toFixed(3)),action};
}

export function rankOfferEconomics(metrics:OfferMetric[]):OfferEconomics[] {
  return metrics.map(item=>{
    const exposures=nonNegative(item.exposures), conversions=nonNegative(item.conversions);
    const revenue=nonNegative(item.revenueCents),refunds=nonNegative(item.refundsCents),cost=nonNegative(item.variableCostCents);
    const netRevenue=Math.max(0,revenue-refunds), contribution=netRevenue-cost;
    const refundRate=ratio(refunds,revenue), perExposure=ratio(contribution,exposures);
    const action:OfferEconomics["action"]=exposures<100?"LEARN":contribution<0?"HOLD":conversions>0&&contribution>0?"SCALE":"TEST";
    return {...item,exposures,conversions,revenueCents:revenue,refundsCents:refunds,variableCostCents:cost,conversionRatePct:pct(ratio(conversions,exposures)),netRevenueCents:netRevenue,contributionCents:contribution,contributionPerExposureCents:perExposure===null?null:Number(perExposure.toFixed(2)),refundRatePct:pct(refundRate),action};
  }).sort((a,b)=>b.contributionCents-a.contributionCents);
}

export function prioritizeGrowthSignals(signals:GrowthSignal[]):GrowthPriority[] {
  const ranked=signals.map(signal=>{
    const confidence=clamp(signal.confidence,0,1),impact=clamp(signal.impact),effort=Math.max(1,clamp(signal.effort,1,100)),risk=clamp(signal.risk);
    const score=Math.round(clamp((impact*(0.35+0.65*confidence)*100/effort)-(risk*0.2)));
    return {...signal,impact,confidence,effort,risk,score,rank:0,action:"QUEUE" as GrowthPriority["action"]};
  }).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  let nextAssigned=false;
  return ranked.map((item,index)=>{
    let action:GrowthPriority["action"];
    if(item.risk>=80) action="HOLD";
    else if(item.confidence<0.25) action="LEARN";
    else if(!nextAssigned){action="DO_NEXT";nextAssigned=true;}
    else action="QUEUE";
    return {...item,rank:index+1,action};
  });
}

export function compoundGrowthHealth(input:{netProfitCents:number;retentionRatePct:number|null;incrementalLiftPct:number|null;funnelHealthPct:number|null;organicSharePct:number|null}){
  const profit=input.netProfitCents>0?100:input.netProfitCents===0?50:0;
  const retention=input.retentionRatePct??0, lift=input.incrementalLiftPct===null?0:clamp(50+input.incrementalLiftPct,0,100);
  const funnel=input.funnelHealthPct??0, organic=input.organicSharePct??0;
  const score=Math.round(profit*0.3+retention*0.25+lift*0.2+funnel*0.15+organic*0.1);
  return {score,state:score>=75?"COMPOUND":score>=50?"OPTIMIZE":"PROTECT" as "COMPOUND"|"OPTIMIZE"|"PROTECT"};
}
