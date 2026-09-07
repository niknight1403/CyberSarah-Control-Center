#!/usr/bin/env node
/**
 * Koyeb-Deployment fuer das CyberSarah Control Center (Hetzner-Exit,
 * Phase 4). Liest den Koyeb-API-Token ausschliesslich aus der
 * Umgebung (KOYEB_TOKEN) — niemals committen.
 *
 * Ablauf:
 *  1. Token validieren (lib/koyeb-deploy-logic.mjs)
 *  2. Optional: Drizzle-Migrationen gegen DATABASE_URL ausfuehren (--migrate)
 *  3. App mit API+Web-Kombidienst anlegen (POST /v1/apps)
 *  4. Auf Healthy warten, oeffentliche URL ermitteln
 *  5. ENV mit echter Domain patchen (APP_BASE_URL, APP_ALLOWED_ORIGINS)
 *  6. /api/health und /api/ready oeffentlich verifizieren
 *
 * Nutzung:
 *   KOYEB_TOKEN=... DATABASE_URL=... node scripts/koyeb-deploy.mjs [--migrate] [--dry-run]
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  buildAppCreateRequest,
  buildServiceEnv,
  koyebApiError,
  maskSecrets,
  publicUrlFromApp,
  validateKoyebToken,
} from "../lib/koyeb-deploy-logic.mjs";

const API = "https://app.koyeb.com";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const migrate = args.has("--migrate");

function env(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

async function apiFetch(path, options = {}) {
  const token = env("KOYEB_TOKEN");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(koyebApiError(response.status, text));
  }
  return text ? JSON.parse(text) : null;
}

function log(message) {
  console.log(`[koyeb-deploy] ${maskSecrets(message)}`);
}

async function waitForHealthy(appId, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const app = await apiFetch(`/v1/apps/${appId}`);
    const service = app.services?.[0];
    const status = service?.status ?? "unknown";
    log(`Status: ${status}`);
    if (status === "healthy") return app;
    if (status === "unhealthy") {
      throw new Error(
        "Dienst unhealthy — Logs in der Koyeb-Konsole pruefen (APP_ALLOWED_ORIGINS, DATABASE_URL).",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
  throw new Error("Timeout beim Warten auf Healthy (15 Minuten).");
}

async function verifyPublic(url) {
  const health = await fetch(`${url}/api/health`);
  if (!health.ok) throw new Error(`/api/health antwortet ${health.status}`);
  log(`/api/health: ${health.status} OK`);
}

async function main() {
  const tokenCheck = validateKoyebToken(env("KOYEB_TOKEN", ""));
  if (!tokenCheck.ok) {
    console.error(`[koyeb-deploy] KOYEB_TOKEN ungueltig: ${tokenCheck.reason}`);
    process.exit(2);
  }
  log("Token-Format gueltig.");

  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) {
    console.error(
      "[koyeb-deploy] DATABASE_URL fehlt (Koyeb-Datenbank-Connection-String).",
    );
    process.exit(2);
  }

  const appName = env("KOYEB_APP_NAME", "cybersarah-control-center");
  const region = env("KOYEB_REGION", "fra");
  const instanceType = env("KOYEB_INSTANCE_TYPE", "free");
  const jwtSecret = env("JWT_SECRET", randomUUID().replace(/-/g, ""));
  const metricsToken = env("METRICS_TOKEN");

  if (migrate) {
    log("Fuehre Drizzle-Migrationen gegen DATABASE_URL aus …");
    const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    if (result.status !== 0) {
      console.error("[koyeb-deploy] Migrationen fehlgeschlagen.");
      process.exit(1);
    }
  }

  const envList = buildServiceEnv({
    databaseUrl,
    appBaseUrl: env("KOYEB_APP_BASE_URL", `https://${appName}.koyeb.app`),
    allowedOrigins: env(
      "KOYEB_ALLOWED_ORIGINS",
      `https://${appName}.koyeb.app,https://app.cybersarah-ki.com`,
    ),
    jwtSecret,
    metricsToken,
    stripeSecretKey: env("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
  });

  const requestBody = buildAppCreateRequest({
    appName,
    envList,
    region,
    instanceType,
  });

  if (dryRun) {
    console.log(maskSecrets(JSON.stringify(requestBody, null, 2)));
    log("Dry-Run: keine Ressourcen angelegt, Secrets maskiert.");
    return;
  }

  log(`Lege App "${appName}" an …`);
  const created = await apiFetch("/v1/apps", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
  log(`App angelegt: ${created.id}`);

  const app = await waitForHealthy(created.id);
  const publicUrl = publicUrlFromApp(app);
  if (!publicUrl) throw new Error("Keine oeffentliche Domain gefunden.");
  log(`Oeffentliche URL: ${publicUrl}`);

  // ENV mit der echten Domain aktualisieren (Redeploy).
  const service = app.services?.[0];
  const finalEnv = buildServiceEnv({
    databaseUrl,
    appBaseUrl: publicUrl,
    allowedOrigins: `${publicUrl},https://app.cybersarah-ki.com,https://www.cybersarah-ki.com`,
    jwtSecret,
    metricsToken,
    stripeSecretKey: env("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
  });
  log("Patche ENV mit echter Domain …");
  await apiFetch(`/v1/services/${service.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      definition: { ...service.definition, env: finalEnv },
    }),
  });
  await waitForHealthy(created.id);

  await verifyPublic(publicUrl);
  log(`Deployment abgeschlossen: ${publicUrl} (Web + API)`);
  log("Naechste Schritte: DNS-Cutover app.cybersarah-ki.com (Phase 5).");
}

main().catch((error) => {
  console.error(`[koyeb-deploy] ${error.message}`);
  process.exit(1);
});
