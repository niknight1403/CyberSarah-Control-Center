/**
 * Render Villa Ops — Agenten-Villa-Render-Service per API lesen/konfigurieren.
 * Nutzt den im CCC-Repo hinterlegten RENDER_API_KEY (Owner-Konto).
 *
 * OP=read        : Services listen + Env-Vars des Villa-Services anzeigen
 * OP=set-env     : AGENTEN_VILLA_*-Werte als Env-Vars setzen + Deploy triggern
 * OP=deploy      : Nur einen Deploy triggern (kein Env-Write) — fuer saubere
 *                  Env-Snapshot-Tests und als Anschub nach Env-Aenderungen
 *                  (SERVICE_ID via Umgebungsvariable)
 */
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const OP = process.env.OP;
const SERVICE_ID = process.env.SERVICE_ID;

if (!KEY) { console.error("[villa-ops] RENDER_API_KEY fehlt"); process.exit(1); }

async function render(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* Rohtext */ }
  return { status: res.status, ok: res.ok, data, text };
}

function mask(value) {
  if (value === null || value === undefined) return "(generated/unsichtbar)";
  const s = String(value);
  if (s.length === 0) return "(leer)";
  return s.length > 12 ? `${s.slice(0, 6)}...[${s.length} Zeichen]` : s;
}

async function findVillaServiceId() {
  const { ok, data } = await render("/services?limit=50");
  if (!ok) throw new Error(`Service-Liste abrufbar? HTTP-Fehler`);
  for (const item of data || []) {
    const s = item.service ?? item;
    if ((s.name ?? "").toLowerCase().includes("villa")) return s;
  }
  return null;
}

async function deployOps() {
  if (!SERVICE_ID) { console.error("[villa-ops] SERVICE_ID fehlt fuer deploy"); process.exit(1); }
  const dep = await render(`/services/${SERVICE_ID}/deploys`, { method: "POST", body: JSON.stringify({}) });
  const bodyText = dep.text ?? "";
  console.log(`[villa-ops] Deploy -> HTTP ${dep.status}: ${bodyText.slice(0, 120)}`);
}

async function readOps() {
  const service = await findVillaServiceId();
  if (!service) { console.log("[villa-ops] Kein Villa-Service gefunden."); return; }
  console.log(`[villa-ops] SERVICE: ${service.id} | ${service.name} | ${service.type} | suspended=${service.suspended}`);
  const { ok, data, status, text } = await render(`/services/${service.id}/env-vars`);
  if (!ok) { console.error(`[villa-ops] Env-Vars nicht lesbar (HTTP ${status}): ${text.slice(0, 400)}`); return; }
  if (!Array.isArray(data) || data.length === 0) {
    console.log(`[villa-ops] Env-Var-Antwort ungueltig/leer. Roh (${status}): ${text.slice(0, 500)}`);
    return;
  }
  for (const item of data) {
    const e = item.envVar ?? item;
    console.log(` - ${e.key} = ${mask(e.value)}`);
  }
  console.log("[villa-ops] Wenn DATABASE_URL fehlt: Login/Villen-Speicher inaktiv (Health meldet nicht_konfiguriert).");
  // Environment Groups pruefen: Der Container bezieht Env evtl. aus einer Gruppe,
  // waehrend /services/{id}/env-vars nur service-lokale Werte spiegelt.
  const groups = await render(`/env-groups?ownerId=${(service.ownerId ?? "").split("/")[1] ?? ""}`);
  const groupList = groups.data ?? [];
  console.log(`[villa-ops] Env-Groups: ${groupList.length}`);
  for (const g of groupList) {
    const grp = g.envGroup ?? g;
    console.log(` - Gruppe: ${grp.id} | ${grp.name} | envVars=${(grp.envVars ?? []).length}`);
    for (const e of grp.envVars ?? []) console.log(`   * ${e.key}`);
  }
  // Service-Detail ohne Werte: enthaelt er eine envGroup-Referenz?
  const detail = await render(`/services/${service.id}`);
  const keys = Object.keys(detail.data ?? {});
  console.log(`[villa-ops] Service-Felder: ${keys.join(", ")}`);
  for (const k of ["envGroups", "envGroup", "environmentGroup", "environmentId", "environmentGroups"]) {
    if (detail.data?.[k]) console.log(` - ${k}: ${JSON.stringify(detail.data[k]).slice(0, 200)}`);
  }
  // Einzel-Key-Abfrage: die Listen-Endpoint liefert hier unzulaessig [].
  for (const key of ["DATABASE_URL", "AGENT_ADMIN_EMAIL", "GOOGLE_CLIENT_ID", "JWT_SECRET", "OPENROUTER_API_KEY", "GOOGLE_CLIENT_SECRET"]) {
    const r = await render(`/services/${service.id}/env-vars/${key}`);
    const e = r.ok ? ((r.data?.[0] ?? r.data) ?? null) : null;
    const v = e?.value;
    console.log(` - ${key}: ${r.ok ? (v ? mask(v) : "gesetzt, Wert nicht lesbar") : `nicht gesetzt (HTTP ${r.status})`}`);
  }
  const deps = await render(`/services/${service.id}/deploys?limit=3`);
  for (const item of deps.data || []) {
    const d = item.deploy ?? item;
    console.log(`[deploy] ${d.id} | ${d.status} | commit=${(d.commit ?? {}).id ?? "?"} | erstellt=${d.createdAt}`);
  }
}

