export type SystemState = "GREEN" | "DEGRADED" | "BLOCKED";
export type RevenueSubsystem = { name: string; required: boolean; ok: boolean; deferred?: boolean; detail?: string };
export type PersonaMetric = { personaId: string; impressions: number; engagements: number; clicks: number; leads: number; conversions: number; revenueCents: number };
export type BudgetAllocation = PersonaMetric & { affinityScore: number; budgetShare: number };
export type CommercialInput = { priceCents: number; marginPct: number; conversionProbability: number; effortScore: number; riskScore: number; expectedReach: number };
export type CommercialScore = CommercialInput & { expectedRevenueCents: number; expectedProfitCents: number; score: number };
export type ProfitSnapshot = { revenueCents: number; variableCostCents: number; apiCostCents: number; refundsCents: number; customers: number; leads: number };
export type ProfitGuardResult = ProfitSnapshot & { netProfitCents: number; marginPct: number | null; cacCents: number | null; refundRatePct: number | null; state: SystemState; reasons: string[] };
export type AttributionEvent = { personaId: string; contentId: string; platform: string; eventType: "impression"|"click"|"lead"|"purchase"|"refund"; valueCents?: number };
export type AttributionSummary = { impressions: number; clicks: number; leads: number; purchases: number; refunds: number; revenueCents: number; clickRatePct: number|null; leadRatePct: number|null; purchaseRatePct: number|null };
export type ExperimentMetric = { variantId: string; exposures: number; conversions: number; revenueCents: number };
export type ExperimentDecision = { winnerId: string|null; action: "LEARN"|"SCALE"|"KILL"; reason: string };
export type ContentAssetFormat = "reel"|"tiktok"|"carousel"|"story"|"social"|"newsletter"|"landing"|"cta";

const clamp=(n:number,min=0,max=100)=>Math.min(max,Math.max(min,Number.isFinite(n)?n:0));
const ratio=(a:number,b:number)=>b>0?a/b:null;

export function deriveSystemState(subsystems: RevenueSubsystem[]): {state:SystemState; reasons:string[]} {
  const required=subsystems.filter(s=>s.required);
  const failed=required.filter(s=>!s.ok&&!s.deferred);
  const deferred=required.filter(s=>!s.ok&&s.deferred);
  if(failed.length) return {state:"BLOCKED",reasons:failed.map(s=>`${s.name}: ${s.detail??"nicht verfügbar"}`)};
  if(deferred.length) return {state:"DEGRADED",reasons:deferred.map(s=>`${s.name}: ${s.detail??"zurückgestellt"}`)};
  if(required.length===0) return {state:"BLOCKED",reasons:["Keine erforderlichen Teilsysteme registriert."]};
  return {state:"GREEN",reasons:[]};
}

export function allocatePersonaBudget(metrics: PersonaMetric[]): BudgetAllocation[] {
  if(!metrics.length) return [];
  const scored=metrics.map(m=>{
    const engagement=ratio(m.engagements,m.impressions)??0;
    const ctr=ratio(m.clicks,m.impressions)??0;
    const lead=ratio(m.leads,m.clicks)??0;
    const conversion=ratio(m.conversions,m.leads)??0;
    const revenue=m.revenueCents/10000;
    const confidence=Math.min(1,Math.log10(Math.max(10,m.impressions))/4);
    const affinityScore=clamp((engagement*25+ctr*25+lead*20+conversion*20+Math.min(1,revenue)*10)*confidence);
    return {...m,affinityScore};
  });
  const floor=0.05;
  const weights=scored.map(x=>Math.max(1,x.affinityScore));
  const sum=weights.reduce((a,b)=>a+b,0);
  const flexible=Math.max(0,1-floor*scored.length);
  return scored.map((x,i)=>({...x,budgetShare:Number((floor+flexible*(weights[i]/sum)).toFixed(4))}))
    .sort((a,b)=>b.budgetShare-a.budgetShare);
}

export function evaluateCommercial(input: CommercialInput): CommercialScore {
  const probability=clamp(input.conversionProbability,0,1);
  const margin=clamp(input.marginPct,0,100)/100;
  const expectedRevenueCents=Math.round(Math.max(0,input.expectedReach)*probability*Math.max(0,input.priceCents));
  const expectedProfitCents=Math.round(expectedRevenueCents*margin);
  const efficiency=expectedProfitCents/Math.max(1,input.effortScore*100);
  const score=Math.round(clamp(Math.log10(1+Math.max(0,efficiency))*28 + probability*35 + margin*25 - clamp(input.riskScore)*0.25));
  return {...input,expectedRevenueCents,expectedProfitCents,score};
}

