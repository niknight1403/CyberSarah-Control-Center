export type PipelineStage="SCRIPT"|"VOICE"|"VISUALS"|"EDIT";
export type PipelineStandardization={script:number;voice:number;visuals:number;edit:number;qualityScore:number;publishedProofs:number;reuseRisk:number};
export type PortfolioChannel={key:string;name:string;niche:string;audience:string;primaryPlatform:string;adjacentTo?:string;status:"PROOF"|"LOCKED"|"READY";identity:{voice:string;visual:string;editorial:string};monetization:string[]};
const clamp=(n:number)=>Math.min(100,Math.max(0,Number.isFinite(n)?n:0));
const round=(n:number,d=1)=>Number(n.toFixed(d));

export const FACELESS_PORTFOLIO:PortfolioChannel[]=[
 {key:"automationsklar",name:"Automationsklar",niche:"KI-Software, Automatisierung und B2B-Workflows für DACH-KMU",audience:"Solo-Selbstständige, Agenturen, Beratungen und kleine Teams",primaryPlatform:"YouTube",status:"PROOF",identity:{voice:"ruhig, präzise, kritisch; keine Hype-Sprache",visual:"Navy/Mint, reale Screen-Demos, Workflow-Nodes, Vorher/Nachher-Messung",editorial:"Problem → Demo → Fehlerfall → Human Gate → messbares Ergebnis"},monetization:["qualifizierte Affiliate-Empfehlungen","eigene Workflow-Templates","Lead-Generierung für B2B-Angebote","Sponsoring nach belegter Reichweite","Ad-Revenue nur als Zusatz"]},
 {key:"toolklar",name:"ToolKlar",niche:"ROI-orientierte KI- und SaaS-Tooltests für kleine Unternehmen",audience:"Kaufbereite Entscheider in kleinen und mittleren Unternehmen",primaryPlatform:"YouTube",adjacentTo:"automationsklar",status:"LOCKED",identity:{voice:"analytisch, vergleichend, zahlenorientiert",visual:"Graphit/Amber, Scorecards, Preis-/Zeit-Matrizen, Testprotokolle",editorial:"Use Case → Testkriterien → Messung → Kosten/Risiko → Entscheidung"},monetization:["Affiliate nur bei bestätigter Partnerschaft","B2B-Leads","Vergleichs-Templates","Sponsoring mit Kennzeichnung","Ad-Revenue als Zusatz"]},
];

export function pipelineStandardization(input:PipelineStandardization){
 const stages={SCRIPT:clamp(input.script),VOICE:clamp(input.voice),VISUALS:clamp(input.visuals),EDIT:clamp(input.edit)};
 const score=round((stages.SCRIPT+stages.VOICE+stages.VISUALS+stages.EDIT)/4);
 const weakest=(Object.entries(stages) as [PipelineStage,number][]).sort((a,b)=>a[1]-b[1])[0];
 const channel2Ready=score>=80&&clamp(input.qualityScore)>=85&&input.publishedProofs>=3&&clamp(input.reuseRisk)<=20;
 return {stages,score,threshold:80,weakestStage:weakest[0],weakestScore:weakest[1],channel2Ready,blockers:[
  ...(score<80?["Pipeline-Standardisierung "+score+"% < 80%"]:[]),
  ...(input.qualityScore<85?["Qualität "+round(clamp(input.qualityScore))+"% < 85%"]:[]),
  ...(input.publishedProofs<3?["Nur "+Math.max(0,input.publishedProofs)+" veröffentlichte Proofs; mindestens 3 nötig"]:[]),
  ...(input.reuseRisk>20?["Reused-Content-Risiko "+round(clamp(input.reuseRisk))+"% > 20%"]:[]),
 ]};
}

