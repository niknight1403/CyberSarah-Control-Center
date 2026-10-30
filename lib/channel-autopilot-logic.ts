export type ChannelAutopilotSnapshot={
  impressions:number;views:number;clicks:number;leads:number;purchases:number;refunds:number;
  confirmedRevenueCents:number;published:number;failed:number;
  activeExperiments:number;pendingContentDrafts:number;pendingRevenueDrafts:number;
  reachSource?:"events"|"platform";invalidInsightValues?:number;
};
export type ChannelLever="DISCOVERY"|"PACKAGING"|"RETENTION"|"CTA"|"LANDING"|"MONETIZATION"|"RELIABILITY"|"COMPOUND";
export type ChannelAutopilotDecision={
  lever:ChannelLever;score:number;confidence:number;reason:string;
  experiment:string;metric:string;target:string;unit:string;targetValue:number;requiresApproval:boolean;
  autonomousActions:string[];blockedActions:string[];
};
const pct=(n:number,d:number)=>d>0?n/d*100:null;
const round=(n:number,d=1)=>Number(n.toFixed(d));
const safe=(n:number)=>Math.max(0,Number.isFinite(n)?n:0);

/**
 * Channel Autopilot: a truth-first multi-objective controller.
 * It optimizes the narrowest measured bottleneck instead of blindly maximizing posting volume.
 */
export function decideChannelAutopilot(s:ChannelAutopilotSnapshot):ChannelAutopilotDecision{
  const impressions=safe(s.impressions),views=safe(s.views),clicks=safe(s.clicks),leads=safe(s.leads);
  const purchases=safe(s.purchases),published=safe(s.published),failed=safe(s.failed);
  const viewRate=pct(views,impressions),clickRate=pct(clicks,views||impressions),leadRate=pct(leads,clicks),buyRate=pct(purchases,leads);
  const reliability=pct(published,published+failed);
  const evidence=Math.min(1,(impressions/5000)*0.45+(clicks/100)*0.25+(leads/30)*0.2+(purchases/10)*0.1);
  const common={requiresApproval:true,autonomousActions:["Metriken lesen","Engpass diagnostizieren","Experiment entwerfen","Pending-Draft erzeugen","Lernhistorie aktualisieren"],blockedActions:["ungeprüft veröffentlichen","Budget ausgeben","Preis ändern","Affiliate-Partnerschaft behaupten"]};

  if(published+failed>=5&&reliability!=null&&reliability<85) return {...common,lever:"RELIABILITY",score:96,confidence:round(Math.min(1,(published+failed)/20),2),reason:`Publishing-Reliabilität nur ${round(reliability)}%; Reichweite skalieren würde Fehler skalieren.`,experiment:"Fehlerklassen der letzten Jobs isolieren und den häufigsten reproduzierbaren Fehler zuerst beseitigen.",metric:"Publishing success rate",target:">= 95%",unit:"%",targetValue:95};
  if(impressions<1000) return {...common,lever:"DISCOVERY",score:90,confidence:round(evidence,2),reason:"Noch zu wenig Impressionen für belastbare Funnel-Optimierung.",experiment:"Drei klar unterschiedliche Problemwinkel als Pending-Drafts testen; gleiche Zielgruppe, keine Mehrfachvariablen.",metric:"qualified impressions",target:">= 1,000 je Lernfenster",unit:"impressions",targetValue:1000};
  if(viewRate!=null&&viewRate<5) return {...common,lever:"PACKAGING",score:94,confidence:round(evidence,2),reason:`View/Impression-Rate ${round(viewRate)}%; Packaging ist der früheste messbare Engpass.`,experiment:"Titel/Thumbnail-Hypothese gegen aktuelle Baseline testen; Inhalt und CTA konstant halten.",metric:"view/impression rate",target:"+20% relativ zur Baseline",unit:"% relative lift",targetValue:20};
  if(views>=200&&clickRate!=null&&clickRate<1) return {...common,lever:"CTA",score:88,confidence:round(evidence,2),reason:`Qualified-click rate ${round(clickRate,2)}%; Aufmerksamkeit konvertiert nicht in Intent.`,experiment:"Eine konkrete problemnahe CTA gegen die aktuelle CTA testen; Packaging unverändert.",metric:"qualified click rate",target:">= 1.5%",unit:"%",targetValue:1.5};
  if(clicks>=20&&leadRate!=null&&leadRate<20) return {...common,lever:"LANDING",score:86,confidence:round(evidence,2),reason:`Lead-Conversion ${round(leadRate)}%; genug Klick-Evidenz für Landing/Lead-Magnet-Test.`,experiment:"Lead-Magnet-Nutzen und Formularfriktion einzeln testen; Trafficquelle konstant.",metric:"click-to-lead rate",target:">= 25%",unit:"%",targetValue:25};
  if(leads>=20&&buyRate!=null&&buyRate<3) return {...common,lever:"MONETIZATION",score:84,confidence:round(evidence,2),reason:`Lead-to-purchase ${round(buyRate)}%; Reichweite vorhanden, Monetarisierungs-Fit ist schwächer.`,experiment:"Nur ein relevantes Angebot/Produkt-Match als Hypothese testen; bestätigten Umsatz und Refunds messen.",metric:"lead-to-purchase rate",target:">= 3%",unit:"%",targetValue:3};
  if(s.confirmedRevenueCents>0&&purchases>=3) return {...common,lever:"COMPOUND",score:82,confidence:round(evidence,2),reason:"Bestätigter Umsatz und mehrere Käufe vorhanden; Gewinner darf kontrolliert repliziert werden.",experiment:"Gewinner-Thema in einem benachbarten Problemwinkel replizieren; Exploration-Floor beibehalten.",metric:"confirmed revenue per 1k impressions",target:"+15% ohne sinkende Lead-Qualität",unit:"% relative lift",targetValue:15};
  return {...common,lever:"RETENTION",score:80,confidence:round(evidence,2),reason:"Frühe Funnelstufen sind nicht klar gebrochen; Content-Substanz/Retention ist der nächste kontrollierte Hebel.",experiment:"Hook/Struktur eines Videos testen; Titel, CTA und Angebot konstant halten.",metric:"average retention",target:"+15% relativ zur Baseline",unit:"% relative lift",targetValue:15};
}