export function profitGuard(snapshot: ProfitSnapshot): ProfitGuardResult {
  const netProfitCents=snapshot.revenueCents-snapshot.variableCostCents-snapshot.apiCostCents-snapshot.refundsCents;
  const marginPct=snapshot.revenueCents>0?Number((netProfitCents/snapshot.revenueCents*100).toFixed(2)):null;
  const cacCents=snapshot.customers>0?Math.round((snapshot.variableCostCents+snapshot.apiCostCents)/snapshot.customers):null;
  const refundRatePct=snapshot.revenueCents>0?Number((snapshot.refundsCents/snapshot.revenueCents*100).toFixed(2)):null;
  const reasons:string[]=[];
  if(netProfitCents<0) reasons.push("Netto-Profit negativ");
  if(refundRatePct!==null&&refundRatePct>15) reasons.push("Refund-Anteil über 15 %");
  const state:SystemState=reasons.length?"DEGRADED":"GREEN";
  return {...snapshot,netProfitCents,marginPct,cacCents,refundRatePct,state,reasons};
}

export function summarizeAttribution(events: AttributionEvent[]): AttributionSummary {
  const count=(type:AttributionEvent["eventType"])=>events.filter(e=>e.eventType===type).length;
  const impressions=count("impression"),clicks=count("click"),leads=count("lead"),purchases=count("purchase"),refunds=count("refund");
  const revenueCents=events.reduce((sum,e)=>sum+(e.eventType==="purchase"?Math.max(0,e.valueCents??0):e.eventType==="refund"?-Math.max(0,e.valueCents??0):0),0);
  return {impressions,clicks,leads,purchases,refunds,revenueCents,
    clickRatePct:impressions?Number((clicks/impressions*100).toFixed(2)):null,
    leadRatePct:clicks?Number((leads/clicks*100).toFixed(2)):null,
    purchaseRatePct:leads?Number((purchases/leads*100).toFixed(2)):null};
}

export function decideExperiment(metrics: ExperimentMetric[], minExposures=100): ExperimentDecision {
  const eligible=metrics.filter(m=>m.exposures>=minExposures);
  if(eligible.length<2) return {winnerId:null,action:"LEARN",reason:"Noch nicht genug echte Exposures für eine belastbare Entscheidung."};
  const ranked=[...eligible].sort((a,b)=>{
    const ap=a.conversions/a.exposures,bp=b.conversions/b.exposures;
    return bp-ap||b.revenueCents-a.revenueCents;
  });
  const best=ranked[0],second=ranked[1];
  const bestRate=best.conversions/best.exposures, secondRate=second.conversions/second.exposures;
  if(best.conversions===0) return {winnerId:null,action:"KILL",reason:"Keine Variante erzeugt Conversions im Mindestfenster."};
  if(bestRate>=secondRate*1.2&&best.exposures>=minExposures) return {winnerId:best.variantId,action:"SCALE",reason:"Gewinner liegt mindestens 20 % über der nächstbesten Conversion-Rate."};
  return {winnerId:best.variantId,action:"LEARN",reason:"Führende Variante erkannt, Abstand für automatisches Skalieren noch zu klein."};
}

export const CONTENT_FACTORY_FORMATS: readonly ContentAssetFormat[]=["reel","tiktok","carousel","story","social","newsletter","landing","cta"] as const;

export function planContentFactory(maxAssets=30): {format:ContentAssetFormat; variant:number}[] {
  const limit=Math.max(1,Math.min(30,Math.floor(maxAssets)));
  const result:{format:ContentAssetFormat;variant:number}[]=[];
  for(let i=0;i<limit;i++) result.push({format:CONTENT_FACTORY_FORMATS[i%CONTENT_FACTORY_FORMATS.length],variant:Math.floor(i/CONTENT_FACTORY_FORMATS.length)+1});
  return result;
}

export type OneClickBusinessInput={idea:string; audience?:string; goal?:string};
export function buildOneClickBusinessBrief(input:OneClickBusinessInput): string {
  const idea=input.idea.trim();
  if(idea.length<5) throw new Error("Geschäftsidee muss mindestens 5 Zeichen enthalten.");
  return [
    "Erstelle einen umsetzbaren Business-Funnel ohne erfundene Markt- oder Umsatzdaten.",
    `Idee: ${idea}`,
    input.audience?.trim()?`Zielgruppe: ${input.audience.trim()}`:"Zielgruppe: aus dem Briefing ableiten und als Hypothese kennzeichnen.",
    input.goal?.trim()?`Ziel: ${input.goal.trim()}`:"Ziel: profitablen validierbaren Funnel entwerfen.",
    "Liefere Zielgruppe, Positionierung, passende KI-Persona, Content-Plan, Lead-Magnet, Angebot, Landingpage-Struktur, Messplan und Risiken.",
    "Jede Prognose muss als Hypothese markiert sein; externe Veröffentlichung oder Preisänderung erfolgt nicht automatisch."
  ].join("\n");
}
