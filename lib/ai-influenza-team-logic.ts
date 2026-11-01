export const AI_INFLUENZA_PACKAGE_IDS=["starter","growth","business"] as const;
export type AiInfluenzaPackageId=(typeof AI_INFLUENZA_PACKAGE_IDS)[number];

export type AiInfluenzaPackage={
  id:AiInfluenzaPackageId;
  name:string;
  monthlyPriceCents:number;
  currency:"eur";
  deliverables:string[];
  defaultMonthlyTaskBatches:Array<{kind:string;quantity:number;ownerAgent:AiInfluenzaAgentId}>;
  hypothesisNotice:string;
};

export const AI_INFLUENZA_PACKAGES:Record<AiInfluenzaPackageId,AiInfluenzaPackage>={
  starter:{
    id:"starter",name:"Starter",monthlyPriceCents:29900,currency:"eur",
    deliverables:["12 Social-Media-Beiträge","4 KI-Bilder","1 Content-Plan"],
    defaultMonthlyTaskBatches:[
      {kind:"content-post",quantity:12,ownerAgent:"content-production"},
      {kind:"ai-image",quantity:4,ownerAgent:"content-production"},
      {kind:"content-plan",quantity:1,ownerAgent:"market-intelligence"},
    ],
    hypothesisNotice:"Startpreis-Hypothese; Kosten und Kundenfeedback müssen real validiert werden.",
  },
  growth:{
    id:"growth",name:"Growth",monthlyPriceCents:99900,currency:"eur",
    deliverables:["12 Kurzvideos","20 Social-Media-Beiträge","1 Monatsreport"],
    defaultMonthlyTaskBatches:[
      {kind:"short-video",quantity:12,ownerAgent:"video-creative-studio"},
      {kind:"content-post",quantity:20,ownerAgent:"content-production"},
      {kind:"monthly-report",quantity:1,ownerAgent:"customer-success"},
    ],
    hypothesisNotice:"Startpreis-Hypothese; Kosten und Kundenfeedback müssen real validiert werden.",
  },
  business:{
    id:"business",name:"Business",monthlyPriceCents:249900,currency:"eur",
    deliverables:["Individuelles KI-Marketing-Team","Vereinbarter Leistungsumfang","Monatliches Performance-Reporting"],
    defaultMonthlyTaskBatches:[
      {kind:"custom-strategy",quantity:1,ownerAgent:"ceo-orchestrator"},
      {kind:"content-production",quantity:1,ownerAgent:"content-production"},
      {kind:"performance-report",quantity:1,ownerAgent:"revenue-profit-optimizer"},
    ],
    hypothesisNotice:"Startpreis-Hypothese; Leistungsumfang, Kosten und Kundenfeedback müssen vor Skalierung validiert werden.",
  },
};

export const AI_INFLUENZA_AGENT_IDS=[
  "ceo-orchestrator","market-intelligence","lead-discovery","sales-conversion",
  "content-production","video-creative-studio","customer-success","revenue-profit-optimizer",
] as const;
export type AiInfluenzaAgentId=(typeof AI_INFLUENZA_AGENT_IDS)[number];

export type AiInfluenzaAgent={
  id:AiInfluenzaAgentId;
  name:string;
  mission:string;
  capabilities:string[];
  externalActionAllowed:boolean;
};

