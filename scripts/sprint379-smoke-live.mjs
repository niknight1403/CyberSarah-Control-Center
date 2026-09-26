import "dotenv/config";

/**
 * Sprint 379 — E2E-LIVE: Staging-Smoke Produktion + Revenue-Maschinerie.
 * Echte Requests gegen die produktive API — keine Simulation, keine Mocks.
 *
 * Kette (ohne echte Zahlungen auszuloesen):
 *   A) Unauthentifiziert: Health, 401-Gates auf geschuetzten Routern,
 *      tRPC-Hauptrouter erreichbar, Stripe-Webhook-Signaturenforcement.
 *   B) Admin-Session: Login, Deep-Health (ops.overview: DB/Neon/Workspace),
 *      Billing-Status (Stripe-Modus + Entitlements), Checkout-Gate
 *      (Admin erhaelt erwartetes FORBIDDEN — kein Checkout fuer Admins),
 *      Draft-Queue (HITL-Funnel sichtbar).
 *
 * Gecallt von .github/workflows/diagnose-admin.yml (input: sprint379-smoke-live).
 */
const API_BASE = (process.env.LIVE_API_BASE_URL ?? "").replace(/\/$/, "");
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!API_BASE || !email || !password) {
  throw new Error("LIVE_API_BASE_URL, ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein.");
}

const results = [];

function record(step, ok, detail) {
  const safe = String(detail ?? "").replace(email, "***@***");
  results.push({ step, ok, detail: safe });
  console.log(ok ? "  PASS" : "  FAIL", "|", step, "|", safe);
}

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
  const payload = await res.json().catch(() => null);
  return { status: res.status, payload };
}

function unwrap(payload) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  return first?.result?.data?.json ?? first?.result?.data ?? first?.result ?? first?.error ?? first;
}

async function main() {
  console.log("\nSprint 379 — Staging-Smoke + Revenue-Maschinerie gegen", API_BASE.replace(/\/\/.*@/, "//***@"));

  // --- A) Unauthentifizierte Checks -------------------------------------
  const health = await fetch(`${API_BASE}/api/health`).then((r) => r.json()).catch(() => null);
  record("A1 /api/health ok:true (unauth)", health?.ok === true, `ok=${health?.ok}`);

  const me401 = await trpcCall("account.me", null, null, true);
  record("A2 account.me ohne Login -> 401", me401.status === 401, `http=${me401.status}`);

  const bridge401 = await trpcCall("campaignBridge.queueFromIdeas", { briefs: [] }, null, false);
  record("A3 campaignBridge ohne Login -> 401", bridge401.status === 401, `http=${bridge401.status}`);

  const draft401 = await trpcCall("draftEngine.queue", null, null, true);
  record("A4 draftEngine.queue ohne Login -> 401", draft401.status === 401, `http=${draft401.status}`);

  const billing401 = await trpcCall("billing.status", null, null, true);
  record("A5 billing.status ohne Login -> 401", billing401.status === 401, `http=${billing401.status}`);

  const ops401 = await trpcCall("ops.overview", null, null, true);
  record("A6 ops.overview (Deep-Health) ohne Login -> 401", ops401.status === 401, `http=${ops401.status}`);

  const mainRouter = await trpcCall("ops.workspaceServiceUrl", null, null, true);
  const mainRouterData = unwrap(mainRouter.payload);
  record(
    "A7 tRPC-Hauptrouter erreichbar (ops.workspaceServiceUrl public)",
    mainRouter.status === 200 && !!mainRouterData,
    `http=${mainRouter.status} proxyUrl=${mainRouterData?.proxyUrl ?? "n/a"}`
  );

  // Stripe-Webhook: unsignierte Events muessen abgewiesen werden (Signatur-Enforcement).
  const webhookRes = await fetch(`${API_BASE}/api/billing/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "test.unsigned", data: { object: {} } }),
  });
  record(
    "A8 Stripe-Webhook weist unsigniertes Event ab (4xx)",
    webhookRes.status >= 400 && webhookRes.status < 500,
    `http=${webhookRes.status}`
  );

  // --- B) Authentifizierte Checks (Admin-Session, echte Credentials) ----
  const login = unwrap((await trpcCall("account.login", { email, password })).payload);
  const token = login?.sessionToken;
  record("B1 account.login -> role=admin + sessionToken", login?.user?.role === "admin" && typeof token === "string", `role=${login?.user?.role}`);

  const me = unwrap((await trpcCall("account.me", null, token, true)).payload);
  record("B2 account.me mit Session -> admin", me?.role === "admin", `role=${me?.role}`);

  const deep = unwrap((await trpcCall("ops.overview", null, token, true)).payload);
  const components = Array.isArray(deep?.components) ? deep.components : [];
  const dbOk = components.some((c) => c.kind === "database" && c.state === "ok");
  const neonState = components.find((c) => c.kind === "neonPostgres")?.state ?? "unbekannt";
  record(
    "B3 ops.overview Deep-Health: Datenbank ok, Neon-Status gemeldet",
    components.length > 0 && (dbOk || neonState !== "unbekannt"),
    `components=${components.length} dbOk=${dbOk} neon=${neonState}`
  );

  const billing = unwrap((await trpcCall("billing.status", null, token, true)).payload);
  const billingKeys = billing ? Object.keys(billing) : [];
  record(
    "B4 billing.status mit Session -> echte Abrechnungsuebersicht",
    billingKeys.length > 0,
    `felder=${billingKeys.slice(0, 8).join(",")}${billingKeys.length > 8 ? ",…" : ""}`
  );

  // Checkout-Gate: Admins haben dauerhaften Expert-Zugang -> erwartetes FORBIDDEN.
  const checkout = await trpcCall("billing.checkoutTier", { tier: "lite" }, token, false);
  const checkoutData = unwrap(checkout.payload);
  const forbidden = checkout.status === 403 || checkoutData?.code === "FORBIDDEN";
  record(
    "B5 billing.checkoutTier: Admin-Checkout-Gate aktiv (FORBIDDEN, keine Session)",
    forbidden,
    `http=${checkout.status} code=${checkoutData?.code ?? "n/a"}`
  );

  const queue = unwrap((await trpcCall("draftEngine.queue", null, token, true)).payload);
  const pendingContent = (queue?.pending ?? []).find((group) => group.kind === "content");
  record(
    "B6 draftEngine.queue mit Session -> Freigabe-Queue lesbar",
    Array.isArray(queue?.pending),
    `pendingGruppen=${(queue?.pending ?? []).length} content=${pendingContent?.items?.length ?? 0} Eintraege`
  );

  console.log(`\nErgebnis: ${results.filter((r) => r.ok).length}/${results.length} Checks gruen.\n`);
  if (results.some((r) => !r.ok)) {
    throw new Error(`Staging-Smoke fehlgeschlagen: ${results.filter((r) => !r.ok).map((r) => r.step).join("; ")}`);
  }
}

main().catch((error) => {
  console.error("Smoke-Fehler:", error instanceof Error ? error.message : error);
  process.exit(1);
});
