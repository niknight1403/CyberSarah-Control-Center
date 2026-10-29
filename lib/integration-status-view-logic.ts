export type IntegrationCardHealth = "healthy" | "degraded" | "offline";

export function classifyIntegrationCardHealth(input:{
  llmHealthy:number;
  routeHealthy:number;
  routeConfigured:number;
  queueFailed:number;
}):{state:IntegrationCardHealth;label:string}{
  const llmHealthy=Math.max(0,input.llmHealthy);
  const routeHealthy=Math.max(0,input.routeHealthy);
  const routeConfigured=Math.max(0,input.routeConfigured);
  const queueFailed=Math.max(0,input.queueFailed);
  if(llmHealthy===0 || (routeConfigured>0 && routeHealthy===0)){
    return {state:"offline",label:"KI-Routing gestört"};
  }
  if(queueFailed>0 || (routeConfigured>0 && routeHealthy<routeConfigured)){
    return {state:"degraded",label:"Teilweise beeinträchtigt"};
  }
  return {state:"healthy",label:"Autonomie bereit"};
}
