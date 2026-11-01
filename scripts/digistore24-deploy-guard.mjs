#!/usr/bin/env node
/**
 * Read-only Digistore24 deployment gate. No keys/response bodies in logs.
 * Valid = listCommissions succeeded. Invalid key = quarantine.
 * Network/provider uncertainty = block deploy to preserve existing Render ENV.
 */
import { appendFileSync } from "node:fs";

const apiKey=process.env.D24_API_KEY?.trim() ?? "";
const ipnSecret=process.env.D24_IPN_SECRET?.trim() ?? "";
const affiliateId=process.env.D24_AFFILIATE_ID?.trim() ?? "";
const envFile=process.env.GITHUB_ENV;

function appendEnv(name,value) {
  if (!value) return;
  if (/[\r\n]/.test(value) || !envFile) throw new Error("D24_INVALID_SECRET_FORMAT");
  appendFileSync(envFile, name+"="+value+"\n", {encoding:"utf8",mode:0o600});
}
function emitOptional() {
  appendEnv("DIGISTORE24_IPN_SECRET",ipnSecret);
  appendEnv("DIGISTORE24_AFFILIATE_ID",affiliateId);
}
async function main() {
  if (!apiKey) { console.log("D24_API=NOT_CONFIGURED"); emitOptional(); return; }
  if (/[\r\n]/.test(apiKey)) throw new Error("D24_INVALID_SECRET_FORMAT");
  const url=new URL("https://www.digistore24.com/api/call/listCommissions");
  for(const [k,v] of Object.entries({
    from:"-1d",to:"now",page_no:"1",page_size:"1",transaction_type:"payment"
  })) url.searchParams.set(k,v);
  let response;
  try {
    response=await fetch(url,{headers:{"X-DS-API-KEY":apiKey,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  } catch {
    throw new Error("D24_PROBE_UNAVAILABLE");
  }
  let body;
  try { body=await response.json(); } catch { throw new Error("D24_PROBE_NON_JSON"); }
  if(response.ok && body?.result==="success") {
    appendEnv("DIGISTORE24_API_KEY",apiKey);
    console.log("D24_API=READY");
    emitOptional();
    return;
  }
  if([401,403].includes(response.status) || Number(body?.code)===2) {
    console.log("D24_API=INVALID_KEY_QUARANTINED");
    emitOptional();
    return;
  }
  throw new Error("D24_PROBE_UNCERTAIN_HTTP_"+response.status);
}
main().catch(error=>{
  console.error(error instanceof Error ? error.message : "D24_PROBE_ERROR");
  process.exitCode=1;
});
