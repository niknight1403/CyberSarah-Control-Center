/**
 * Render Villa Ops — Agenten-Villa-Render-Service per API lesen/konfigurieren.
 * Nutzt den im CCC-Repo hinterlegten RENDER_API_KEY (Owner-Konto).
 *
 * OP=read        : Services listen + Env-Vars des Villa-Services anzeigen
 * OP=set-env     : AGENTEN_VILLA_*-Werte als Env-Vars setzen + Deploy triggern
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

async function readOps() {
  const service = await findVillaServiceId();
  if (!service) { console.log("[villa-ops] Kein Villa-Service gefunden."); return; }
  console.log(`[villa-ops] SERVICE: ${service.id} | ${service.name} | ${service.type} | suspended=${service.suspended}`);
  const { ok, data, status } = await render(`/services/${service.id}/env-vars`);
  if (!ok) { console.error(`[villa-ops] Env-Vars nicht lesbar (HTTP ${status})`); return; }
  for (const item of data || []) {
    const e = item.envVar ?? item;
    console.log(` - ${e.key} = ${mask(e.value)}`);
  }
  console.log("[villa-ops] Wenn DATABASE_URL fehlt: Login/Villen-Speicher inaktiv (Health meldet nicht_konfiguriert).");
}

async function setEnvOps() {
  if (!SERVICE_ID) { console.error("[villa-ops] SERVICE_ID fehlt fuer set-env"); process.exit(1); }
  const values = {
    AGENT_ADMIN_EMAIL: (process.env.AGENT_ADMIN_EMAIL ?? "").trim(),
    GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID ?? "").trim(),
    JWT_SECRET: (process.env.JWT_SECRET ?? "").trim(),
    OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY ?? "").trim(),
  };
  const present = Object.fromEntries(Object.entries(values).filter(([, v]) => v));
  const keys = Object.keys(present);
  if (keys.length === 0) { console.error("[villa-ops] Keine Werte vorhanden — nichts zu setzen."); process.exit(1); }
  console.log(`[villa-ops] Setze auf Service ${SERVICE_ID}: ${keys.join(", ")}`);
  const { status, ok, text } = await render(`/services/${SERVICE_ID}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(keys.map((key) => ({ key, value: present[key] }))),
  });
  console.log(`[villa-ops] PUT env-vars -> HTTP ${status}${ok ? "" : `: ${text.slice(0, 300)}`}`);
  if (!ok) process.exit(1);
  const dep = await render(`/services/${SERVICE_ID}/deploys`, { method: "POST", body: JSON.stringify({}) });
  console.log(`[villa-ops] Deploy-Trigger -> HTTP ${dep.status}${dep.ok ? " (laeuft)" : `: ${String(dep.text).slice(0, 300)}`}`);
}

(async () => {
  try {
    if (OP === "read") await readOps();
    else if (OP === "set-env") await setEnvOps();
    else { console.error(`[villa-ops] Unbekannte Operation: ${OP}`); process.exit(1); }
  } catch (error) {
    console.error(`[villa-ops] Fehler: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
})();
