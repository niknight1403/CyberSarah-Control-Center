/**
 * Staging-/Live-Smoke Logik (rein, testbar) — Sprint 379.
 *
 * Staging & Produktion Smoke-Test-Auswertung für Systemgesundheit,
 * Auth-Gates, Webhook-Enforcement, Billing-Status und Checkout-Gate.
 */

export interface HealthResponseInput {
  status: number;
  body: Record<string, unknown>;
}

export interface AuthGateEndpoint {
  path: string;
  status: number; // Erwartet 401 oder 403 für geschützte Pfade
}

export interface StagingSmokeInput {
  healthResponse: HealthResponseInput;
  authGates: AuthGateEndpoint[];
  deepHealth: {
    db: boolean;
    neon: boolean;
    workspace: boolean;
  };
  webhookEnforcement: {
    unsignedRejected: boolean;
    statusCode: number;
  };
  billingStatus: {
    subscriptionActive: boolean;
    customerConfigured: boolean;
    tier: string;
  };
  checkoutGate: {
    adminForbidden: boolean;
    statusCode: number;
  };
  draftQueue: {
    readable: boolean;
    pendingCount: number;
  };
}

export interface StagingSmokeCheckResult {
  name: string;
  passed: boolean;
  note: string;
}

export interface StagingSmokeReport {
  passed: boolean;
  score: number; // 0..100
  passedChecks: number;
  totalChecks: number;
  checks: StagingSmokeCheckResult[];
  honestLimits: string[];
}

export function validateHealthEndpoint(res: HealthResponseInput): {
  ok: boolean;
  details: string;
} {
  if (res.status !== 200) {
    return { ok: false, details: `Health endpoint returned status ${res.status}` };
  }
  if (res.body?.ok !== true && res.body?.status !== "ok") {
    return { ok: false, details: `Health endpoint body missing ok:true or status:'ok'` };
  }
  return { ok: true, details: "Health endpoint responding with HTTP 200 and ok status" };
}

export function checkAuthGates(endpoints: AuthGateEndpoint[]): {
  total: number;
  protectedCount: number;
  passed: boolean;
  details: string[];
} {
  const details: string[] = [];
  let protectedCount = 0;

  for (const ep of endpoints) {
    const isProtected = ep.status === 401 || ep.status === 403;
    if (isProtected) {
      protectedCount++;
      details.push(`Path ${ep.path} correctly blocked with ${ep.status}`);
    } else {
      details.push(`Path ${ep.path} exposed with status ${ep.status}`);
    }
  }

  return {
    total: endpoints.length,
    protectedCount,
    passed: protectedCount === endpoints.length,
    details,
  };
}

export function evaluateStagingSmokeReport(input: StagingSmokeInput): StagingSmokeReport {
  const checks: StagingSmokeCheckResult[] = [];

  // 1. Health check
  const healthVal = validateHealthEndpoint(input.healthResponse);
  checks.push({
    name: "Live Health Endpoint",
    passed: healthVal.ok,
    note: healthVal.details,
  });

  // 2. Auth Gates
  const gateCheck = checkAuthGates(input.authGates);
  checks.push({
    name: "Protected Auth Gates",
    passed: gateCheck.passed,
    note: `${gateCheck.protectedCount}/${gateCheck.total} protected routes return 401/403`,
  });

  // 3. Deep Health
  const deepHealthOk = input.deepHealth.db && input.deepHealth.neon && input.deepHealth.workspace;
  checks.push({
    name: "Deep Health Components",
    passed: deepHealthOk,
    note: `DB:${input.deepHealth.db}, Neon:${input.deepHealth.neon}, Workspace:${input.deepHealth.workspace}`,
  });

  // 4. Webhook Enforcement
  const webhookOk = input.webhookEnforcement.unsignedRejected && (input.webhookEnforcement.statusCode === 400 || input.webhookEnforcement.statusCode === 401);
  checks.push({
    name: "Unsigned Webhook Enforcement",
    passed: webhookOk,
    note: `Unsigned requests rejected with status ${input.webhookEnforcement.statusCode}`,
  });

  // 5. Billing Status
  const billingOk = input.billingStatus.customerConfigured && Boolean(input.billingStatus.tier);
  checks.push({
    name: "Billing Status Configured",
    passed: billingOk,
    note: `Tier: ${input.billingStatus.tier}, CustomerConfigured: ${input.billingStatus.customerConfigured}`,
  });

  // 6. Checkout Gate
  const checkoutOk = input.checkoutGate.adminForbidden && input.checkoutGate.statusCode === 403;
  checks.push({
    name: "Checkout Gate Admin Block",
    passed: checkoutOk,
    note: `Admin checkout attempt returns status ${input.checkoutGate.statusCode}`,
  });

  // 7. Draft Queue
  checks.push({
    name: "Draft Queue Accessibility",
    passed: input.draftQueue.readable,
    note: `Readable: ${input.draftQueue.readable}, Pending items: ${input.draftQueue.pendingCount}`,
  });

  const passedChecks = checks.filter((c) => c.passed).length;
  const totalChecks = checks.length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  const honestLimits = [
    "Keine echten Zahlungen ausgelöst; Checkout-Gate verifiziert.",
    "Unsigned Webhooks werden abgewiesen; echte Stripe Signatur-Prüfung im Live-Modus.",
    "Draft-Queue ist lesbar; echte Freigaben erfordern HITL-Interaktion des Owners.",
  ];

  return {
    passed: score === 100,
    score,
    passedChecks,
    totalChecks,
    checks,
    honestLimits,
  };
}
