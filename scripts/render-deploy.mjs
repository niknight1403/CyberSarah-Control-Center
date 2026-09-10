#!/usr/bin/env node
/**
 * Render-Deployment fuer das CyberSarah Control Center (Koyeb-Ersatz).
 * Der Render-API-Key wird ausschliesslich aus der Umgebung gelesen
 * (RENDER_API_KEY) — niemals committen.
 *
 * Ablauf (App-Modus):
 *  1. API-Key und DATABASE_URL validieren (lib/render-deploy-logic.mjs)
 *  2. Optional: Drizzle-Migrationen gegen DATABASE_URL (--migrate)
 *  3. Service idempotent anlegen oder ENV aktualisieren (POST/PUT /v1/services)
 *  4. Auf Lives des Deploys warten (max. 25 Min — Docker-Build mit Expo-Export)
 *  5. APP_BASE_URL/APP_ALLOWED_ORIGINS mit der echten onrender-Domain patchen
 *  6. /api/health oeffentlich verifizieren
 *
 * Nutzung:
 *   RENDER_API_KEY=… DATABASE_URL=… node scripts/render-deploy.mjs [--migrate] [--dry-run]
 *   RENDER_API_KEY=… SERVICE_ACCESS_TOKEN=… node scripts/render-deploy.mjs --workspace
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  buildServiceCreateRequest,
  buildServiceEnv,
  buildWorkspaceEnv,
  findServiceByName,
  maskSecrets,
  publicServiceUrl,
  renderApiError,
  validateDatabaseUrl,
  validateRenderApiKey,
} from "../lib/render-deploy-logic.mjs";

const API = "https://api.render.com/v1";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const migrate = args.has("--migrate");
const workspace = args.has("--workspace");

function env(name, fallback) {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

async function apiFetch(path, options = {}) {
  const key = env("RENDER_API_KEY");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(renderApiError(response.status, text));
  }
  return text ? JSON.parse(text) : null;
}

function log(message) {
  console.log(`[render-deploy] ${maskSecrets(message)}`);
}

async function listServices() {
  const data = await apiFetch("/services?limit=100&type=web_service");
  return Array.isArray(data) ? data.map((entry) => entry.service ?? entry) : [];
}

async function waitForLive(serviceId, timeoutMs = 25 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=1`);
    const latest = Array.isArray(deploys) ? deploys[0]?.deploy ?? deploys[0] : null;
    const status = latest?.status ?? "unbekannt";
    log(`Deploy-Status: ${status}`);
    if (status === "live") return latest;
    if (status === "build_failed" || status === "update_failed" || status === "pre_deploy_failed") {
      throw new Error("Build/Update fehlgeschlagen — Render-Logs pruefen (APP_ALLOWED_ORIGINS, DATABASE_URL).");
    }
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
  throw new Error("Timeout beim Warten auf den Live-Deploy (25 Minuten).");
}

async function verifyPublic(url, healthPath = "/api/health") {
  const health = await fetch(`${url}${healthPath}`);
  if (!health.ok) throw new Error(`${healthPath} antwortet ${health.status}`);
  log(`${healthPath}: ${health.status} OK`);
}

/**
 * Legt den Service an (falls neu) und setzt das ENV vollstaendig
 * (idempotent — bestehende Services werden aktualisiert, nicht dupliziert).
 * Liefert { service, publicUrl } mit der echten onrender-Domain.
 */
