export type CircuitState="CLOSED"|"OPEN"|"HALF_OPEN";
export type ProviderCircuit={source:string;state:CircuitState;failures:number;successes:number;openedAt:number|null;lastLatencyMs:number|null;lastStatus:number|null};
const circuits=new Map<string,ProviderCircuit>();
export const CIRCUIT_FAILURE_THRESHOLD=3;
export const CIRCUIT_OPEN_MS=120_000;
const get=(source:string):ProviderCircuit=>circuits.get(source)??{source,state:"CLOSED",failures:0,successes:0,openedAt:null,lastLatencyMs:null,lastStatus:null};

export function providerCircuitAllows(source:string,now=Date.now()):boolean{
  const current=get(source);
  if(current.state==="OPEN"&&current.openedAt!==null&&now-current.openedAt>=CIRCUIT_OPEN_MS){
    circuits.set(source,{...current,state:"HALF_OPEN"});return true;
  }
  return current.state!=="OPEN";
}
export function recordProviderCircuitSuccess(source:string,latencyMs:number){
  const current=get(source);circuits.set(source,{...current,state:"CLOSED",failures:0,successes:current.successes+1,openedAt:null,lastLatencyMs:Math.max(0,latencyMs),lastStatus:200});
}
export function recordProviderCircuitFailure(source:string,status:number|null,latencyMs:number,now=Date.now()){
  const current=get(source);const failures=current.failures+1;
  const hard=status===401||status===402||status===403;
  const open=hard||failures>=CIRCUIT_FAILURE_THRESHOLD;
  circuits.set(source,{...current,state:open?"OPEN":current.state,failures,openedAt:open?now:current.openedAt,lastLatencyMs:Math.max(0,latencyMs),lastStatus:status});
}
export function providerCircuitSnapshot(now=Date.now()):ProviderCircuit[]{
  for(const source of circuits.keys())providerCircuitAllows(source,now);
  return [...circuits.values()].sort((a,b)=>a.source.localeCompare(b.source));
}
export function resetProviderCircuits(){circuits.clear();}