export const AI_INFLUENZA_AGENTS:AiInfluenzaAgent[]=[
  {id:"ceo-orchestrator",name:"CEO & Business Orchestrator",mission:"Priorisiert rentable Arbeit, koordiniert Agenten und überwacht Qualität/Kosten.",capabilities:["task-routing","quality-gates","business-reporting","budget-prioritization"],externalActionAllowed:false},
  {id:"market-intelligence",name:"Market Intelligence",mission:"Identifiziert belegbare Marktprobleme, Nachfrage und Angebotschancen.",capabilities:["market-analysis","offer-hypothesis","competitor-research-brief"],externalActionAllowed:false},
  {id:"lead-discovery",name:"Lead Discovery",mission:"Qualifiziert öffentlich belegte B2B-Zielunternehmen ohne unerlaubte Kontaktaufnahme.",capabilities:["lead-scoring","dedupe","public-source-evidence","compliance-tagging"],externalActionAllowed:false},
  {id:"sales-conversion",name:"Sales & Conversion",mission:"Erstellt Angebote, Landing-/CTA-Entwürfe und rechtlich zulässige Kontaktvorbereitung.",capabilities:["proposal-draft","landing-draft","sales-pipeline","meeting-prep"],externalActionAllowed:false},
  {id:"content-production",name:"Content Production",mission:"Produziert Social-Content, Bilder, Kampagnen und Kalender als freigabepflichtige Assets.",capabilities:["social-posts","image-briefs","campaigns","content-calendar"],externalActionAllowed:false},
  {id:"video-creative-studio",name:"Video & Creative Studio",mission:"Erstellt Shorts/Reels-Pakete, Storyboards, Untertitel und Plattformformate.",capabilities:["short-video","storyboard","captions","creative-package"],externalActionAllowed:false},
  {id:"customer-success",name:"Customer Success",mission:"Überwacht Aufträge, Fristen, Reports, Serviceanfragen und Kündigungsrisiken.",capabilities:["delivery-tracking","progress-report","renewal-risk","support-triage"],externalActionAllowed:false},
  {id:"revenue-profit-optimizer",name:"Revenue & Profit Optimizer",mission:"Analysiert echte Umsätze, Kosten, Deckungsbeiträge und Preis-Hypothesen.",capabilities:["revenue-analysis","cost-analysis","margin-analysis","pricing-recommendation"],externalActionAllowed:false},
];

export const AI_INFLUENZA_WORKFLOW_STEPS=[
  "market-analysis","target-research","lead-scoring","proposal-draft","approval","contact-preparation",
  "customer-inquiry","contract-ready","payment-pending","paid","onboarding","production","quality-review",
  "customer-approval","delivery","reporting","renewal",
] as const;
export type AiInfluenzaWorkflowStep=(typeof AI_INFLUENZA_WORKFLOW_STEPS)[number];

export type AiInfluenzaMode="manual"|"assisted"|"autopilot";
export const DEFAULT_AI_INFLUENZA_MODE:AiInfluenzaMode="assisted";

const EXTERNAL_OR_SENSITIVE_STEPS=new Set<AiInfluenzaWorkflowStep>([
  "contact-preparation","contract-ready","payment-pending","customer-approval","delivery","renewal",
]);

export function canAdvanceAiInfluenzaStep(args:{
  mode:AiInfluenzaMode;
  from:AiInfluenzaWorkflowStep;
  to:AiInfluenzaWorkflowStep;
  approved:boolean;
  budgetCents:number;
  estimatedCostCents:number;
}){
  const fromIndex=AI_INFLUENZA_WORKFLOW_STEPS.indexOf(args.from);
  const toIndex=AI_INFLUENZA_WORKFLOW_STEPS.indexOf(args.to);
  if(toIndex!==fromIndex+1)return {allowed:false as const,reason:"Nur der nächste definierte Workflow-Schritt ist zulässig."};
  if(args.estimatedCostCents<0||args.budgetCents<0)return {allowed:false as const,reason:"Budget-/Kostenwerte müssen nichtnegativ sein."};
  if(args.estimatedCostCents>args.budgetCents)return {allowed:false as const,reason:"Geschätzte Kosten überschreiten das freigegebene Budget."};
  if(args.mode==="manual"&&!args.approved)return {allowed:false as const,reason:"Manual-Modus benötigt für jeden Schritt eine Freigabe."};
  if(EXTERNAL_OR_SENSITIVE_STEPS.has(args.to)&&!args.approved)return {allowed:false as const,reason:"Externe oder sensible Kundenaktion benötigt Freigabe."};
  return {allowed:true as const};
}

export function nextAiInfluenzaStep(current:AiInfluenzaWorkflowStep):AiInfluenzaWorkflowStep|null{
  const index=AI_INFLUENZA_WORKFLOW_STEPS.indexOf(current);
  return index>=0&&index<AI_INFLUENZA_WORKFLOW_STEPS.length-1?AI_INFLUENZA_WORKFLOW_STEPS[index+1]:null;
}

export type AiInfluenzaOrderPayload={
  businessUnit:"ai-influenza-team";
  orderId:string;
  customerNodeKey:string;
  packageId:AiInfluenzaPackageId;
  mode:AiInfluenzaMode;
  step:AiInfluenzaWorkflowStep;
  monthlyBudgetCents:number;
  paymentStatus:"not-started"|"pending"|"paid"|"past-due"|"cancelled"|"test-only";
  stripeSubscriptionId?:string|null;
  testOnly?:boolean;
  createdByOpenId:string;
};