async function upsertService({ serviceName, envLines, rootDir, healthCheckPath }) {
  const assumedUrl = `https://${serviceName}.onrender.com`;

  const requestBody = buildServiceCreateRequest({
    serviceName,
    envLines,
    rootDir,
    healthCheckPath,
  });

  if (dryRun) {
    // Kein API-Kontakt im Dry-Run — nur Request-Body zeigen.
    console.log(maskSecrets(JSON.stringify(requestBody, null, 2)));
    log("Dry-Run: keine Ressourcen angelegt, Secrets maskiert.");
    return { service: null, publicUrl: assumedUrl };
  }

  const existing = findServiceByName(await listServices(), serviceName);
  let service = existing;

  if (existing) {
    log(`Service "${serviceName}" existiert (${existing.id}) — setze ENV vollstaendig …`);
    await apiFetch(`/services/${existing.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(requestBody.envVars),
    });
  } else {
    log(`Lege Service "${serviceName}" an …`);
    const created = await apiFetch("/services", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    service = created.service ?? created;
    log(`Service angelegt: ${service.id}`);
  }

  const liveDeploy = await waitForLive(service.id);
  if (liveDeploy) log(`Deploy ${liveDeploy.id ?? ""} live.`);

  let publicUrl = publicServiceUrl(
    (await apiFetch(`/services/${service.id}`)).service ?? {},
  ) ?? assumedUrl;
  log(`Oeffentliche URL: ${publicUrl}`);
  return { service, publicUrl };
}

async function deployApp() {
  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) {
    console.error("[render-deploy] DATABASE_URL fehlt (Neon-Connection-String).");
    process.exit(2);
  }
  const dbCheck = validateDatabaseUrl(databaseUrl);
  if (!dbCheck.ok) {
    console.error(`[render-deploy] DATABASE_URL ungueltig: ${dbCheck.reason}`);
    process.exit(2);
  }
  log("DATABASE_URL-Format gueltig (Fail-Fast-Check).");

  if (migrate) {
    log("Fuehre Drizzle-Migrationen gegen DATABASE_URL aus …");
    const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: dbCheck.url },
    });
    if (result.status !== 0) {
      console.error("[render-deploy] Migrationen fehlgeschlagen.");
      process.exit(1);
    }
  }

  const serviceName = env("RENDER_SERVICE_NAME", "cybersarah-control-center");
  const jwtSecret = env("JWT_SECRET", randomUUID().replace(/-/g, ""));

  const buildEnv = (baseUrl) =>
    buildServiceEnv({
      databaseUrl: dbCheck.url,
      appBaseUrl: baseUrl,
      allowedOrigins: `${baseUrl},https://app.cybersarah-ki.com,https://www.cybersarah-ki.com`,
      jwtSecret,
      metricsToken: env("METRICS_TOKEN"),
      openAiApiKey: env("OPENAI_API_KEY"),
      stripeSecretKey: env("STRIPE_SECRET_KEY"),
      stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
      oauthServerUrl: env("OAUTH_SERVER_URL"),
      ownerOpenId: env("OWNER_OPEN_ID"),
      adminEmail: env("ADMIN_EMAIL"),
      stripeMode: env("STRIPE_MODE"),
      stripePriceLookupKey: env("STRIPE_PRICE_LOOKUP_KEY"),
      stripeProductId: env("STRIPE_PRICE_ID"),
      trustProxy: env("TRUST_PROXY", "1"),
    });

  const { service, publicUrl } = await upsertService({
    serviceName,
    envLines: buildEnv(`https://${serviceName}.onrender.com`),
  });

  if (!service) return; // Dry-Run

  // Phase 2: APP_BASE_URL/APP_ALLOWED_ORIGINS mit der echten Domain patchen,
  // falls Render den Standard-Subdomain-Namen veraendert hat.
  if (publicUrl !== `https://${serviceName}.onrender.com`) {
    log("Patche ENV mit der echten onrender-Domain …");
    await apiFetch(`/services/${service.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(
        buildServiceCreateRequest({ serviceName, envLines: buildEnv(publicUrl) }).envVars,
      ),
    });
    await waitForLive(service.id);
  }

  await verifyPublic(publicUrl, "/api/health");
  log(`Deployment abgeschlossen: ${publicUrl} (Web + API)`);
  log("Naechste Schritte: Custom Domain app.cybersarah-ki.com (Phase 5).");
}

async function deployWorkspace() {
  const serviceName = env("RENDER_WORKSPACE_SERVICE_NAME", "cybersarah-workspace");
  const serviceAccessToken = env("SERVICE_ACCESS_TOKEN", "");
  if (!serviceAccessToken) {
    console.error(
      "[render-deploy] SERVICE_ACCESS_TOKEN fehlt — der Workspace-Service verweigert in Produktion ohne Token den Start.",
    );
    process.exit(2);
  }

  const buildEnv = (allowedOrigin, previewUrl) =>
    buildWorkspaceEnv({ serviceAccessToken, allowedOrigin, previewPublicBaseUrl: previewUrl });

  const { service, publicUrl } = await upsertService({
    serviceName,
    rootDir: "workspace-service",
    healthCheckPath: "/api/v1/health",
    envLines: buildEnv(`https://${serviceName}.onrender.com`, ""),
  });

  if (!service) return; // Dry-Run

  if (publicUrl !== `https://${serviceName}.onrender.com`) {
    log("Patche Workspace-ENV mit der echten onrender-Domain …");
    await apiFetch(`/services/${service.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(
        buildServiceCreateRequest({
          serviceName,
          rootDir: "workspace-service",
          healthCheckPath: "/api/v1/health",
          envLines: buildEnv(`${publicUrl},https://app.cybersarah-ki.com`, `${publicUrl}/preview`),
        }).envVars,
      ),
    });
    await waitForLive(service.id);
  }

  await verifyPublic(publicUrl, "/api/v1/health");
  log(`Workspace-Deployment abgeschlossen: ${publicUrl}`);
  log(
    "Hinweis: WORKSPACES_DIR liegt auf Render Free auf ephemeraler Disk — Persistent Disk ist ein bezahlter Owner-Schritt.",
  );
}

async function main() {
  const keyCheck = validateRenderApiKey(env("RENDER_API_KEY", ""));
  if (!keyCheck.ok) {
    console.error(`[render-deploy] RENDER_API_KEY ungueltig: ${keyCheck.reason}`);
    process.exit(2);
  }
  log("API-Key-Format gueltig.");

  if (workspace) return deployWorkspace();
  return deployApp();
}

main().catch((error) => {
  console.error(`[render-deploy] ${maskSecrets(error.message)}`);
  process.exit(1);
});
