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

let cachedOwnerId = null;

/** Liefert die Render-Workspace-ID (ownerId) fuer POST /v1/services. */
async function resolveOwnerId() {
  if (cachedOwnerId) return cachedOwnerId;
  const envOwner = env("RENDER_OWNER_ID", "");
  const owners = await apiFetch("/owners?limit=20");
  const list = Array.isArray(owners) ? owners.map((entry) => entry.owner ?? entry) : [];
  const match =
    (envOwner && list.find((owner) => owner?.id === envOwner)) ||
    list.find((owner) => owner?.type === "individual" || owner?.type === "personal") ||
    list[0];
  if (!match?.id) {
    console.error("[render-deploy] Kein Render-Owner gefunden — RENDER_API_KEY pruefen.");
    process.exit(2);
  }
  cachedOwnerId = match.id;
  log(`Render-Owner: ${match.id} (${match.name ?? match.type ?? "unbekannt"})`);
  return cachedOwnerId;
}

async function listServices() {
  const data = await apiFetch("/services?limit=100&type=web_service");
  return Array.isArray(data) ? data.map((entry) => entry.service ?? entry) : [];
}

/**
 * Verfolgt einen konkreten Deploy bis live/failed (fuer explizit
 * angestossene Deploys mit bekannter ID).
 */
