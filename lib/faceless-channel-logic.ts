export type NicheCandidate = {
  key: string;
  name: string;
  demand: number;
  differentiation: number;
  productFit: number;
  productionFit: number;
  monetization: number;
  legalSafety: number;
  evidence: string[];
};

export type WeeklyChannelMetrics = {
  impressions: number;
  views: number;
  ctrPct: number | null;
  averageViewSeconds: number | null;
  averageVideoSeconds: number | null;
  returningViewers: number | null;
  qualifiedClicks: number;
  emailSignups: number;
  confirmedRevenueCents: number;
};

export type VideoSeed = {
  id: string;
  problem: string;
  audience: string;
  titleVariants: string[];
  recommendedTitle: string;
  hook: string;
  example: string;
  result: string;
  scenes: string[];
  thumbnailText: string;
  cta: string;
  sources: string[];
};

const clamp=(value:number,min=0,max=100)=>Math.min(max,Math.max(min,value));
const round=(value:number,digits=2)=>Number(value.toFixed(digits));

export const AUTOMATIONSKLAR_SOURCES = {
  youtubeYpp: "https://support.google.com/youtube/answer/72851",
  youtubeAiDisclosure: "https://support.google.com/youtube/answer/14328491",
  n8nAffiliate: "https://n8n.io/affiliates/",
  makeAffiliate: "https://help.make.com/affiliate-program",
  bmfEInvoice: "https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html",
  bsiKmu: "https://www.bsi.bund.de/",
} as const;

/** Sprint 473 — evidence-oriented niche scorecard. Scores are explicit editorial assumptions, not market facts. */
export const NICHE_CANDIDATES:NicheCandidate[]=[
  {key:"ai-automation-smb",name:"KI-Werkzeuge & Automatisierung für Selbstständige/KMU",demand:95,differentiation:80,productFit:95,productionFit:95,monetization:92,legalSafety:78,evidence:["KfW/Bitkom adoption gap","n8n/Make creator affiliate programs","screen-recording friendly"]},
  {key:"e-invoice-office",name:"E-Rechnung & digitales Büro",demand:92,differentiation:62,productFit:86,productionFit:82,monetization:78,legalSafety:48,evidence:["German e-invoice transition","software/tool demand","tax/legal review required"]},
  {key:"cybersecurity-smb",name:"Cybersicherheit für KMU",demand:85,differentiation:78,productFit:68,productionFit:62,monetization:66,legalSafety:60,evidence:["BSI KMU guidance","persistent security need","higher expertise/liability burden"]},
];

export function scoreNiches(candidates=NICHЕ_SAFE()):Array<NicheCandidate & {score:number}>{
  return candidates.map(item=>({...item,score:round((item.demand+item.differentiation+item.productFit+item.productionFit+item.monetization+item.legalSafety)/6,1)})).sort((a,b)=>b.score-a.score);
}
function NICHЕ_SAFE(){ return NICHE_CANDIDATES; }

export const FACELESS_CHANNEL_BRAND={
  workingName:"Automationsklar",
  status:"working-name-until-trademark-handle-domain-check",
  promise:"Weniger klicken. Besser arbeiten.",
  positioning:"Keine KI-News und keine Reichtumsversprechen: reale Geschäftsprozesse automatisieren, Grenzen zeigen und Ergebnisse messen.",
  audience:"Deutschsprachige Solo-Selbstständige, Agenturen, Beratungen, Handwerks- und Dienstleistungsbetriebe sowie kleine Teams.",
  tone:["ruhig","kompetent","kritisch","konkret","evidenzorientiert"],
  pillars:[
    "Automatisieren statt klicken",
    "Werkzeugtests ohne Hype",
    "KI im Tagesgeschäft",
    "Sicher automatisieren",
    "Automationslabor: vorher/nachher messen",
  ],
  design:{
    colors:{navy:"#0B1220",mint:"#39E6B0",amber:"#FFB547",offWhite:"#F6F8FB"},
    headlineFont:"Space Grotesk",
    bodyFont:"Inter",
    thumbnailRule:"maximal 3 visuelle Elemente und 2-4 Wörter; Ergebnis/Entscheidung statt Clickbait",
    visuals:["eigene Bildschirmaufnahmen","eigene Prozessgrafiken","Workflow-Nodes","Diagramme","produktbezogene Demos"],
  },
} as const;

