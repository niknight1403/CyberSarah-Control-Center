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
  pickFreshDeploy,
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
const domain = args.has("--domain");

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
    // Sprint-84-Diagnose: Welche Anfrage schlug fehl? (Methode + Pfad)
    throw new Error(`[${options.method ?? "GET"} ${path}] ${renderApiError(response.status, text)}`);
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
 * Sprint 73 (Stale-Read-Fix) + Sprint-85-Follow-up (False-Green-Fix):
 * Gewartet wird auf einen ECHTEN neuen Deploy. Frueher genuegte "ein Deploy
 * mit anderer ID als der letzte" — das konnte ein BELIEBIGER aelterer aus
 * den letzten 5 sein, waehrend list[0] (der alte, live Deploy) sofort als
 * Erfolg galt. Der Health-Check lief dann gegen die ALTE Instanz → false
 * gruen. Jetzt: Vor dem ENV-PUT wird deployIdsSnapshot() gezogen; "frisch"
 * ist der neueste Listeneintrag ausserhalb des Snapshots (pickFreshDeploy),
 * und danach wird GEZIELT dieser konkrete Deploy per ID beobachtet, bis er
 * live ist oder fehlschlaegt. Erscheint kein neuer Deploy (ENV-identischer
 * PUT), wird nach 2 Minuten explizit ein Deploy angestossen.
 */
async function deployIdsSnapshot(serviceId) {
  const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=5`);
  if (!Array.isArray(deploys)) return new Set();
  return new Set(deploys.map((entry) => (entry?.deploy ?? entry)?.id).filter(Boolean));
}

async function waitForLive(serviceId, beforeDeployIds = null, timeoutMs = 25 * 60 * 1000) {
  const started = Date.now();
  const hasSnapshot = beforeDeployIds instanceof Set && beforeDeployIds.size > 0;
  let watchDeployId = null;
  let noNewDeployPolls = 0;
  while (Date.now() - started < timeoutMs) {
    // Sobald der neue Deploy identifiziert ist: gezielt SEINEN Status abfragen
    // (GET /deploys/{id}) — nie mehr list[0] vertrauen.
    if (watchDeployId) {
      const deploy = await apiFetch(`/services/${serviceId}/deploys/${watchDeployId}`);
      const current = deploy?.deploy ?? deploy;
      const status = current?.status ?? "unbekannt";
      log(`Deploy-Status (${watchDeployId}): ${status}`);
      if (status === "live") return current;
      if (status === "build_failed" || status === "update_failed" || status === "pre_deploy_failed") {
        throw new Error("Build/Update fehlgeschlagen — Render-Logs pruefen (APP_ALLOWED_ORIGINS, DATABASE_URL, WORKSPACE_DATABASE_URL).");
      }
      await new Promise((resolve) => setTimeout(resolve, 20000));
      continue;
    }

    const deploys = await apiFetch(`/services/${serviceId}/deploys?limit=5`);
    const list = Array.isArray(deploys)
      ? deploys.map((entry) => entry?.deploy ?? entry)
      : [];
    // Neuer Service (ohne Snapshot): der neueste Deploy ist der gesuchte.
    const fresh = hasSnapshot ? pickFreshDeploy(list, beforeDeployIds) : (list[0] ?? null);
    if (!fresh) {
      if (!hasSnapshot) {
        log("Warte auf den ersten Deploy des neuen Services …");
        await new Promise((resolve) => setTimeout(resolve, 20000));
        continue;
      }
      noNewDeployPolls += 1;
      if (noNewDeployPolls >= 6) {
        // ENV-identischer PUT loest keinen Deploy aus. Der aktuelle Commit
        // muss aber trotzdem gebaut werden — deshalb expliziter Trigger.
        log("Kein neuer Deploy durch ENV-Update — stoesse Deploy des aktuellen Commits explizit an.");
        const triggered = await apiFetch(`/services/${serviceId}/deploys`, { method: "POST" });
        const triggeredDeploy = triggered?.deploy ?? triggered;
        watchDeployId = triggeredDeploy?.id ?? null;
        if (watchDeployId) {
          log(`Deploy angestossen: ${watchDeployId}`);
          continue;
        }
        // POST lieferte keine ID: ueber naechste Liste identifizieren.
        await new Promise((resolve) => setTimeout(resolve, 20000));
        continue;
      }
      log("Warte auf neuen Deploy nach ENV-Update …");
      await new Promise((resolve) => setTimeout(resolve, 20000));
      continue;
    }
    log(`Neuer Deploy erkannt: ${fresh.id}`);
    watchDeployId = fresh.id;
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
    const priorDeployIds = await deployIdsSnapshot(existing.id);
    await apiFetch(`/services/${existing.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(requestBody.envVars),
    });
    const liveDeploy = await waitForLive(existing.id, priorDeployIds);
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