async function setEnvOps() {
  if (!SERVICE_ID) { console.error("[villa-ops] SERVICE_ID fehlt fuer set-env"); process.exit(1); }
  const values = {
    NODE_ENV: "production", // kein Secret — produktiver Modus ist der Deploy-Standard
    AGENT_ADMIN_EMAIL: (process.env.AGENT_ADMIN_EMAIL ?? "").trim(),
    GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID ?? "").trim(),
    JWT_SECRET: (process.env.JWT_SECRET ?? "").trim(),
    OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY ?? "").trim(),
    // Noch offen (Owner-Werte) — sobald die Secrets AGENTEN_VILLA_DATABASE_URL /
    // AGENTEN_VILLA_GOOGLE_CLIENT_SECRET hinterlegt sind, fließen sie mit rein.
    DATABASE_URL: (process.env.DATABASE_URL_VALUE ?? "").trim(),
    GOOGLE_CLIENT_SECRET: (process.env.GOOGLE_CLIENT_SECRET_VALUE ?? "").trim(),
  };
  const present = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
  const keys = Object.keys(present);
  if (keys.length === 0) { console.error("[villa-ops] Keine Werte vorhanden — nichts zu setzen."); process.exit(1); }
  console.log(`[villa-ops] Setze auf Service ${SERVICE_ID}: ${keys.join(", ")}`);
  const body = JSON.stringify(keys.map((key) => ({ key, value: present[key] })));
  let result = await render(`/services/${SERVICE_ID}/env-vars`, { method: "POST", body });
  if (!result.ok && result.status === 405) {
    // Render akzeptiert je nach API-Version kein batch-POST — PUT ersetzt das
    // komplette Set; sicher, weil die Villa hier nur per Workflow verwaltet wird.
    result = await render(`/services/${SERVICE_ID}/env-vars`, { method: "PUT", body });
  }
  console.log(`[villa-ops] env-vars setzen -> HTTP ${result.status}${result.ok ? "" : `: ${result.text.slice(0, 300)}`}`);
  if (!result.ok) process.exit(1);
  const dep = await render(`/services/${SERVICE_ID}/deploys`, { method: "POST", body: JSON.stringify({}) });
  console.log(`[villa-ops] Deploy-Trigger -> HTTP ${dep.status}${dep.ok ? " (laeuft)" : `: ${String(dep.text).slice(0, 300)}`}`);
}

(async () => {
  try {
    if (OP === "deploy") await deployOps();
  else if (OP === "read") await readOps();
    else if (OP === "set-env") await setEnvOps();
    else { console.error(`[villa-ops] Unbekannte Operation: ${OP}`); process.exit(1); }
  } catch (error) {
    console.error(`[villa-ops] Fehler: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
})();