/** Sprint 474 — lead magnet before monetization. */
export const LEAD_MAGNET={
  name:"15-Minuten-Automations-Check",
  purpose:"Wiederkehrende Aufgaben nach Häufigkeit, Zeitbedarf, Standardisierbarkeit und Fehlerrisiko priorisieren.",
  fields:["Aufgabe","Häufigkeit pro Woche","Minuten pro Vorgang","Standardisierbarkeit 0-100","Fehlerfolgen 0-100","Daten-/Freigaberisiko 0-100"],
  scoring:"frequency * minutes * standardization, reduced by error/data risk",
  promise:"Priorisierung statt Erfolgsgarantie",
  externalAction:"Double-opt-in, Landingpage und Versand erst nach vorhandener Infrastruktur/Freigabe aktivieren",
} as const;

export function automationOpportunityScore(input:{frequencyPerWeek:number;minutesPerRun:number;standardization:number;errorRisk:number;dataRisk:number}){
  const gross=Math.max(0,input.frequencyPerWeek)*Math.max(0,input.minutesPerRun)*(clamp(input.standardization)/100);
  const riskPenalty=1-(clamp(input.errorRisk)*0.35+clamp(input.dataRisk)*0.35)/100;
  return {weeklyMinutes:Math.round(gross),score:round(gross*Math.max(0.3,riskPenalty),1),requiresHumanGate:input.errorRisk>=50||input.dataRisk>=50};
}

/** Sprint 475 — three launch-ready long-form briefs. */
export const STARTER_VIDEOS:VideoSeed[]=[
  {
    id:"yt-001",audience:"Selbstständige/KMU ohne klaren KI-Einstieg",problem:"Unklar, welche wiederkehrenden Aufgaben zuerst automatisiert werden sollten.",
    titleVariants:["5 KI-Automationen, die Selbstständigen wirklich Zeit sparen","Automatisiere diese 5 Aufgaben zuerst","5 Büroprozesse: Was sich zuerst zu automatisieren lohnt"],
    recommendedTitle:"Automatisiere diese 5 Aufgaben zuerst",
    hook:"Wenn du mit KI anfangen willst, automatisiere nicht den spektakulärsten Prozess. Automatisiere den Prozess, den du jede Woche hasst.",
    example:"Kundenanfrage -> strukturieren -> kategorisieren -> Antwortentwurf -> menschliche Freigabe.",
    result:"Ein messbarer Vorher/Nachher-Test für Bearbeitungszeit, Korrekturen und Fehlerquote.",
    scenes:["Inbox-Demo","Workflow-Nodes","fünf Prozesskarten","Freigabe-Gate","Vorher/Nachher-Tabelle"],
    thumbnailText:"DIESE 5 ZUERST",cta:"Kostenlosen 15-Minuten-Automations-Check verwenden.",
    sources:[],
  },
  {
    id:"yt-002",audience:"Kleine Teams vor einer Toolentscheidung",problem:"n8n, Make und agentische Arbeitsweisen werden ohne Prozessbezug verglichen.",
    titleVariants:["n8n vs Make vs agentische KI: Was passt zu deinem Unternehmen?","Welches Automations-Tool brauchst du wirklich?","Bevor du n8n installierst: Diese Entscheidung spart dir Arbeit"],
    recommendedTitle:"Welches Automations-Tool brauchst du wirklich?",
    hook:"Die falsche Frage lautet: Welches Tool ist das beste? Die richtige lautet: Welche Art von Arbeit möchtest du automatisieren?",
    example:"Eine Formularanfrage wird CRM-Eintrag, Klassifizierung, Entwurf und Freigabe.",
    result:"Entscheidung anhand Prozessdeterminismus, Integrationen, Datenweg, Human Gate und Wartungsaufwand.",
    scenes:["3-Spalten-Vergleich","Beispielworkflow","Entscheidungsbaum","Kosten-vs-Wartung-Matrix"],
    thumbnailText:"WELCHES TOOL?",cta:"Toolvergleich im Automations-Check dokumentieren.",
    sources:[AUTOMATIONSKLAR_SOURCES.n8nAffiliate,AUTOMATIONSKLAR_SOURCES.makeAffiliate],
  },
  {
    id:"yt-003",audience:"Betriebe mit wiederkehrenden Kundenanfragen",problem:"Anfragen kosten Zeit, vollautomatisches Antworten wäre aber riskant.",
    titleVariants:["Kundenanfragen mit KI automatisieren – ohne Kontrollverlust","Diesen Büroprozess würde ich als Erstes automatisieren","E-Mail rein → Antwort vorbereitet: sicherer KI-Workflow"],
    recommendedTitle:"Kundenanfragen mit KI automatisieren – ohne Kontrollverlust",
    hook:"Eine Kundenanfrage kommt herein. Minuten später ist sie strukturiert und ein Entwurf liegt bereit – aber nichts wurde ungeprüft versendet.",
    example:"Fiktive Designagentur, achtseitige Website-Anfrage, fehlende Angaben werden markiert statt erfunden.",
    result:"Bearbeitungszeit, Korrekturquote, Fehlerquote und manuelle Übernahmen werden vor/nach Einführung gemessen.",
    scenes:["Demo-Inbox","strukturierte Felder","Klassifikation","Antwortentwurf","großes FREIGABE-Gate","Fehlerfall-Test"],
    thumbnailText:"ERST PRÜFEN",cta:"Mit Demo-Daten testen und den Automations-Check verwenden.",
    sources:[],
  },
];