/**
 * Sprint 84 (Phase 5 — Custom Domain): App-ENV-Builder, gemeinsam genutzt von
 * deployApp() und deployCustomDomain(). APP_ALLOWED_ORIGINS umfasst immer
 * Basis-URL, Custom Domain, www, localhost-Varianten und Capacitor.
 */
function makeAppEnvBuilder(databaseUrl) {
  const jwtSecret = env("JWT_SECRET", randomUUID().replace(/-/g, ""));

  const workspaceServiceUrl = env("WORKSPACE_SERVICE_URL", "");
  const workspaceServiceToken = env("WORKSPACE_SERVICE_TOKEN", "");
  const workspaceExtra = [];
  if (workspaceServiceUrl) workspaceExtra.push(`WORKSPACE_SERVICE_URL=${workspaceServiceUrl}`);
  if (workspaceServiceToken) workspaceExtra.push(`WORKSPACE_SERVICE_TOKEN=${workspaceServiceToken}`);

  // Sprint 367: Publishing-Tokens via GitHub Secrets — nur gesetzt, wenn das
  // Secret existiert (Modus-Aufloesung laesst Plattformen ohne Token im
  // ehrlichen Sandbox-Modus statt mit leerem Token zu scheitern).
  // Sprint 369: Optionale KI-Provider-Keys (z. B. Hugging Face fuer den
  // Model-Router) — nur gesetzt, wenn das GitHub-Secret existiert.
  const aiProviderExtra = [];
  for (const key of ["AI_HUGGINGFACE_API_KEY", "HF_TOKEN"]) {
    const value = env(key, "").trim();
    if (value) aiProviderExtra.push(`${key}=${value}`);
  }

  const publishingExtra = [];
  for (const key of [
    "X_PUBLISH_TOKEN",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
    "X_REFRESH_TOKEN",
    "LINKEDIN_PUBLISH_TOKEN",
    "LINKEDIN_PUBLISH_USER_URN",
    "THREADS_PUBLISH_TOKEN",
    "THREADS_PUBLISH_USER_ID",
    "INSTAGRAM_PUBLISH_TOKEN",
    "INSTAGRAM_PUBLISH_USER_ID",
    "TIKTOK_PUBLISH_TOKEN",
    "PUBLIC_APP_ORIGIN",
  ]) {
    const value = env(key, "").trim();
    if (value) publishingExtra.push(`${key}=${value}`);
  }

  return (baseUrl) =>
    buildServiceEnv({
      databaseUrl,
      appBaseUrl: baseUrl,
      allowedOrigins: `${baseUrl},https://app.cybersarah-ki.com,https://www.cybersarah-ki.com,https://localhost,http://localhost,capacitor://localhost`,
      jwtSecret,
      metricsToken: env("METRICS_TOKEN"),
      openAiApiKey: env("OPENAI_API_KEY"),
      geminiApiKey: env("GEMINI_API_KEY"),
      // Sprint 108 (Zero-Cost-Router): Kostenlose Provider-Keys — werden
      // nur gesetzt, wenn das GitHub-Secret existiert (kein Deploy-Fehler
      // ohne Key, Router ignoriert inaktive Provider einfach).
      groqApiKey: env("GROQ_API_KEY"),
      openrouterApiKey: env("OPENROUTER_API_KEY"),
      stripeSecretKey: env("STRIPE_SECRET_KEY"),
      stripeWebhookSecret: env("STRIPE_WEBHOOK_SECRET"),
      oauthServerUrl: env("OAUTH_SERVER_URL"),
      ownerOpenId: env("OWNER_OPEN_ID"),
      adminEmail: env("ADMIN_EMAIL"),
      stripeMode: env("STRIPE_MODE"),
      stripePriceLookupKey: env("STRIPE_PRICE_LOOKUP_KEY"),
      stripeProductId: env("STRIPE_PRICE_ID"),
      trustProxy: env("TRUST_PROXY", "1"),
      extra: [...workspaceExtra, ...aiProviderExtra, ...publishingExtra],
    });
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
  const configuredPublicUrl = env("RENDER_PUBLIC_URL", "").replace(/\/$/, "");

  if (configuredPublicUrl && !/^https:\/\/[^/\s]+$/i.test(configuredPublicUrl)) {
    console.error(
      "[render-deploy] RENDER_PUBLIC_URL muss eine HTTPS-Basis-URL ohne Pfad sein.",
    );
    process.exit(2);
  }

  const initialPublicUrl =
    configuredPublicUrl || `https://${serviceName}.onrender.com`;

  const buildEnv = makeAppEnvBuilder(dbCheck.url);

  const { service, publicUrl } = await upsertService({
    serviceName,
    envLines: buildEnv(initialPublicUrl),

  });

  if (!service) return; // Dry-Run

  // Phase 2: APP_BASE_URL/APP_ALLOWED_ORIGINS mit der echten Domain patchen,
  // falls Render den Standard-Subdomain-Namen veraendert hat.
  if (!configuredPublicUrl && publicUrl !== `https://${serviceName}.onrender.com`) {
  log("Patche ENV mit der echten onrender-Domain …");
    const patchBeforeDeployIds = await deployIdsSnapshot(service.id);
    await apiFetch(`/services/${service.id}/env-vars`, {
      method: "PUT",
      body: JSON.stringify(
        buildServiceCreateRequest({ serviceName, envLines: buildEnv(publicUrl) }).envVars,
      ),
    });
    await waitForLive(service.id, patchBeforeDeployIds);
  }

  const verifiedPublicUrl = configuredPublicUrl || publicUrl;

  await verifyPublic(verifiedPublicUrl, "/api/health");
  log(`Deployment abgeschlossen: ${verifiedPublicUrl} (Web + API)`);
  log("Naechste Schritte: Custom Domain app.cybersarah-ki.com (Phase 5).");
}

