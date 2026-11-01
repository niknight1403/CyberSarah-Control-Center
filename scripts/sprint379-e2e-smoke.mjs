#!/usr/bin/env node
/**
 * Sprint 379 — E2E Live Smoke Test gegen Produktion
 *
 * Verifiziert:
 * 1. Health-Endpunkt
 * 2. Unautorisierter Zugriff 401 auf geschuetzte Router
 * 3. Admin-Login + Session
 * 4. Billing-Router (status, invoices, evaluateTierChange) mit auth
 * 5. Admin-spezifische Billing-Einschraenkung (checkoutTier/cancel/portal FORBIDDEN)
 * 6. Revenue-Router (getMetrics) mit auth
 * 7. Kampagnen-Bruecke admin-geschuetzt
 * 8. Draft-Queue + Publishing-Status mit auth
 *
 * KEINE echten Zahlungen. KEINE Checkout-Session fuer echte Kunden.
 */

const BASE = process.env.LIVE_API_BASE_URL || "https://app.cybersarah-ki.com";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const results = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    results.push(`  PASS | ${name}${detail ? " | " + detail : ""}`);
  } else {
    failed++;
    results.push(`  FAIL | ${name}${detail ? " | " + detail : ""}`);
  }
}

async function trpcGet(path, cookies) {
  const headers = cookies ? { Cookie: cookies } : {};
  const res = await fetch(`${BASE}/api/trpc/${path}`, { method: "GET", headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function trpcPost(path, body, cookies) {
  const headers = { "Content-Type": "application/json" };
  if (cookies) headers.Cookie = cookies;
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, body: data };
}

async function adminLogin() {
  const res = await fetch(`${BASE}/api/trpc/account.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const sessionToken = setCookie.split(";")[0] || "";
  const body = await res.json().catch(() => null);
  return { status: res.status, sessionToken, body };
}

async function run() {
  console.log(`Sprint 379 — E2E Live Smoke gegen ${BASE}`);

  // 1. Health
  {
    const res = await fetch(`${BASE}/api/health`);
    const body = await res.json();
    check("health.200", res.status === 200, `ok=${body?.ok}`);
  }

  // 2-8. Unauthorized 401 on protected routes
  {
    const r1 = await trpcGet("account.me");
    check("unauth.account.me.401", r1.status === 401, `got ${r1.status}`);

    const r2 = await trpcGet("billing.status");
    check("unauth.billing.status.401", r2.status === 401, `got ${r2.status}`);

    const r3 = await trpcGet("billing.invoices");
    check("unauth.billing.invoices.401", r3.status === 401, `got ${r3.status}`);

    const r4 = await trpcGet("revenue.getMetrics");
    check("unauth.revenue.getMetrics.401", r4.status === 401, `got ${r4.status}`);

    const r5 = await trpcPost("campaignBridge.queueFromIdeas", { json: { ideaIds: ["test"] } });
    check("unauth.campaignBridge.401", r5.status === 401, `got ${r5.status}`);

    const r6 = await trpcGet("draftEngine.queue");
    check("unauth.draftEngine.401", r6.status === 401, `got ${r6.status}`);

    const r7 = await trpcGet("publishing.status");
    check("unauth.publishing.status.401", r7.status === 401, `got ${r7.status}`);

    const r8 = await trpcGet("");
    check("trpc.root.404", r8.status === 404, `got ${r8.status}`);
  }

  // 9. Admin Login
  let sessionToken = "";
  {
    const result = await adminLogin();
    check("admin.login.200", result.status === 200, `got ${result.status}`);
    check("admin.session.cookie", result.sessionToken.includes("session="), "cookie da");
    sessionToken = result.sessionToken;
  }

  if (sessionToken) {
    // 10. account.me -> role=admin
    {
      const { status, body } = await trpcGet("account.me", sessionToken);
      check("auth.account.me.200", status === 200, `got ${status}`);
      const role = body?.result?.data?.role;
      check("auth.account.me.role.admin", role === "admin", `role=${role}`);
    }

    // 11. billing.status -> Uebersicht
    {
      const { status, body } = await trpcGet("billing.status", sessionToken);
      check("auth.billing.status.200", status === 200, `got ${status}`);
      check("auth.billing.status.data", body?.result?.data !== undefined, "data da");
    }

    // 12. billing.invoices -> Rechnungsliste
    {
      const { status, body } = await trpcGet("billing.invoices", sessionToken);
      check("auth.billing.invoices.200", status === 200, `got ${status}`);
      check("auth.billing.invoices.array", body?.result?.data?.invoices !== undefined, "invoices da");
    }

    // 13. billing.evaluateTierChange -> Tier-Entscheidung
    {
      const input = encodeURIComponent(JSON.stringify({ json: { current: "lite", requested: "pro" } }));
      const { status, body } = await trpcGet(`billing.evaluateTierChange?input=${input}`, sessionToken);
      check("auth.billing.evaluateTierChange.200", status === 200, `got ${status}`);
      check("auth.billing.evaluateTierChange.data", body?.result?.data !== undefined, "data da");
    }

    // 14. billing.checkoutTier als Admin -> FORBIDDEN
    {
      const { status, body } = await trpcPost("billing.checkoutTier", { json: { tier: "pro" } }, sessionToken);
      const code = body?.error?.json?.data?.code;
      check("admin.checkoutTier.FORBIDDEN", status === 403 || code === "FORBIDDEN", `got ${status}/${code}`);
    }

    // 15. billing.cancel als Admin -> FORBIDDEN
    {
      const { status, body } = await trpcPost("billing.cancel", { json: {} }, sessionToken);
      const code = body?.error?.json?.data?.code;
      check("admin.cancel.FORBIDDEN", status === 403 || code === "FORBIDDEN", `got ${status}/${code}`);
    }

    // 16. billing.portal als Admin -> FORBIDDEN
    {
      const { status, body } = await trpcPost("billing.portal", { json: {} }, sessionToken);
      const code = body?.error?.json?.data?.code;
      check("admin.portal.FORBIDDEN", status === 403 || code === "FORBIDDEN", `got ${status}/${code}`);
    }

    // 17. revenue.getMetrics -> Revenue-Metriken
    {
      const { status, body } = await trpcGet("revenue.getMetrics", sessionToken);
      check("auth.revenue.getMetrics.200", status === 200, `got ${status}`);
      check("auth.revenue.data", body?.result?.data !== undefined, "data da");
    }

    // 18. campaignBridge.queueFromIdeas -> admin-geschuetzt (nicht 401)
    {
      const { status } = await trpcPost("campaignBridge.queueFromIdeas", { json: { ideaIds: [] } }, sessionToken);
      check("auth.campaignBridge.not401", status !== 401, `got ${status}`);
    }

    // 19. publishing.status -> verfuegbar
    {
      const { status } = await trpcGet("publishing.status", sessionToken);
      check("auth.publishing.status.200", status === 200, `got ${status}`);
    }

    // 20. draftEngine.queue -> verfuegbar
    {
      const { status } = await trpcGet("draftEngine.queue", sessionToken);
      check("auth.draftEngine.200", status === 200, `got ${status}`);
    }
  }

  // 21. Uptime-Waechter Workflow auf GitHub
  {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      const res = await fetch(
        "https://api.github.com/repos/niknight1403/CyberSarah-Control-Center/actions/workflows?per_page=100",
        { headers: { Authorization: `token ${token}`, Accept: "application/vnd.github+json" } },
      );
      const data = await res.json();
      const hasUptime = (data?.workflows || []).some((w) =>
        w.name?.toLowerCase().includes("uptime") ||
        w.name?.toLowerCase().includes("waechter") ||
        w.name?.toLowerCase().includes("monitor") ||
        w.name?.toLowerCase().includes("diagnose"),
      );
      check("github.uptime.workflow", hasUptime, `${(data?.workflows || []).length} workflows`);
    } else {
      check("github.uptime.workflow", true, "skip (no token)");
    }
  }

  // Report
  console.log(results.join("\n"));
  const total = passed + failed;
  console.log(`\nErgebnis: ${passed}/${total} Schritte gruen.`);
  if (failed > 0) {
    console.error(`${failed} Schritt(e) ROT.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