export function buildVideoPackage(seed:VideoSeed){
  return {
    ...seed,
    structure:[
      {section:"Hook",goal:"Problem und Nutzen in den ersten Sekunden verständlich machen."},
      {section:"Kontext",goal:"Grenzen und Ausgangslage definieren."},
      {section:"Praxis",goal:seed.example},
      {section:"Test",goal:"Fehlerfälle und Human-in-the-loop sichtbar machen."},
      {section:"Ergebnis",goal:seed.result},
      {section:"CTA",goal:seed.cta},
    ],
    chapters:["00:00 Problem","00:30 Ausgangslage","01:30 Aufbau","04:30 Test","06:30 Ergebnis","07:30 Nächster Schritt"],
    disclosures:buildDisclosureChecklist({affiliate:false,sponsored:false,realisticSynthetic:false}),
  };
}

/** Sprint 476 — derivative shorts must have their own hook and platform treatment. */
const SHORT_HOOKS=[
  "Automatisiere niemals zuerst Entscheidungen.",
  "Diese 4 Zahlen entscheiden, ob sich Automation lohnt.",
  "Der gefährlichste Workflow-Schritt heißt nicht KI – sondern SENDEN.",
  "Eine Aufgabe fünfmal täglich? Rechne das einmal aus.",
  "n8n oder Make? Stell zuerst diese Frage.",
  "Self-Hosting löst nicht automatisch dein Datenschutzproblem.",
  "Ein Agent und ein Workflow sind nicht dasselbe.",
  "Kostenlos kann die teuerste Automation sein.",
  "So verhinderst du erfundene Preise im KI-Entwurf.",
  "Warum KI nicht selbstständig Rabatte zusagen sollte.",
  "Dieser Freigabe-Schritt macht den Workflow belastbarer.",
  "Miss bei Automation niemals nur Zeitersparnis.",
];
export function buildShortPlan(){
  return SHORT_HOOKS.map((hook,index)=>({
    id:`short-${String(index+1).padStart(2,"0")}`,
    sourceVideo:STARTER_VIDEOS[index<4?0:index<8?1:2].id,
    hook,
    youtubeShort:{durationSeconds:40,style:"kompakte Erklärung + sichtbare Prozessgrafik",cta:"Longform/Check"},
    instagramReel:{durationSeconds:32,style:"größere Typografie + speicherbare Checkliste",cta:"Speichern/Check"},
    tiktok:{durationSeconds:28,style:"direkter Mythos-vs-Praxis-Einstieg + schneller Demo-Cut",cta:"Kommentar/Longform"},
    duplicateUpload:false,
  }));
}

/** Sprint 477 — current partner-program facts are candidates until account approval is confirmed. */
export const AFFILIATE_CANDIDATES=[
  {key:"n8n",status:"candidate-not-partner",commission:"30% of n8n Cloud referrals for 12 months",verificationUrl:AUTOMATIONSKLAR_SOURCES.n8nAffiliate,requirements:["apply and be approved","no paid ad campaigns using affiliate links","payout balance threshold applies"]},
  {key:"make",status:"candidate-not-partner",commission:"35% of subscription payments for 12 months",verificationUrl:AUTOMATIONSKLAR_SOURCES.makeAffiliate,requirements:["affiliate account/link required","minimum payout threshold","three unique paying users for payout"]},
] as const;