async function watchDeployToLive(serviceId, deploy) {
  const deadline = Date.now() + 25 * 60 * 1000;
  let latest = deploy;
  while (Date.now() - deadline < 0) {
    const status = latest?.status ?? "unbekannt";
    log(`Deploy-Status: ${status}`);
    if (status === "live") return latest;
    if (status === "build_failed" || status === "update_failed" || status === "pre_deploy_failed") {
      throw new Error("Build/Update fehlgeschlagen — Render-Logs pruefen.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20000));
    const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=1`);
    latest = Array.isArray(deploys) ? deploys[0]?.deploy ?? deploys[0] : latest;
  }
  throw new Error("Timeout beim Warten auf den Live-Deploy (25 Minuten).");
}

/**
 * Sprint 73 (Stale-Read-Fix): Direkt nach einem ENV-PUT ist der "letzte"
 * Deploy in der Render-API noch der ALTE, ggf. fehlgeschlagene Deploy —
 * waitForLive brach dann sofort mit update_failed ab, obwohl der neue
 * Deploy noch gar nicht existierte. Deshalb: Es wird explizit auf einen
 * Deploy mit NEUER ID gewartet (beforeDeployId) und nur deren Status
 * bewertet. Stoert der ENV-Patch keinen neuen Deploy an (ENV identisch),
 * wird nach 2 Minuten ohne neuen Deploy fortgefahren — der nachgelagerte
 * Health-Check ist der verbindliche Nachweis.
 */
async function waitForLive(serviceId, beforeDeployId = null, timeoutMs = 25 * 60 * 1000) {
  const started = Date.now();
  let newDeploySeen = beforeDeployId === null;
  let noNewDeployPolls = 0;
  while (Date.now() - started < timeoutMs) {
    const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=5`);
    const list = Array.isArray(deploys)
      ? deploys.map((entry) => entry?.deploy ?? entry)
      : [];
    if (!newDeploySeen) {
      const fresh = list.find((deploy) => deploy?.id && deploy.id !== beforeDeployId);
      if (!fresh) {
        noNewDeployPolls += 1;
        if (noNewDeployPolls >= 6) {
          // ENV-identischer PUT loest keinen Deploy aus. Der aktuelle Commit
          // muss aber trotzdem gebaut werden — deshalb expliziter Trigger.
          log("Kein neuer Deploy durch ENV-Update — stoesse Deploy des aktuellen Commits explizit an.");
          const triggered = await apiFetch(`/services/${serviceId}/deploys`, { method: "POST" });
          const triggeredDeploy = triggered?.deploy ?? triggered;
          const triggeredId = triggeredDeploy?.id ?? null;
          log(`Deploy angestossen: ${triggeredId ?? "unbekannte ID"}`);
          await new Promise((resolve) => setTimeout(resolve, 20000));
          const after = await apiFetch(`/services/${serviceId}/deploys?limit=1`);
          const afterLatest = Array.isArray(after) ? after[0]?.deploy ?? after[0] : null;
          const watchId = afterLatest?.id ?? triggeredId;
          const watch = watchId === triggeredId ? triggeredDeploy : afterLatest;
          return watchDeployToLive(serviceId, watch);
        }
        log("Warte auf neuen Deploy nach ENV-Update …");
        await new Promise((resolve) => setTimeout(resolve, 20000));
        continue;
      }
      newDeploySeen = true;
      log(`Neuer Deploy erkannt: ${fresh.id}`);
    }
    const latest = list[0] ?? null;
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

/** Liefert die ID des aktuell letzten Deploys (fuer den Stale-Read-Guard). */
async function latestDeployId(serviceId) {
  const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=1`);
  if (!Array.isArray(deploys) || deploys.length === 0) return null;
  return deploys[0]?.deploy?.id ?? deploys[0]?.id ?? null;
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
    const priorDeploys = await apiFetch(`/services/${existing.id}/deploys?limit=1`);
    const priorDeployId = Array.isArray(priorDeploys)
      ? priorDeploys[0]?.deploy?.id ?? priorDeploys[0]?.id ?? null
      : null;
    await apiFetch(`/services/${existing.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(requestBody.envVars),
    });
    const liveDeploy = await waitForLive(existing.id, priorDeployId);
    if (liveDeploy) log(`Deploy ${liveDeploy.id ?? ""} live.`);
    let publicUrl = publicServiceUrl((await apiFetch(`/services/${existing.id}`)).service ?? {}) ?? assumedUrl;
    log(`Oeffentliche URL: ${publicUrl}`);
    return { service: existing, publicUrl };
  }
  {
    log(`Lege Service "${serviceName}" an …`);
    const created = await apiFetch("/services", {
      method: "POST",
      body: JSON.stringify({ ...requestBody, ownerId: await resolveOwnerId() }),
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

  const workspaceServiceUrl = env("WORKSPACE_SERVICE_URL", "");
  const workspaceServiceToken = env("WORKSPACE_SERVICE_TOKEN", "");
  const workspaceExtra = [];
  if (workspaceServiceUrl) workspaceExtra.push(`WORKSPACE_SERVICE_URL=${workspaceServiceUrl}`);
  if (workspaceServiceToken) workspaceExtra.push(`WORKSPACE_SERVICE_TOKEN=${workspaceServiceToken}`);

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
      extra: workspaceExtra,
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
    const patchBeforeDeployId = await latestDeployId(service.id);
    await apiFetch(`/services/${service.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(
        buildServiceCreateRequest({ serviceName, envLines: buildEnv(publicUrl) }).envVars,
      ),
    });
    await waitForLive(service.id, patchBeforeDeployId);
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

  // Sprint 73: ALLOWED_ORIGIN muss die App-Domains enthalten — nicht die
  // eigene Workspace-URL (fuehrte zu "Origin ist nicht erlaubt" / CORS-Blockade).
  const appServiceName = env("RENDER_SERVICE_NAME", "cybersarah-control-center");
  const defaultAllowedOrigins = `https://${appServiceName}.onrender.com,https://app.cybersarah-ki.com,https://www.cybersarah-ki.com`;
  const allowedOrigin = env("WORKSPACE_ALLOWED_ORIGIN", defaultAllowedOrigins);

  const buildEnv = (allowedOrigin, previewUrl) =>
    buildWorkspaceEnv({ serviceAccessToken, allowedOrigin, previewPublicBaseUrl: previewUrl });

  const { service, publicUrl } = await upsertService({
    serviceName,
    rootDir: "workspace-service",
    healthCheckPath: "/api/v1/health",
    envLines: buildEnv(allowedOrigin, ""),
  });

  if (!service) return; // Dry-Run

  if (publicUrl !== `https://${serviceName}.onrender.com`) {
    log("Patche Workspace-ENV mit der echten onrender-Domain …");
    const wsPatchBeforeDeployId = await latestDeployId(service.id);
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
    await waitForLive(service.id, wsPatchBeforeDeployId);
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