/**
 * Sprint 84 (Render-Phase 5): Custom Domain abschliessen.
 *
 * Ablauf:
 *  1. App-Service ermitteln und Custom Domain per Render-API anlegen
 *     (falls noch nicht vorhanden).
 *  2. Verifikationsstatus + benoetigte DNS-Records loggen; auf die
 *     automatische DNS-Verifikation warten (Render prueft selbst).
 *  3. Nach Verifikation: APP_BASE_URL auf die Custom-Domain patchen
 *     (onrender-Domain bleibt als Origin erlaubt) und Re-Deploy abwarten.
 *  4. Verifizieren: HTTPS-Health gegen die Custom-Domain, HTTP->HTTPS-
 *     Redirect-Verhalten und Workspace-CORS fuer die neue Origin.
 */
async function deployCustomDomain() {
  const serviceName = env("RENDER_SERVICE_NAME", "cybersarah-control-center");
  const domainName = env("CUSTOM_DOMAIN", "app.cybersarah-ki.com").trim().toLowerCase();
  const waitMinutes = Math.max(1, Number(env("CUSTOM_DOMAIN_WAIT_MINUTES", "15")) || 15);
  const databaseUrl = env("DATABASE_URL", "");
  const dbCheck = validateDatabaseUrl(databaseUrl);
  if (!dbCheck.ok) {
    throw new Error(`DATABASE_URL ungueltig: ${dbCheck.reason}`);
  }

  const service = findServiceByName(await listServices(), serviceName);
  if (!service) throw new Error(`Service "${serviceName}" nicht gefunden.`);

  // 1) Bestehende Custom Domains listen (Render-API: /custom-domains)
  const existingRaw = await apiFetch(`/services/${service.id}/custom-domains?limit=100`);
  const existing = (Array.isArray(existingRaw) ? existingRaw : []).map(
    (e) => e?.customDomain ?? e?.domain ?? e,
  );
  let domain = existing.find((d) => d?.name?.toLowerCase() === domainName) ?? null;
  if (!domain) {
    log(`Lege Custom Domain ${domainName} fuer "${serviceName}" an …`);
    const created = await apiFetch(`/services/${service.id}/custom-domains`, {
      method: "POST",
      body: JSON.stringify({ name: domainName }),
    });
    domain = created?.customDomain ?? created?.domain ?? created;
    log(`Domain angelegt: ${domain?.id ?? "unbekannte ID"}`);
  } else {
    log(`Custom Domain ${domainName} existiert bereits (ID ${domain?.id ?? "?"}).`);
  }

  // 2) Verifikationsstatus + DNS-Anleitung (Status: verified | unverified)
  const printDomain = (d) => {
    const verification = d?.verificationData ?? {};
    log(
      `Domain ${d?.name}: Status=${d?.verificationStatus ?? "unverified"} | Typ=${d?.domainType ?? "?"}` +
        (d?.redirectForName ? ` | redirectForName=${d.redirectForName}` : ""),
    );
    if (verification?.dnsName || verification?.dnsValue) {
      log(`  DNS-Record: ${verification.dnsType ?? "CNAME"} ${verification.dnsName ?? domainName} -> ${verification.dnsValue ?? "?"}`);
    }
  };
  printDomain(domain);

  // Manuellen DNS-Verifikations-Check anstossen (Render-API: /verify, 202).
  // Noetig, wenn die Domain vor DNS-Aenderungen angelegt wurde und die
  // automatische Hintergrunds-Verifikation sie nicht erfasst hat.
  if ((domain?.verificationStatus ?? "unverified") !== "verified") {
    const idOrName = encodeURIComponent(domain?.id ?? domainName);
    await apiFetch(`/services/${service.id}/custom-domains/${idOrName}/verify`, { method: "POST" });
    log("DNS-Verifikation manuell angestossen (POST /verify).");
  }

  const deadline = Date.now() + waitMinutes * 60_000;
  while ((domain?.verificationStatus ?? "unverified") !== "verified" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    // Abruf per Name oder ID (customDomainNameOrID-Pfadparameter)
    const idOrName = encodeURIComponent(domain?.id ?? domainName);
    const fetched = await apiFetch(`/services/${service.id}/custom-domains/${idOrName}`);
    domain = fetched?.customDomain ?? fetched?.domain ?? fetched;
    log(`Verifikations-Status: ${domain?.verificationStatus ?? "unverified"}`);
  }
  if (domain?.verificationStatus !== "verified") {
    throw new Error(
      `Domain ${domainName} nach ${waitMinutes} Minuten nicht verifiziert — DNS-Records beim Provider setzen (siehe oben) und den Workflow erneut ausloesen.`,
    );
  }
  log(`Domain verifiziert: https://${domainName}`);

  // 3) APP_BASE_URL auf die Custom-Domain patchen (Produktiv-URL), onrender bleibt Origin
  const customUrl = `https://${domainName}`;
  const buildEnv = makeAppEnvBuilder(dbCheck.url);
  const patchedOrigins = `${customUrl},https://${serviceName}.onrender.com,https://app.cybersarah-ki.com,https://www.cybersarah-ki.com,https://localhost,http://localhost,capacitor://localhost`;
  const patchedEnvLines = buildEnv(customUrl).map((line) =>
    line.startsWith("APP_ALLOWED_ORIGINS=") ? `APP_ALLOWED_ORIGINS=${patchedOrigins}` : line,
  );
  const patchBeforeDeployIds = await deployIdsSnapshot(service.id);
  await apiFetch(`/services/${service.id}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(
      buildServiceCreateRequest({
        serviceName,
        envLines: patchedEnvLines,
      }).envVars,
    ),
  });
  await waitForLive(service.id, patchBeforeDeployIds);

  // 4) Verifikation gegen die produktive URL
  await verifyPublic(customUrl, "/api/health");

  // HTTP -> HTTPS Redirect pruefen (Render leitet automatisch um)
  const httpProbe = await fetch(`http://${domainName}/api/health`, {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const redirectCode = httpProbe?.status ?? "unreachable";
  const redirectTarget = httpProbe?.headers?.get("location") ?? "—";
  log(`HTTP→HTTPS: ${redirectCode} → ${redirectTarget}`);

  // Workspace-CORS: Health mit Origin-Header der Custom-Domain abfragen
  const workspaceUrl = env("WORKSPACE_SERVICE_URL", `https://${env("RENDER_WORKSPACE_SERVICE_NAME", "cybersarah-workspace")}.onrender.com`).replace(/\/$/, "");
  const corsProbe = await fetch(`${workspaceUrl}/api/v1/health`, {
    headers: { Origin: customUrl, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const allowOrigin = corsProbe?.headers?.get("access-control-allow-origin") ?? "nicht gesetzt";
  log(`Workspace-CORS fuer ${customUrl}: ${allowOrigin}`);
  if (corsProbe?.ok && allowOrigin === "nicht gesetzt") {
    log("Hinweis: Access-Control-Allow-Origin fehlt auf /api/v1/health (CORS ggf. nur auf authentifizierten Routen aktiv).");
  }

  log("Sprint 84 abgeschlossen: Custom Domain live, produktive URL verifiziert.");
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
  // Sprint 85: zusaetzlich die Capacitor-Android-Origins (siehe
  // lib/allowed-origins-logic.ts) — ohne sie blockiert dieser Service jeden
  // direkten Repository-Connect-Call aus der APK mit "Failed to fetch".
  const appServiceName = env("RENDER_SERVICE_NAME", "cybersarah-control-center");
  const defaultAllowedOrigins = `https://${appServiceName}.onrender.com,https://app.cybersarah-ki.com,https://www.cybersarah-ki.com,https://localhost,capacitor://localhost,http://localhost`;
  const allowedOrigin = env("WORKSPACE_ALLOWED_ORIGIN", defaultAllowedOrigins);

  // Sprint 85: WORKSPACE_STORAGE_PERSISTENT kommt aus dem Workflow-Umfeld
  // (GitHub-Secret, Default "false"). Bewusst NICHT per Dashboard setzen —
  // das naechste PUT /env-vars dieses Skripts wuerde es ueberschreiben.
  const storagePersistent = env("WORKSPACE_STORAGE_PERSISTENT", "false").trim() || "false";
  // Sprint-85-Follow-up: KOSTENLOSE Persistenz ueber Neon-Postgres (gleiche
  // DB wie die Haupt-App, eigenes Schema workspace_service). Ohne die URL
  // bleibt der Service ephemer — Health meldet das ehrlich.
  const workspaceDatabaseUrl = env("WORKSPACE_DATABASE_URL", "").trim();
  const extraEnv = [`WORKSPACE_STORAGE_PERSISTENT=${storagePersistent}`];
  if (workspaceDatabaseUrl) extraEnv.push(`WORKSPACE_DATABASE_URL=${workspaceDatabaseUrl}`);
  // Sprint 108 (Zero-Cost-Router): Keys nur anhängen, wenn gesetzt — sonst
  // ueberschreibt das ENV-PUT bestaende Werte aus dem Render-Dashboard.
  const groqApiKey = env("GROQ_API_KEY", "").trim();
  if (groqApiKey) extraEnv.push(`GROQ_API_KEY=${groqApiKey}`);
  const openrouterApiKey = env("OPENROUTER_API_KEY", "").trim();
  if (openrouterApiKey) extraEnv.push(`OPENROUTER_API_KEY=${openrouterApiKey}`);
  const buildEnv = (allowedOrigin, previewUrl) =>
    buildWorkspaceEnv({
      serviceAccessToken,
      allowedOrigin,
      previewPublicBaseUrl: previewUrl,
      extra: extraEnv,
    });

  const { service, publicUrl } = await upsertService({
    serviceName,
    rootDir: "workspace-service",
    healthCheckPath: "/api/v1/health",
    envLines: buildEnv(allowedOrigin, ""),
  });

  if (!service) return; // Dry-Run

  if (publicUrl !== `https://${serviceName}.onrender.com`) {
    log("Patche Workspace-ENV mit der echten onrender-Domain …");
    const wsPatchBeforeDeployIds = await deployIdsSnapshot(service.id);
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
    await waitForLive(service.id, wsPatchBeforeDeployIds);
  }

  await verifyPublic(publicUrl, "/api/v1/health");
  // Sprint-85-Follow-up: Der Health-Check allein prueft nur HTTP 200 — die
  // ALTE Instanz erfuellt das auch. Dieses Gate verifiziert den INHALT:
  // Bei gesetzter WORKSPACE_DATABASE_URL muss der neue Build den Postgres-
  // Persistenz-Modus melden, sonst schlaegt der Deploy sichtbar fehl.
  const expectPostgres = Boolean(workspaceDatabaseUrl);
  const healthResponse = await fetch(`${publicUrl}/api/v1/health`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!healthResponse.ok) throw new Error(`Health-Antwort ${healthResponse.status} — Deploy unvollstaendig.`);
  const health = await healthResponse.json().catch(() => null);
  const storage = health?.storage ?? null;
  if (expectPostgres && (storage?.mode !== "postgres" || storage?.persistent !== true)) {
    throw new Error(
      `Health meldet NICHT den Postgres-Persistenz-Modus (bekam: ${JSON.stringify(storage)}). ` +
        "Erwartet: mode=postgres, persistent=true — Render-Logs und Neon-Erreichbarkeit pruefen.",
    );
  }
  log(`Speicher-Modus verifiziert: ${JSON.stringify(storage)}`);
  log(`Workspace-Deployment abgeschlossen: ${publicUrl}`);
  log(
    `Hinweis: WORKSPACE_STORAGE_PERSISTENT=${storagePersistent}, WORKSPACE_DATABASE_URL ${workspaceDatabaseUrl ? "gesetzt (Neon-Persistenz)" : "NICHT gesetzt (ephemeral)"}. ` +
      "Der Service meldet den tatsaechlich verifizierten Modus konservativ im Health-Endpoint.",
  );
}

async function main() {
  const keyCheck = validateRenderApiKey(env("RENDER_API_KEY", ""));
  if (!keyCheck.ok) {
    console.error(`[render-deploy] RENDER_API_KEY ungueltig: ${keyCheck.reason}`);
    process.exit(2);
  }
  log("API-Key-Format gueltig.");

  if (domain) return deployCustomDomain();
  if (workspace) return deployWorkspace();
  return deployApp();
}

main().catch((error) => {
  console.error(`[render-deploy] ${maskSecrets(error.message)}`);
  process.exit(1);
});
