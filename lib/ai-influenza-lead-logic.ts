export type AiInfluenzaContactBasis="customer-requested"|"existing-customer"|"consent"|"legitimate-interest-review"|"unknown"|"opted-out";
export type AiInfluenzaLeadSignals={
  automationPain:number;
  contentNeed:number;
  budgetSignal:number;
  engagement:number;
  strategicFit:number;
};
const clamp=(n:number)=>Math.max(0,Math.min(100,Number.isFinite(n)?n:0));

export function scoreAiInfluenzaLead(signals:AiInfluenzaLeadSignals){
  const score=Math.round(
    clamp(signals.automationPain)*.25+
    clamp(signals.contentNeed)*.2+
    clamp(signals.budgetSignal)*.25+
    clamp(signals.engagement)*.15+
    clamp(signals.strategicFit)*.15
  );
  const tier=score>=75?"hot":score>=55?"warm":score>=35?"nurture":"low";
  return {score,tier};
}

export function evaluateAiInfluenzaContactPolicy(args:{
  basis:AiInfluenzaContactBasis;
  publicSourceUrl:string;
  optedOut:boolean;
}){
  if(args.optedOut||args.basis==="opted-out")return {mayPrepare:false,maySend:false,reason:"Opt-out: keine Kontaktaktion zulässig."};
  if(!/^https:\/\//i.test(args.publicSourceUrl.trim()))return {mayPrepare:false,maySend:false,reason:"Nachvollziehbare öffentliche HTTPS-Quelle fehlt."};
  if(args.basis==="unknown")return {mayPrepare:true,maySend:false,reason:"Nur interne Qualifizierung erlaubt; Rechtsgrundlage vor Kontakt prüfen."};
  if(args.basis==="legitimate-interest-review")return {mayPrepare:true,maySend:false,reason:"Kontaktentwurf erlaubt; berechtigtes Interesse und nationale Werberegeln müssen vor Versand geprüft werden."};
  return {mayPrepare:true,maySend:false,reason:"Kontaktentwurf möglich; externer Versand bleibt im bestehenden Freigabe-/Policy-Gate."};
}

export function aiInfluenzaLeadNodeKey(domain:string){
  const normalized=domain.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
  if(!normalized||!normalized.includes("."))throw new Error("Gültige Unternehmensdomain erforderlich.");
  return `ai-influenza-lead:${normalized}`;
}
