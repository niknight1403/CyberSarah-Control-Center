export type RevenueWebhookChannel="stripe"|"digistore24";
export type RevenueWebhookRuntime={
  channel:RevenueWebhookChannel;
  received:number;
  succeeded:number;
  failed:number;
  consecutiveFailures:number;
  lastReceivedAt:string|null;
  lastSuccessAt:string|null;
  lastFailureAt:string|null;
  lastEventType:string|null;
  lastFailureKind:string|null;
};

const initial=(channel:RevenueWebhookChannel):RevenueWebhookRuntime=>({
  channel,received:0,succeeded:0,failed:0,consecutiveFailures:0,
  lastReceivedAt:null,lastSuccessAt:null,lastFailureAt:null,
  lastEventType:null,lastFailureKind:null,
});
const state:Record<RevenueWebhookChannel,RevenueWebhookRuntime>={
  stripe:initial("stripe"),digistore24:initial("digistore24"),
};

export function markRevenueWebhookSuccess(channel:RevenueWebhookChannel,eventType:string){
  const now=new Date().toISOString(),s=state[channel];
  s.received+=1;s.succeeded+=1;s.consecutiveFailures=0;
  s.lastReceivedAt=now;s.lastSuccessAt=now;s.lastEventType=eventType.slice(0,80);s.lastFailureKind=null;
}
export function markRevenueWebhookFailure(channel:RevenueWebhookChannel,kind:string,eventType?:string){
  const now=new Date().toISOString(),s=state[channel];
  s.received+=1;s.failed+=1;s.consecutiveFailures+=1;
  s.lastReceivedAt=now;s.lastFailureAt=now;s.lastFailureKind=kind.slice(0,80);
  if(eventType)s.lastEventType=eventType.slice(0,80);
}
export function getRevenueWebhookRuntimeStatus(){
  return {stripe:{...state.stripe},digistore24:{...state.digistore24}};
}
export function resetRevenueWebhookRuntimeForTests(){
  state.stripe=initial("stripe");state.digistore24=initial("digistore24");
}