export const PROMPT_CHAIN=[
 {stage:"RESEARCH",input:"Thema + Zielgruppe + gewünschte Entscheidung",output:"Quellenliste, Nutzerproblem, Gegenargumente, messbare Claims",guardrail:"Keine unbelegten Markt-/Umsatzzahlen."},
 {stage:"SCRIPT",input:"Research Packet",output:"Hook, Kontext, Demo, Fehlerfall, Ergebnis, CTA",guardrail:"Eigene Erklärung/Beispiele statt paraphrasierter Massenware."},
 {stage:"VOICE",input:"freigegebenes Skript",output:"Voice-Cues mit Pausen, Betonung, Aussprachemarkern",guardrail:"Keine Imitation realer Personen; konsistente Kanalstimme."},
 {stage:"VISUALS",input:"Skript + Shotlist",output:"Screen-Captures, Diagramme, B-Roll-Slots, Textkarten",guardrail:"Lizenz/Herkunft je Asset; keine fremden Clips als Füllmaterial."},
 {stage:"EDIT",input:"Voice + Visual Manifest",output:"plattformgerechter Schnittplan",guardrail:"Jede Plattform bekommt eigene Hook-/Pacing-/Caption-Fassung."},
 {stage:"QA",input:"fertiger Cut + Quellen + Asset-Manifest",output:"Pass/Block + konkrete Korrekturen",guardrail:"Claims, Lizenzen, Disclosure, Reuse und CTA-Fit müssen grün sein."},
] as const;

export const EDIT_TEMPLATES={
 premiere:{name:"Automationsklar Longform v1",fps:30,canvas:"3840x2160",tracks:["V1 screen/demo","V2 diagrams/callouts","V3 captions","A1 narration","A2 licensed music","A3 SFX"],markers:["HOOK","CONTEXT","DEMO","FAILURE_CASE","RESULT","CTA"],rules:["J-Cuts für Narration","Zoom nur zur Informationsführung","maximal eine CTA pro Segment","Quellenkarte bei externen Fakten"]},
 capcut:{name:"Automationsklar Vertical v1",fps:30,canvas:"1080x1920",tracks:["screen crop","native captions","callout","voice","licensed music"],rules:["0-2s eigenständiger Hook","Captions safe-area","kein Watermark-Reupload","plattformbezogener CTA","visueller Wechsel nur bei Informationsgewinn"]},
} as const;

export const SOUND_LIBRARY_POLICY={
 allowed:["eigene Aufnahmen","explizit kommerziell lizenzierte Musik/SFX","plattforminterne Sounds bei erlaubter kommerzieller Nutzung"],
 manifestFields:["assetId","source","license","commercialUse","proofLocation","platformRestrictions","expiry"],
 blocked:["unbekannte Lizenz","aus fremden Videos extrahierte Musik","Copyright-Claim-Risiko ohne Beleg"],
 rule:"Kein Audio-Asset wird publish-ready, bevor Lizenz und Plattformrestriktionen dokumentiert sind.",
} as const;

export type IdentityFingerprint={channelKey:string;hookPattern:string;voiceStyle:string;visualGrammar:string;ctaStyle:string;exampleDomain:string};
const tokens=(s:string)=>new Set(s.toLowerCase().split(/[^a-z0-9äöüß]+/).filter(x=>x.length>2));
const similarity=(a:string,b:string)=>{const A=tokens(a),B=tokens(b);if(!A.size&&!B.size)return 0;const both=[...A].filter(x=>B.has(x)).length;return both/Math.max(1,new Set([...A,...B]).size)*100;};
export function auditCrossChannelReuse(a:IdentityFingerprint,b:IdentityFingerprint){
 const fields:Array<[keyof Omit<IdentityFingerprint,"channelKey">,number]>=[["hookPattern",0.25],["voiceStyle",0.2],["visualGrammar",0.25],["ctaStyle",0.15],["exampleDomain",0.15]];
 const score=round(fields.reduce((s,[key,w])=>s+similarity(a[key],b[key])*w,0));
 return {similarityPct:score,risk:score>=60?"HIGH":score>=35?"MEDIUM":"LOW",passed:score<35,requiredChanges:score<35?[]:["Hook-Muster neu entwickeln","eigene visuelle Grammatik erzwingen","Beispiele/CTA nicht kanalübergreifend kopieren"],rule:"Ideen/Research dürfen geteilt werden; finaler Hook, Voice, Visual Grammar, Beispiele und Schnitt müssen kanalidentitätsspezifisch sein."};
}

