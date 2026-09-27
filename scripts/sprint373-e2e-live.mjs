/**
 * Sprint 373 — E2E-LIVE: Login-Gate + autonome Kampagnen-Bruecke gegen die
 * produktive API (keine Simulation, keine Mocks — echte Requests).
 *
 * Kette:
 *   1. account.login (Admin-Credentials aus GitHub-Secrets) -> role=admin?
 *   2. account.me -> Session wird erkannt?
 *   3. campaignBridge.queueFromIdeas mit EINEM Test-Brief ->
 *      erzeugt die Bruecke einen echten pending Content-Entwurf?
 *   4. draftEngine.queue -> ist der Entwurf sichtbar und pending (HITL)?
 *
 * Der Test-Entwurf bleibt als sichtbares Artefakt pending — der Owner kann
 * ihn freigeben oder ablehnen; veroeffentlicht wird hier nichts.
 *
 * Gecallt von .github/workflows/diagnose-admin.yml (input: sprint373-e2e-live).
 */
const API_BASE = (process.env.LIVE_API_BASE_URL ?? "").replace(/\/$/, "");
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!API_BASE || !email || !password) {
  throw new Error("LIVE_API_BASE_URL, ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein.");
}

const results = [];

async function trpcCall(path, body, token, isQuery = false) {
  const url = isQuery
    ? `${API_BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: body ?? null }))}`
    : `${API_BASE}/api/trpc/${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: isQuery ? "GET" : "POST",
    headers,
    body: isQuery ? undefined : JSON.stringify({ json: body ?? {} }),
  });
  return res.json();
}

function unwrap(payload) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  return first?.result?.data?.json ?? first?.result?.data ?? first?.result ?? first?.error ?? first;
}

async function main() {
  // 1. Login mit produktivem Admin-Konto (echt, kein Stub).
  const login = unwrap(await trpcCall("account.login", { email, password }));
  const isAdmin = login?.user?.role === "admin" && typeof login?.sessionToken === "string" && login.sessionToken.length > 0;
  results.push({ step: "account.login -> role=admin + sessionToken", ok: isAdmin, detail: `role=${login?.user?.role}` });
  if (!isAdmin) throw new Error("Login fehlgeschlagen — weitere Schritte abgebrochen.");

  const token = login.sessionToken;

  // 2. Session wird erkannt.
  const me = unwrap(await trpcCall("account.me", null, token, true));
  results.push({ step: "account.me -> Session erkannt", ok: me?.role === "admin", detail: `role=${me?.role}` });

  // 3. Kampagnen-Bruecke: EIN Test-Brief durch die echte Pipeline.
  const brief = {
    ideaId: `live-test-${Date.now()}`,
    ideaTitle: "Sprint-373-Live-Test",
    personaId: "nova",
    platform: "x",
    goal: "aufmerksamkeit",
    topic: "Ehrlicher Live-Test der Sprint-373-Kampagnenbruecke: autonome Integration von Ideen ins Influencer-Marketing",
    draftTitle: "Kampagne: Sprint-373-Live-Test",
  };
  const bridge = unwrap(await trpcCall("campaignBridge.queueFromIdeas", { briefs: [brief] }, token));
  const queued = bridge?.result?.queued ?? 0;
  const firstOutcome = bridge?.result?.outcomes?.[0];
  results.push({
    step: "campaignBridge.queueFromIdeas -> Entwurf erzeugt",
    ok: queued >= 1 && firstOutcome?.ok === true,
    detail: `queued=${queued} outcomes=${JSON.stringify(bridge?.result?.outcomes ?? [])}`,
  });

  // 4. Freigabe-Queue: Entwurf sichtbar und pending (HITL bleibt gewahrt)?
  const queue = unwrap(await trpcCall("draftEngine.queue", null, token, true));
  const pendingContent = (queue?.pending ?? []).find((group) => group.kind === "content");
  const match = (pendingContent?.items ?? []).some((item) => item.title === "Kampagne: Sprint-373-Live-Test" && item.status === "pending");
  results.push({
    step: "draftEngine.queue -> Test-Entwurf pending sichtbar",
    ok: match,
    detail: `pendingContent=${pendingContent?.items?.length ?? 0} Eintraege`,
  });

  console.log("\nSprint 373 — E2E-LIVE gegen", API_BASE);
  for (const entry of results) console.log(entry.ok ? "  PASS" : "  FAIL", "|", entry.step, "|", entry.detail);
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\nErgebnis: ${results.length - failed.length}/${results.length} Schritte gruen.\n`);
  if (failed.length > 0) {
    throw new Error(`E2E-LIVE fehlgeschlagen: ${failed.map((entry) => entry.step).join("; ")}`);
  }
}

main().catch((error) => {
  console.error("E2E-LIVE Fehler:", error instanceof Error ? error.message : error);
  for (const entry of results) if (!entry.ok) console.log("  FAIL |", entry.step, "|", entry.detail);
  process.exit(1);
});
