/**
 * Deterministische Logik fuer das Render-Deployment (Koyeb-Ersatz,
 * Hetzner-Exit Phase 4). Das Skript scripts/render-deploy.mjs nutzt
 * diese Funktionen; der Render-API-Key wird ausschliesslich aus der
 * Umgebung (RENDER_API_KEY) gelesen und niemals committet.
 *
 * Plattform-Entscheidung (2026-09, 100 % kostenfrei):
 *  - Render Free Plan: Web-Services (Docker), 750 Instanz-Stunden/Monat,
 *    Schlaf nach 15 Min. Inaktivitaet, keine Zahlungsdaten noetig.
 *  - Neon Free Tier: PostgreSQL (512 MB), autosuspend — Render Free
 *    Postgres faellt weg, weil es nach 30 Tagen geloescht wird.
 *  - Render Cron Jobs sind kostenpflichtig — Scheduling bleibt auesserhalb.
 */

/**
 * Bereinigt und validiert einen Render-API-Key (Format rnd_…).
 * Haertung gegen Fliesstext und falsche Tokens (Issue-#3-Lehre).
 */
export function validateRenderApiKey(raw) {
  if (typeof raw !== "string") {
    return { ok: false, reason: "API-Key ist kein String." };
  }
  const key = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\$['"]?/, "")
    .trim();
  if (key.length === 0) {
    return { ok: false, reason: "API-Key ist leer (RENDER_API_KEY nicht gesetzt?)." };
  }
  if (/\s/.test(key)) {
    return {
      ok: false,
      reason: "API-Key enthaelt Leerzeichen — vermutlich Fliesstext statt Key.",
    };
  }
  if (!/^rnd_[A-Za-z0-9]{10,}$/.test(key)) {
    return {
      ok: false,
      reason:
        "Key hat kein gueltiges Render-Format — Render-API-Keys beginnen mit rnd_ (Account Settings → API Keys).",
    };
  }
  return { ok: true, key };
}

/**
 * Validiert eine DATABASE_URL fuer den Render-Einsatz (fail-fast vor
 * Migrationen und Service-Anlage). localhost ist von Render aus
 * unerreichbar; Free-Postgres von Render selbst faellt nach 30 Tagen
 * weg — deshalb Neon (postgresql://…neon.tech/…).
 */
export function validateDatabaseUrl(raw) {
  if (typeof raw !== "string") {
    return { ok: false, reason: "DATABASE_URL ist kein String." };
  }
  const url = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (url.length === 0) {
    return { ok: false, reason: "DATABASE_URL ist leer." };
  }
  if (/\s/.test(url)) {
    return {
      ok: false,
      reason: "DATABASE_URL enthaelt Leerzeichen — Fliesstext statt Connection-String.",
    };
  }
  if (!/^(postgres|postgresql):\/\//.test(url)) {
    return {
      ok: false,
      reason:
        "DATABASE_URL muss mit postgres:// oder postgresql:// beginnen (Neon: Connection-String aus der Console kopieren).",
    };
  }
  const host = url
    .replace(/^(postgres|postgresql):\/\//, "")
    .split("?")[0]
    .split("@")
    .pop()
    .split(/[/:]/)[0];
  if (!host) {
    return { ok: false, reason: "DATABASE_URL enthaelt keinen Hostnamen." };
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return {
      ok: false,
      reason:
        "DATABASE_URL zeigt auf localhost — vom Render-Dienst nicht erreichbar. Neon-Connection-String verwenden.",
    };
  }
  return { ok: true, url };
}

/**
 * Baut die ENV-Zeilen (KEY=VALUE) fuer den API+Web-Service.
 * PORT wird bewusst NICHT gesetzt: Render routet auf den vom
 * Dockerfile gebundenen Port. Werte duerfen keine Newlines enthalten.
 *
 * @param {object} env
 * @param {string} env.databaseUrl
 * @param {string} env.appBaseUrl
 * @param {string} env.allowedOrigins
 * @param {string} env.jwtSecret
 * @param {string} [env.metricsToken]
 * @param {string} [env.openAiApiKey]
 * @param {string} [env.stripeSecretKey]
 * @param {string} [env.stripeWebhookSecret]
 * @param {string} [env.oauthServerUrl]
 * @param {string} [env.ownerOpenId]
 * @param {string} [env.adminEmail]
 * @param {string} [env.stripeMode]
 * @param {string} [env.stripePriceLookupKey]
 * @param {string} [env.stripeProductId]
 * @param {string} [env.trustProxy]
 * @param {string[]} [env.extra]
 * @returns {string[]}
 */
export function buildServiceEnv({
  databaseUrl,
  appBaseUrl,
  allowedOrigins,
  jwtSecret,
  metricsToken,
  openAiApiKey,
  stripeSecretKey,
  stripeWebhookSecret,
  oauthServerUrl,
  ownerOpenId,
  adminEmail,
  stripeMode,
  stripePriceLookupKey,
  stripeProductId,
  trustProxy,
  extra = /** @type {string[]} */ ([]),
}) {
  const required = {
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    APP_BASE_URL: appBaseUrl,
    APP_ALLOWED_ORIGINS: allowedOrigins,
    JWT_SECRET: jwtSecret,
  };
  for (const [key, value] of Object.entries(required)) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Pflicht-ENV fehlt: ${key}`);
    }
  }
  const optional = {};
  if (metricsToken) optional.METRICS_TOKEN = metricsToken;
  if (openAiApiKey) optional.OPENAI_API_KEY = openAiApiKey;
  if (stripeSecretKey) optional.STRIPE_SECRET_KEY = stripeSecretKey;
  if (stripeWebhookSecret) {
    optional.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;
  }
  if (oauthServerUrl) optional.OAUTH_SERVER_URL = oauthServerUrl;
  if (ownerOpenId) optional.OWNER_OPEN_ID = ownerOpenId;
  if (adminEmail) optional.ADMIN_EMAIL = adminEmail;
  if (stripeMode) optional.STRIPE_MODE = stripeMode;
  if (stripePriceLookupKey) {
    optional.STRIPE_PRICE_LOOKUP_KEY = stripePriceLookupKey;
  }
  if (stripeProductId) optional.STRIPE_PRICE_ID = stripeProductId;
  if (trustProxy) optional.TRUST_PROXY = trustProxy;
  return envLinesFromMap({ ...optional, ...required }, extra);
}

/**
 * Baut die ENV-Zeilen fuer den Workspace-Service (Port 8787).
 * SERVICE_ACCESS_TOKEN ist Pflicht: Der Dienst verweigert in
 * Produktion den Start ohne Token.
 *
 * @param {object} env
 * @param {string} [env.serviceAccessToken]
 * @param {string} [env.allowedOrigin]
 * @param {string} [env.previewPublicBaseUrl]
 * @param {string[]} [env.extra]
 * @returns {string[]}
 */
export function buildWorkspaceEnv({
  serviceAccessToken,
  allowedOrigin,
  previewPublicBaseUrl,
  extra = /** @type {string[]} */ ([]),
}) {
  if (typeof serviceAccessToken !== "string" || serviceAccessToken.trim() === "") {
    throw new Error("Pflicht-ENV fehlt: SERVICE_ACCESS_TOKEN");
  }
  const map = { SERVICE_ACCESS_TOKEN: serviceAccessToken };
  if (allowedOrigin) map.ALLOWED_ORIGIN = allowedOrigin;
  if (previewPublicBaseUrl) map.PREVIEW_PUBLIC_BASE_URL = previewPublicBaseUrl;
  map.NODE_ENV = "production";
  map.PORT = "8787";
  return envLinesFromMap(map, extra);
}

/** KEY=VALUE-Zeilen aus einer Map (+ extra-Zeilen), mit Newline-Schutz. */
function envLinesFromMap(map, extra) {
  const lines = Object.entries(map).map(([key, value]) => {
    if (/[\r\n]/.test(String(value))) {
      throw new Error(`ENV-Wert fuer ${key} enthaelt Zeilenumbrueche.`);
    }
    return `${key}=${value}`;
  });
  for (const entry of extra) {
    if (typeof entry !== "string" || !/^[A-Z_0-9]+=/.test(entry)) {
      throw new Error("extra-ENV muss KEY=VALUE-Zeilen enthalten.");
    }
    if (/[\r\n]/.test(entry)) {
      throw new Error(`extra-ENV enthaelt Zeilenumbrueche: ${entry.split("=")[0]}`);
    }
    lines.push(entry);
  }
  return lines;
}

/**
 * KEY=VALUE-Zeilen → Render-envVars-Objekte [{key, value}].
 * Render erwartet ein vollstaendiges Array (PUT env-vars ersetzt alles).
 */
export function envVarsFromLines(lines) {
  if (!Array.isArray(lines)) {
    throw new Error("envLines muss ein Array sein.");
  }
  return lines.map((line) => {
    const index = line.indexOf("=");
    if (index <= 0) {
      throw new Error(`ENV-Zeile ohne '=': ${String(line).slice(0, 40)}`);
    }
    const key = line.slice(0, index);
    if (!/^[A-Z_0-9]+$/.test(key)) {
      throw new Error(`Ungueltiger ENV-Name: ${key}`);
    }
    return { key, value: line.slice(index + 1) };
  });
}

/**
 * Baut den Request-Body fuer POST /v1/services (Render-API).
 * Der Kombidienst serviert Web-Export und API aus einem Docker-Image.
 * healthCheckPath bleibt optional: Render Free unterstuetzt keine
 * Custom-Health-Checks — das Skript verifiziert /api/health oeffentlich selbst.
 *
 * @param {object} options
 * @param {string} options.serviceName
 * @param {string} [options.ownerId] Render-Workspace-ID — beim Anlegen Pflicht
 * @param {string} [options.repository]
 * @param {string} [options.branch]
 * @param {string} [options.rootDir]
 * @param {string} [options.plan]
 * @param {string} [options.region]
 * @param {string[]} [options.envLines]
 * @param {string} [options.autoDeploy]
 * @param {string} [options.healthCheckPath]
 * @returns {{
 *   type: string,
 *   name: string,
 *   ownerId?: string,
 *   repo: string,
 *   branch: string,
 *   autoDeploy: string,
 *   rootDir?: string,
 *   envVars: Array<{ key: string, value: string }>,
 *   serviceDetails: { runtime: string, plan: string, region: string, healthCheckPath?: string },
 * }}
 */
export function buildServiceCreateRequest({
  serviceName,
  ownerId = "",
  repository = "https://github.com/niknight1403/CyberSarah-Control-Center",
  branch = "main",
  rootDir,
  plan = "free",
  region = "frankfurt",
  envLines = /** @type {string[]} */ ([]),
  autoDeploy = "yes",
  healthCheckPath,
}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(serviceName)) {
    throw new Error("Service-Name nur aus Kleinbuchstaben, Ziffern und Bindestrichen.");
  }
  if (healthCheckPath && !healthCheckPath.startsWith("/")) {
    throw new Error("healthCheckPath muss mit '/' beginnen.");
  }
  if (rootDir && !/^[a-z0-9][a-z0-9/_-]*$/i.test(rootDir)) {
    throw new Error("rootDir enthaelt ungueltige Zeichen.");
  }
  const body = {
    type: "web_service",
    name: serviceName,
    // Render-API verlangt ownerID beim Anlegen eines Services (HTTP 400 sonst).
    ...(ownerId ? { ownerId } : {}),
    repo: repository,
    branch,
    autoDeploy,
    envVars: envVarsFromLines(envLines),
    serviceDetails: { runtime: "docker", plan, region },
  };
  if (rootDir) body.rootDir = rootDir;
  if (healthCheckPath) body.serviceDetails.healthCheckPath = healthCheckPath;
  return body;
}

/** Erkennt die oeffentliche URL aus einer Render-Service-Antwort. */
export function publicServiceUrl(service) {
  const url = service?.serviceDetails?.url;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return null;
  return url.replace(/\/$/, "");
}

/** Sortiert die Services einer Liste nach exaktem Namen (Idempotenz). */
export function findServiceByName(services, name) {
  if (!Array.isArray(services)) return null;
  return services.find((s) => s?.name === name && s?.type === "web_service") ?? null;
}

/** Uebersetzt Render-API-Fehler in lesbare deutsche Meldungen. */
export function renderApiError(status, bodyText) {
  const snippet = String(bodyText ?? "").slice(0, 200);
  if (status === 401) {
    return "Render lehnt den API-Key ab (401): ungueltig oder widerrufen. Neuen Key in den Account Settings erstellen und RENDER_API_KEY aktualisieren.";
  }
  if (status === 403) {
    return `Render verweigert den Zugriff (403): ${snippet}`;
  }
  if (status === 404) {
    return `Render-Ressource nicht gefunden (404): ${snippet}`;
  }
  if (status === 429) {
    return "Render Rate-Limit (429): kurz warten und erneut ausfuehren.";
  }
  return `Render-API-Fehler (HTTP ${status}): ${snippet}`;
}

/** Sensible ENV-Namen, deren Werte in jeder Ausgabe maskiert werden. */
export const SENSITIVE_ENV_KEYS = [
  "SERVICE_ACCESS_TOKEN",
  "METRICS_TOKEN",
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "AI_OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
];

/** Maskiert Secrets in Logs (KEY=VALUE-Zeilen, JSON-Values, DB-URLs, Token-Formate). */
export function maskSecrets(text) {
  return String(text ?? "")
    .replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/g, "$1***$2")
    .replace(/(postgres:\/\/[^:]+:)[^@]+(@)/g, "$1***$2")
    .replace(/(password=)[^&\s]+/gi, "$1***")
    .replace(new RegExp("\\b(" + SENSITIVE_ENV_KEYS.join("|") + ")=([^\\s\"]+)", "g"), "$1=***")
    .replace(
      new RegExp(
        '("key":\\s*"(?:' +
          SENSITIVE_ENV_KEYS.join("|") +
          ')",\\s*"value":\\s*")[^"]*',
        "g",
      ),
      "$1***",
    )
    .replace(/(rnd_)[A-Za-z0-9]{10,}/g, "$1***")
    .replace(/\bsk_(live|test)_[A-Za-z0-9]+/g, "sk_$1***")
    .replace(/\b(sk-[A-Za-z0-9_\-]{8,})[A-Za-z0-9_\-]*/g, "sk-***")
    .replace(/\b(whsec_)[A-Za-z0-9]+/g, "$1***")
    .replace(/\b(ghp_[A-Za-z0-9]+)\b/g, "ghp_***");
}