export type ChannelEconomics={key:string;qualifiedViews:number;leads:number;confirmedRevenueCents:number;variableCostCents:number;productionHours:number;qualityScore:number;reuseRisk:number};
export function rankChannelPortfolio(rows:ChannelEconomics[]){
 return rows.map(row=>{
  const net=row.confirmedRevenueCents-row.variableCostCents;
  const revenuePer1k=row.qualifiedViews>0?row.confirmedRevenueCents/row.qualifiedViews*1000:0;
  const revenuePerHour=row.productionHours>0?net/row.productionHours:0;
  const leadRate=row.qualifiedViews>0?row.leads/row.qualifiedViews*100:0;
  const confidence=Math.min(1,row.qualifiedViews/5000*0.45+row.leads/50*0.3+(row.confirmedRevenueCents>0?0.25:0));
  const qualityFactor=clamp(row.qualityScore)/100,reusePenalty=1-clamp(row.reuseRisk)/100*0.6;
  const score=Math.max(0,(revenuePer1k*0.45+revenuePerHour*0.35+leadRate*100*0.2)*confidence*qualityFactor*reusePenalty);
  return {...row,netRevenueCents:net,revenuePer1kViewsCents:round(revenuePer1k),netRevenuePerHourCents:round(revenuePerHour),leadRatePct:round(leadRate,2),confidence:round(confidence,2),score:round(score,2)};
 }).sort((a,b)=>b.score-a.score);
}

export function buildProductionTemplatePack(){
 return {version:"1.0",proofChannel:"automationsklar",expansionGate:"Channel #2 bleibt gesperrt, bis Script → Voice → Visuals → Schnitt >=80% standardisiert, Qualität >=85%, mindestens 3 veröffentlichte Proofs und Reuse-Risiko <=20% sind.",promptChain:PROMPT_CHAIN,editTemplates:EDIT_TEMPLATES,soundLibrary:SOUND_LIBRARY_POLICY,assetManifest:["assetId","type","source","license","commercialUse","channelKey","platformRestrictions","proofLocation"],reusableModules:["Research Packet","Claim Ledger","Hook Matrix","Shotlist","Voice Cue Sheet","Asset Manifest","Edit Decision List","QA Report","Revenue Attribution Tags"],nonReusableFinals:["finaler Hook","finales Voiceover","finale Thumbnail-Komposition","finale Beispiele","finaler Plattform-Cut"]};
}

export function multiChannelStrategy(input:PipelineStandardization){
 const readiness=pipelineStandardization(input);
 return {channelPortfolio:FACELESS_PORTFOLIO.map(c=>c.key==="toolklar"?{...c,status:readiness.channel2Ready?"READY" as const:"LOCKED" as const}:c),productionPipeline:buildProductionTemplatePack(),monetizationMatrix:FACELESS_PORTFOLIO.map(c=>({channel:c.name,sources:c.monetization,truthRule:"Nur bestätigte Einnahmen als realen Umsatz ausweisen."})),riskManagement:{reusedContent:"Cross-Channel-Fingerprint muss LOW sein; finale Assets werden nicht 1:1 repliziert.",platform:"Plattformregeln/Disclosures werden vor Publish erneut geprüft.",quality:"Masse-Output darf QA und 80%-Proof-Gate nicht umgehen.",revenue:"CPM/Affiliate-Erträge sind Modelle bis echte Attribution vorliegt."},readiness};
}