export function channelAutopilotHealth(s:ChannelAutopilotSnapshot){
  const net=s.confirmedRevenueCents;
  const reliability=pct(s.published,s.published+s.failed);
  const learningLoad=s.activeExperiments+s.pendingContentDrafts+s.pendingRevenueDrafts;
  return {
    confirmedRevenueCents:net,
    publishingReliabilityPct:reliability==null?null:round(reliability),
    learningLoad,
    queuePressure:learningLoad>=12?"HIGH":learningLoad>=6?"MEDIUM":"LOW",
    truthMode:"confirmed-revenue-only" as const,
    objective:"reach -> qualified intent -> leads -> confirmed revenue -> repeatable profit",
  };
}

export function buildChannelExperimentDraft(decision:ChannelAutopilotDecision,runId?:string,evidenceFingerprint?:string){
  return {
    hub:"loop" as const,
    name:`CHANNEL AUTO · ${decision.lever}${runId?` · ${runId}`:""}`,
    hypothesis:decision.reason,
    stages:["Observe","Diagnose","Draft","Human Gate","Measure","Learn"],
    metric:decision.metric,
    autopilotKey:`channel-autopilot:${decision.lever.toLowerCase()}`,
    baseline:"aus aktuellem Messfenster",
    target:decision.target,
    score:decision.score,
    experiment:decision.experiment,
    unit:decision.unit,
    targetValue:decision.targetValue,
    currentValue:0,
    ...(evidenceFingerprint?{evidenceFingerprint}:{}),
  };
}

export function buildChannelContentDraft(decision:ChannelAutopilotDecision,evidenceFingerprint?:string){
  return {
    personaId:"automationsklar-editorial",
    platform:"youtube/shorts",
    topic:`Autopilot-Experiment: ${decision.lever}`,
    content:`Hypothese: ${decision.reason}\n\nExperiment: ${decision.experiment}\n\nPrimärmetrik: ${decision.metric}\nZiel: ${decision.target}`,
    assets:[],
    assetCount:0,
    disclosure:"Autonom erzeugter Optimierungsentwurf; Fakten/Assets prüfen; Veröffentlichung bleibt freigabepflichtig.",
    autopilotKey:`channel-content:${decision.lever.toLowerCase()}`,
    ...(evidenceFingerprint?{evidenceFingerprint}:{}),
  };
}


/** Sprint 7/10 — Grober Evidenz-Fingerprint statt Zeit-Bucket.
 * Kleine Messrauschen erzeugen keine neuen Drafts; erst ein materiell neues
 * Datenfenster öffnet die nächste Lernrunde.
 */
export function channelEvidenceFingerprint(s:ChannelAutopilotSnapshot):string{
  const bucket=(value:number,size:number)=>Math.floor(safe(value)/size)*size;
  return [
    `i${bucket(s.impressions,250)}`,
    `v${bucket(s.views,50)}`,
    `c${bucket(s.clicks,5)}`,
    `l${safe(s.leads)}`,
    `p${safe(s.purchases)}`,
    `r${safe(s.refunds)}`,
    `rev${bucket(s.confirmedRevenueCents,1000)}`,
    `pub${safe(s.published)}`,
    `fail${safe(s.failed)}`,
  ].join(":");
}


/** Sprint 9/10 — Lern-Backpressure: Der Autopilot darf keine immer groessere
 * Draft-/Experiment-Schlange produzieren, wenn Auswertung/Freigabe hinterherhinkt.
 */
export function channelAutopilotDraftGate(s:ChannelAutopilotSnapshot):{allowed:boolean;reason:string}{
  const pending=safe(s.pendingContentDrafts)+safe(s.pendingRevenueDrafts);
  const active=safe(s.activeExperiments);
  const load=pending+active;
  if(active>=6){
    return {allowed:false,reason:`Lern-Backpressure: ${active} aktive Experimente — erst messen/abschliessen, dann neue starten.`};
  }
  if(pending>=8||load>=12){
    return {allowed:false,reason:`Lern-Backpressure: ${pending} Pending-Drafts und ${active} aktive Experimente — Queue zuerst abbauen.`};
  }
  return {allowed:true,reason:"Lernkapazitaet verfuegbar."};
}
