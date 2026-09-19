import "dotenv/config";

/**
 * Live-Check (read-only fuer Rollen): Loggt sich mit dem produktiven
 * Admin-Konto (ADMIN_EMAIL/ADMIN_PASSWORD aus GitHub-Secrets) gegen die
 * LIVE-API ein und prueft die komplette Berechtigungs-Kette:
 *   1. account.login  -> enthaelt die Antwort role=admin?
 *   2. account.me     -> liefert der Server role=admin zurueck?
 *   3. orchestrator.tools (adminProcedure) -> FORBIDDEN oder OK?
 * Gecallt von .github/workflows/diagnose-admin.yml (input: live-check).
 */
const API_BASE = (process.env.LIVE_API_BASE_URL ?? "").replace(/\/$/, "");
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!API_BASE || !email || !password) {
  throw new Error("LIVE_API_BASE_URL, ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein.");
}

async function mutation(path, body, token) {
  const url = `${API_BASE}/api/trpc/${path}`;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ json: body ?? {} }),
  });
  return res.json();
}

async function query(path, token) {
  const url = `${API_BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: null }))}`;
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(url, { method: "GET", headers });
  return res.json();
}

async function main() {
  console.log(`--- Live-Check gegen ${API_BASE} ---`);

  // 1. Health
  const health = await fetch(`${API_BASE}/api/health`).then((r) => r.json()).catch(() => null);
  console.log("health:", JSON.stringify(health));

  // 2. Login
  const login = await mutation("account.login", { email, password }, null);
  const loginData = login?.result?.data?.json;
  const token = loginData?.sessionToken;
  console.log("login.user.role =", loginData?.user?.role ?? "FEHLER: " + JSON.stringify(login?.error ?? login).slice(0, 300));
  if (!token) throw new Error("Kein sessionToken erhalten — Login fehlgeschlagen.");

  // 3. account.me
  const me = await query("account.me", token);
  const meData = me?.result?.data?.json;
  console.log("account.me.role =", meData?.role ?? "FEHLER: " + JSON.stringify(me?.error ?? me).slice(0, 300));

  // 4. Admin-geschuetzter Endpoint (orchestrator.tools)
  const tools = await query("orchestrator.tools", token);
  const toolsData = tools?.result?.data?.json;
  const toolsError = tools?.error?.json ?? tools?.error;
  if (toolsError) {
    console.log("orchestrator.tools =", "FEHLER " + (toolsError.data?.code ?? toolsError.code) + ":", String(toolsError.message ?? "").slice(0, 200));
  } else {
    const count = Array.isArray(toolsData?.tools) ? toolsData.tools.length : "?";
    console.log("orchestrator.tools = OK,", count, "Tools gelistet");
  }
}

main().catch((error) => {
  console.error("[Live-Check] Fehlgeschlagen:", error.message);
  process.exit(1);
});