export function buildAiInfluenzaMonthlyPlan(packageId:AiInfluenzaPackageId){
  const pkg=AI_INFLUENZA_PACKAGES[packageId];
  return pkg.defaultMonthlyTaskBatches.map((batch,index)=>({
    sequence:index+1,
    taskKind:batch.kind,
    quantity:batch.quantity,
    ownerAgent:batch.ownerAgent,
    requiresExternalApproval:["short-video","content-post","ai-image"].includes(batch.kind),
  }));
}

export function calculateAiInfluenzaUnitEconomics(args:{
  recognizedRevenueCents:number;
  deliveryCostCents:number;
  apiCostCents:number;
  refundCents?:number;
}){
  const revenue=Math.max(0,args.recognizedRevenueCents);
  const costs=Math.max(0,args.deliveryCostCents)+Math.max(0,args.apiCostCents)+Math.max(0,args.refundCents??0);
  const contributionCents=revenue-costs;
  const marginPct=revenue>0?Number((contributionCents/revenue*100).toFixed(2)):null;
  return {recognizedRevenueCents:revenue,totalCostCents:costs,contributionCents,marginPct,profitable:contributionCents>0};
}

export function packageForStripeMetadata(value:unknown):AiInfluenzaPackageId|null{
  return typeof value==="string"&&(AI_INFLUENZA_PACKAGE_IDS as readonly string[]).includes(value)?value as AiInfluenzaPackageId:null;
}


export const AI_INFLUENZA_PRICE_ENV:Record<AiInfluenzaPackageId,string>={
  starter:"STRIPE_AI_INFLUENZA_PRICE_ID_STARTER",
  growth:"STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH",
  business:"STRIPE_AI_INFLUENZA_PRICE_ID_BUSINESS",
};

export function buildAiInfluenzaStripeLineItem(packageId:AiInfluenzaPackageId,env:Record<string,string|undefined>){
  const pkg=AI_INFLUENZA_PACKAGES[packageId];
  const configured=env[AI_INFLUENZA_PRICE_ENV[packageId]]?.trim();
  if(configured){
    if(!configured.startsWith("price_"))throw new Error(`${AI_INFLUENZA_PRICE_ENV[packageId]} muss eine Stripe-Preis-ID sein.`);
    return {price:configured,quantity:1} as const;
  }
  return {
    price_data:{
      currency:pkg.currency,
      unit_amount:pkg.monthlyPriceCents,
      recurring:{interval:"month" as const},
      product_data:{
        name:`AI Influenza Team · ${pkg.name}`,
        description:pkg.deliverables.join(" · ").slice(0,500),
        metadata:{businessUnit:"ai-influenza-team",packageId:pkg.id},
      },
    },
    quantity:1,
  } as const;
}


export function maySetPaidWithoutStripe(testOnly:boolean,nextStep:AiInfluenzaWorkflowStep){
  return nextStep!=="paid"||testOnly;
}

export function simulateAiInfluenzaTestJourney(packageId:AiInfluenzaPackageId){
  let current:AiInfluenzaWorkflowStep="market-analysis";
  const visited:AiInfluenzaWorkflowStep[]=[current];
  let guard=0;
  while(guard++<AI_INFLUENZA_WORKFLOW_STEPS.length+2){
    const next=nextAiInfluenzaStep(current);
    if(!next)break;
    const sensitive=EXTERNAL_OR_SENSITIVE_STEPS.has(next);
    const approved=sensitive||next==="paid";
    const decision=canAdvanceAiInfluenzaStep({
      mode:"assisted",from:current,to:next,approved,
      budgetCents:AI_INFLUENZA_PACKAGES[packageId].monthlyPriceCents,
      estimatedCostCents:0,
    });
    if(!decision.allowed)throw new Error(`Test-Journey blockiert bei ${current} -> ${next}: ${decision.reason}`);
    if(!maySetPaidWithoutStripe(true,next))throw new Error("Test-only Payment-Gate unerwartet blockiert.");
    current=next;visited.push(current);
  }
  return {
    testOnly:true as const,
    packageId,
    paymentStatus:"test-only" as const,
    externalActionsExecuted:0,
    visited,
    completed:current==="renewal",
    deliveryPlan:buildAiInfluenzaMonthlyPlan(packageId),
    truthNote:"Keine Live-Zahlung, kein Vertrag und kein externer Versand wurde ausgeführt.",
  };
}
