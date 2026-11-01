export type RevenueThroughputInput={
  currentMrrEur:number|null;
  newMrr1dEur:number|null;
  newMrr7dEur:number|null;
  activeSubscriptions:number|null;
  landingViews:number|null;
  signups:number|null;
  checkoutStarts:number|null;
  upgrades:number|null;
  stripeCheckoutSuccessRate:number|null;
  invoiceSuccessRate:number|null;
  recent7RevenueCents:number;
  previous7RevenueCents:number;
  recent7Conversions:number;
  previous7Conversions:number;
  stripeConnected:boolean;
  stripeWebhookConfigured:boolean;
  digistoreIpnConfigured:boolean;
  digistoreApiConfigured:boolean;
  databaseReady:boolean;
  providerCircuitsOpen:number;
  providerCircuitsTotal:number;
  stripeWebhookConsecutiveFailures:number;
  digistoreWebhookConsecutiveFailures:number;
};

const pct=(n:number,d:number)=>d>0?Number((n/d*100).toFixed(2)):null;
const change=(now:number,before:number)=>before>0?Number(((now-before)/before*100).toFixed(2)):now>0?100:null;

export function buildRevenueThroughputSnapshot(input:RevenueThroughputInput){
  const funnel=[
    {key:"landing-signup",entrants:input.landingViews,completions:input.signups},
    {key:"signup-checkout",entrants:input.signups,completions:input.checkoutStarts},
    {key:"checkout-upgrade",entrants:input.checkoutStarts,completions:input.upgrades},
  ].map(stage=>{
    const measurable=stage.entrants!==null&&stage.completions!==null;
    const rate=measurable?pct(stage.completions!,stage.entrants!):null;
    return {...stage,ratePct:rate,dropOffPct:rate===null?null:Number((100-rate).toFixed(2))};
  });

  const measured=funnel.filter(x=>x.ratePct!==null&&x.entrants!>=10);
  const bottleneck=measured.sort((a,b)=>(a.ratePct??100)-(b.ratePct??100))[0]??null;
  const recentDaily=input.recent7RevenueCents/7;
  const monthlyRunRateEur=Number((recentDaily*30/100).toFixed(2));
  const revenueVelocityPct=change(input.recent7RevenueCents,input.previous7RevenueCents);
  const conversionVelocityPct=change(input.recent7Conversions,input.previous7Conversions);

  const blockers:string[]=[];
  if(!input.databaseReady)blockers.push("Revenue-Datenbank nicht verfügbar");
  if(!input.stripeConnected)blockers.push("Stripe-Katalog/API nicht verbunden");
  if(!input.stripeWebhookConfigured)blockers.push("Stripe-Webhook-Secret fehlt oder ist ungültig");
  if(!input.digistoreIpnConfigured)blockers.push("Digistore24-IPN nicht konfiguriert");
  if(input.providerCircuitsTotal>0&&input.providerCircuitsOpen===input.providerCircuitsTotal)blockers.push("Alle LLM-Provider-Circuits offen");
  if(input.stripeWebhookConsecutiveFailures>=3)blockers.push(`Stripe-Webhook ${input.stripeWebhookConsecutiveFailures} Fehler in Folge`);
  if(input.digistoreWebhookConsecutiveFailures>=3)blockers.push(`Digistore24-IPN ${input.digistoreWebhookConsecutiveFailures} Fehler in Folge`);
  if(bottleneck&&bottleneck.dropOffPct!==null&&bottleneck.dropOffPct>=50)blockers.push(`Funnel-Engpass ${bottleneck.key}: ${bottleneck.dropOffPct}% Drop-off`);
  if(input.invoiceSuccessRate!==null&&input.invoiceSuccessRate<95)blockers.push(`Invoice-Erfolgsrate nur ${input.invoiceSuccessRate.toFixed(1)}%`);

  const priorities=[
    ...blockers.map((detail,index)=>({rank:index+1,kind:"repair" as const,detail})),
    ...(blockers.length?[]:[{rank:1,kind:"scale" as const,detail:"Kein kritischer Revenue-Blocker: bestes gemessenes B2B-/Funnel-Experiment skalieren"}]),
  ];

  return {
    currentMrrEur:input.currentMrrEur,
    activeSubscriptions:input.activeSubscriptions,
    grossMrrAcquisition:{
      newMrr1dEur:input.newMrr1dEur,
      newMrr7dEur:input.newMrr7dEur,
      avgDailyNewMrr7dEur:input.newMrr7dEur===null?null:Number((input.newMrr7dEur/7).toFixed(2)),
      gross30dAcquisitionRunRateEur:input.newMrr7dEur===null?null:Number((input.newMrr7dEur/7*30).toFixed(2)),
      caveat:"Gross acquisition only; cancellations/churn are not subtracted.",
    },
    mrrVelocity:{
      available:false as const,
      projectedMrrEur:null,
      reason:"Historische MRR- und Churn-Snapshots fehlen; keine MRR-Prognose wird erfunden.",
    },
    revenueVelocity:{
      recent7RevenueEur:Number((input.recent7RevenueCents/100).toFixed(2)),
      previous7RevenueEur:Number((input.previous7RevenueCents/100).toFixed(2)),
      changePct:revenueVelocityPct,
      monthlyRunRateEur,
      recent7Conversions:input.recent7Conversions,
      previous7Conversions:input.previous7Conversions,
      conversionChangePct:conversionVelocityPct,
    },
    funnel,
    bottleneck,
    payments:{
      stripeConnected:input.stripeConnected,
      stripeWebhookConfigured:input.stripeWebhookConfigured,
      digistoreIpnConfigured:input.digistoreIpnConfigured,
      digistoreApiConfigured:input.digistoreApiConfigured,
      stripeCheckoutSuccessRate:input.stripeCheckoutSuccessRate,
      invoiceSuccessRate:input.invoiceSuccessRate,
      stripeWebhookConsecutiveFailures:input.stripeWebhookConsecutiveFailures,
      digistoreWebhookConsecutiveFailures:input.digistoreWebhookConsecutiveFailures,
    },
    infrastructure:{
      databaseReady:input.databaseReady,
      providerCircuitsOpen:input.providerCircuitsOpen,
      providerCircuitsTotal:input.providerCircuitsTotal,
    },
    blockers,
    priorities,
    status:blockers.length?"repair" as const:"scale" as const,
  };
}