export function buildDisclosureChecklist(input:{affiliate:boolean;sponsored:boolean;realisticSynthetic:boolean}){
  return {
    affiliate:input.affiliate?["Affiliate-Beziehung unmittelbar am Link klar kennzeichnen.","Keine Partnerschaft behaupten, solange Account/Programmstatus nicht bestätigt ist."]:[],
    sponsored:input.sponsored?["Werbung/Produktplatzierung klar kennzeichnen.","Plattform-Paid-Promotion-Schalter setzen, wenn erforderlich."]:[],
    ai:input.realisticSynthetic?["Realistisch wirkende synthetische oder wesentlich veränderte Inhalte im Upload-Flow offenlegen."]:["KI-Unterstützung intern dokumentieren; Plattformlabel nur setzen, wenn die aktuelle Regel es für den konkreten Inhalt verlangt."],
    asset:["Quelle, Urheber, Lizenz, kommerzielle Nutzung und Beleg je Asset dokumentieren."],
    externalGate:true,
  };
}

/** Sprint 478 — deterministic 30-day calendar with realistic load. */
export function build30DayPlan(start=new Date("2026-10-29T09:00:00.000Z")){
  const days=Array.from({length:30},(_,i)=>{
    const date=new Date(start.getTime()+i*86_400_000);
    const week=Math.floor(i/7)+1;
    const tasks:string[]=[];
    if(i===0) tasks.push("Marken-/Handle-/Domainprüfung vorbereiten","Lead-Magnet finalisieren","Analytics-Baseline definieren");
    if([3,10,17].includes(i)) tasks.push(`Longform ${[3,10,17].indexOf(i)+1}: finaler QA-Check`);
    if([4,11,18].includes(i)) tasks.push(`Longform ${[4,11,18].indexOf(i)+1}: veröffentlichungsfertig zur Freigabe stellen`);
    if([5,6,12,13,19,20].includes(i)) tasks.push("1-2 plattformspezifische Shorts vorbereiten");
    if([7,14,21,28].includes(i)) tasks.push("Wochenmetriken auswerten und nur datenbegründete Änderung planen");
    if(i===24) tasks.push("Keine vierte Longform erzwingen: Packaging/Retention/Funnel analysieren");
    if(i===29) tasks.push("30-Tage-Review und nächste drei Longforms aus Evidenz priorisieren");
    return {day:i+1,date:date.toISOString().slice(0,10),week,tasks};
  });
  return {days,longforms:3,shorts:12,targetHoursPerWeek:"12-16",rule:"Qualität und Messbarkeit vor Veröffentlichungsmenge"};
}

/** Sprint 479 — production QA blocks thin AI mass content and missing evidence. */
export function auditContentQuality(input:{scriptWords:number;originalExample:boolean;sourceCount:number;hasHumanGate:boolean;assetLicensesDocumented:boolean;claimsVerified:boolean;ctaMatchesProblem:boolean}){
  const checks=[
    {key:"substance",ok:input.scriptWords>=700,detail:"Longform braucht genügend eigenständige Substanz."},
    {key:"original-example",ok:input.originalExample,detail:"Mindestens ein eigenes konkretes Beispiel."},
    {key:"sources",ok:input.sourceCount>=1,detail:"Überprüfbare externe Behauptungen brauchen Quellen."},
    {key:"human-gate",ok:input.hasHumanGate,detail:"Riskante externe Aktionen brauchen sichtbare Freigabe."},
    {key:"assets",ok:input.assetLicensesDocumented,detail:"Asset-Herkunft/Lizenz dokumentieren."},
    {key:"claims",ok:input.claimsVerified,detail:"Keine erfundenen Reichweiten, Einnahmen oder Produkteigenschaften."},
    {key:"cta-fit",ok:input.ctaMatchesProblem,detail:"CTA muss den Zuschauer-Nutzen fortsetzen."},
  ];
  return {passed:checks.every(c=>c.ok),score:Math.round(checks.filter(c=>c.ok).length/checks.length*100),checks};
}

