export function resolveMigrationPgConfig(connectionString){
  const raw=String(connectionString??"").trim();
  const url=new URL(raw);
  const mode=(url.searchParams.get("sslmode")??"").toLowerCase();
  url.searchParams.delete("sslmode");
  let ssl=false;
  if(mode==="require"||mode==="prefer") ssl={rejectUnauthorized:false};
  else if(mode&&mode!=="disable") ssl={rejectUnauthorized:true};
  return {connectionString:url.toString().replace(/\?$/,""),ssl};
}

export function migrationConnectionString(connectionString){
  const raw=String(connectionString??"").trim();
  const url=new URL(raw);
  const mode=(url.searchParams.get("sslmode")??"").toLowerCase();
  // pg-connection-string supports no-verify and maps it to TLS with
  // rejectUnauthorized=false, matching the runtime DB adapter's semantics.
  if(mode==="require"||mode==="prefer") url.searchParams.set("sslmode","no-verify");
  return url.toString();
}
