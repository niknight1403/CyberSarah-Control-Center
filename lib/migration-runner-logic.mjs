/** @param {any[]} rows */
export function latestMigrationMillis(rows=[]){
  return rows.reduce((max,row)=>{
    const value=Number(row?.created_at??0);
    return Number.isFinite(value)&&value>max?value:max;
  },0);
}

/** @param {any[]} migrations @param {any[]} rows */
export function pendingMigrationMeta(migrations=[],rows=[]){
  const last=latestMigrationMillis(rows);
  return migrations.filter(m=>Number(m?.folderMillis??0)>last);
}

/** @param {{publicRows?: any[], legacyRows?: any[]}} input */
export function migrationJournalMode({publicRows=[],legacyRows=[]}={}){
  if(publicRows.length>0)return {mode:"public",bootstrap:false};
  if(legacyRows.length>0)return {mode:"legacy-bootstrap",bootstrap:true};
  return {mode:"uninitialized",bootstrap:false};
}

/** @param {any} statement */
export function sanitizeMigrationStatement(statement){
  return typeof statement==="string"?statement.trim():"";
}