/** Sprint 480 — scenario model: assumptions remain explicit, confirmed revenue stays separate. */
export function revenueScenario(input:{monthlyLongformViews:number;ctaClickPct:number;landingConversionPct:number;affiliateClicksPerLead:number;paidConversionPct:number;assumedAffiliateValueCents:number;digitalProductBuyerPct:number;digitalProductPriceCents:number;yppRpmCents?:number|null;yppEligible:boolean}){
  const leads=input.monthlyLongformViews*(input.ctaClickPct/100)*(input.landingConversionPct/100);
  const affiliateClicks=leads*Math.max(0,input.affiliateClicksPerLead);
  const affiliateBuyers=affiliateClicks*(input.paidConversionPct/100);
  const affiliateCents=affiliateBuyers*Math.max(0,input.assumedAffiliateValueCents);
  const productCents=leads*(input.digitalProductBuyerPct/100)*Math.max(0,input.digitalProductPriceCents);
  const yppCents=input.yppEligible&&input.yppRpmCents!=null?input.monthlyLongformViews/1000*Math.max(0,input.yppRpmCents):0;
  return {leads:round(leads,1),affiliateClicks:round(affiliateClicks,1),affiliateBuyers:round(affiliateBuyers,1),modeledAffiliateCents:Math.round(affiliateCents),modeledProductCents:Math.round(productCents),modeledYppCents:Math.round(yppCents),modeledTotalCents:Math.round(affiliateCents+productCents+yppCents),guarantee:false,assumptionsOnly:true};
}

/** Sprint 481 — weekly learning chooses one bottleneck, avoiding premature multi-variable optimization. */
export function decideWeeklyOptimization(current:WeeklyChannelMetrics, history:WeeklyChannelMetrics[]=[]){
  const notes:string[]=[];
  const median=(values:number[])=>{const v=[...values].sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
  const ctrMedian=median(history.map(x=>x.ctrPct).filter((x):x is number=>x!=null));
  const retention=current.averageViewSeconds!=null&&current.averageVideoSeconds?current.averageViewSeconds/current.averageVideoSeconds*100:null;
  const clickRate=current.views?current.qualifiedClicks/current.views*100:null;
  const signupRate=current.qualifiedClicks?current.emailSignups/current.qualifiedClicks*100:null;
  let action:"LEARN"|"PACKAGING"|"HOOK"|"CTA"|"LANDING"|"DOUBLE_DOWN"="LEARN";
  if(current.impressions<1000) notes.push("Noch keine belastbare Packaging-Entscheidung: unter 1.000 Impressionen.");
  else if(current.ctrPct!=null&&ctrMedian!=null&&current.ctrPct<ctrMedian*0.8){action="PACKAGING";notes.push("CTR liegt deutlich unter dem eigenen historischen Median.");}
  else if(retention!=null&&retention<35){action="HOOK";notes.push("Durchschnittliche Zuschauerbindung ist schwach; Einstieg/Struktur zuerst testen.");}
  else if(clickRate!=null&&clickRate<1){action="CTA";notes.push("Watch-Verhalten ist brauchbarer als der qualifizierte Klickpfad.");}
  else if(signupRate!=null&&current.qualifiedClicks>=20&&signupRate<20){action="LANDING";notes.push("Genügend Klick-Evidenz, aber schwache Lead-Conversion.");}
  else if(current.emailSignups>=10){action="DOUBLE_DOWN";notes.push("Thema erzeugt messbaren Intent; verwandtes Problem testen.");}
  return {action,retentionPct:retention==null?null:round(retention,1),qualifiedClickRatePct:clickRate==null?null:round(clickRate,2),signupRatePct:signupRate==null?null:round(signupRate,2),ctrMedianPct:ctrMedian==null?null:round(ctrMedian,2),notes,changeOneVariable:true};
}

export function launchReadiness(){
  const niches=scoreNiches();
  return {
    recommendedNiche:niches[0],
    brand:FACELESS_CHANNEL_BRAND,
    leadMagnet:LEAD_MAGNET,
    starterVideos:STARTER_VIDEOS.map(buildVideoPackage),
    shorts:buildShortPlan(),
    calendar:build30DayPlan(),
    affiliates:AFFILIATE_CANDIDATES,
    platformRules:{
      youtubeYpp:{current:"1,000 subscribers + 4,000 qualified long-form watch hours / 12 months OR 10M qualified Shorts views / 90 days for ads/Premium",from2027_02_01:"new applicants: 1,000 subscribers + 8,000 qualified watch hours / 365 days OR 20M qualified Shorts views / 90 days",source:AUTOMATIONSKLAR_SOURCES.youtubeYpp},
      realisticAiDisclosure:{required:true,source:AUTOMATIONSKLAR_SOURCES.youtubeAiDisclosure},
    },
    externalActionsRequireApproval:true,
  };
}
