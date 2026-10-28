/** @param {any} error */
export function isDrizzleSchemaPermissionError(error){
  const e=/** @type {any} */(error instanceof Error?error:new Error(String(error)));
  const cause=/** @type {any} */(e.cause&&typeof e.cause==="object"?e.cause:null);
  const code=String(cause?.code??e.code??"");
  if(code!=="42501")return false;
  if(String(cause?.schema??e.schema??"").toLowerCase()==="drizzle")return true;
  const message=(String(cause?.message??"")+" "+String(e.message??"")).toLowerCase();
  return /permission denied for schema\s+"?drizzle"?/i.test(message)||message.includes('"drizzle"."__drizzle_migrations"');
}
