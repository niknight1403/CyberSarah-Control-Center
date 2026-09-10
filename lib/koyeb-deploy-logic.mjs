/**
 * Deterministische Logik fuer das Koyeb-Deployment (Phase 4 des
 * Hetzner-Exits). Das Skript scripts/koyeb-deploy.mjs nutzt diese
 * Funktionen; der Koyeb-API-Token wird ausschliesslich aus der
 * Umgebung (KOYEB_TOKEN) gelesen und niemals committet.
 */

/** Bereinigt und validiert einen Koyeb-API-Token-Wert. */
export function validateKoyebToken(raw) {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Token ist kein String." };
  }
  const token = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\$['"]?/, "")
    .trim();
  if (token.length === 0) {
    return { ok: false, reason: "Token ist leer (KOYEB_TOKEN nicht gesetzt?)." };
  }
  if (/\s/.test(token)) {
    return {
      ok: false,
      reason: "Token enthaelt Leerzeichen — vermutlich Fliesstext statt Token.",
    };
  }
  if (!/^[A-Za-z0-9_\-\.]{30,}$/.test(token)) {
    return {
      ok: false,
      reason:
        "Token hat kein gueltiges Format (erlaubt: Buchstaben, Ziffern, _ - .).",
    };
  }
  return { ok: true, token };
}

/**
 * Validiert eine DATABASE_URL fuer den Koyeb-Einsatz (fail-fast vor
 * Migrationen und App-Anlage). localhost ist auf Koyeb unerreichbar.
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
      reason: "DATABASE_URL enthaelt Leerzeichen — Fließtext statt Connection-String.",
    };
  }
  const scheme = /^(postgres|postgresql):\/\//.test(url);
  if (!scheme) {
    return {
      ok: false,
      reason:
        "DATABASE_URL muss mit postgres:// oder postgresql:// beginnen (Koyeb-Database-Service: Connection-String der Konsole kopieren).",
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
        "DATABASE_URL zeigt auf localhost — vom Koyeb-Dienst nicht erreichbar. Koyeb-Database-Service-Connection-String verwenden.",
    };
  }
  return { ok: true, url };
}

/**
 * Baut die ENV-Liste fuer den API+Web-Kombidienst.
 * Reihenfolge deterministisch; Werte duerfen keine Newlines enthalten.
 * extra ist eine Liste zusaetzlicher "KEY=VALUE"-Zeilen.
 *
 * @param {object} env
 * @param {string} env.databaseUrl
 * @param {string} env.appBaseUrl
 * @param {string} env.allowedOrigins
 * @param {string} env.jwtSecret
 * @param {string} [env.metricsToken]
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
    PORT: "8000",
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
  const lines = Object.entries({ ...optional, ...required }).map(
    ([key, value]) => {
      if (/[\r\n]/.test(String(value))) {
        throw new Error(`ENV-Wert fuer ${key} enthaelt Zeilenumbrueche.`);
      }
      return `${key}=${value}`;
    },
  );
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
 * Baut den Request-Body fuer POST /v1/apps (Koyeb-API).
 * Der Kombidienst serviert Web-Export und API auf Port 8000.
 */
export function buildAppCreateRequest({
  appName,
  serviceName = "api-web",
  repository = "niknight1403/CyberSarah-Control-Center",
  branch = "main",
  region = "fra",
  port = 8000,
  healthCheckPath = "/api/health",
  instanceType = "free",
  envList = /** @type {string[]} */ ([]),
}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(appName)) {
    throw new Error("App-Name nur aus Kleinbuchstaben, Ziffern und Bindestrichen.");
  }
  return {
    name: appName,
    services: [
      {
        name: serviceName,
        type: "web",
        definition: {
          builder: { type: "docker" },
          github: { repository, branch },
          env: envList,
          ports: [{ port, protocol: "http" }],
          routes: [{ path: "/" }],
          regions: [region],
          instance_type: instanceType,
          health_checks: [{ type: "http", port, path: healthCheckPath }],
        },
      },
    ],
  };
}

/**
 * Baut die ENV-Liste fuer den Workspace-Service (Port 8787).
 * SERVICE_ACCESS_TOKEN ist Pflicht: Der Dienst verweigert in Produktion
 * den Start ohne Token (alle Routes sind token-geschützt).
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
  if (
    typeof serviceAccessToken !== "string" ||
    serviceAccessToken.trim() === ""
  ) {
    throw new Error("Pflicht-ENV fehlt: SERVICE_ACCESS_TOKEN");
  }
  const optional = { SERVICE_ACCESS_TOKEN: serviceAccessToken };
  if (allowedOrigin) optional.ALLOWED_ORIGIN = allowedOrigin;
  if (previewPublicBaseUrl) {
    optional.PREVIEW_PUBLIC_BASE_URL = previewPublicBaseUrl;
  }
  optional.NODE_ENV = "production";
  optional.PORT = "8787";
  const lines = Object.entries(optional).map(([key, value]) => {
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

/** Erkennt die oeffentliche URL aus einer App-Antwort der Koyeb-API. */
export function publicUrlFromApp(app) {
  const domains = app?.domains ?? [];
  const preferred = domains.find((d) => d.name?.includes(".koyeb.app"));
  const domain = preferred ?? domains[0];
  if (!domain?.name) return null;
  return `https://${domain.name.replace(/^https?:\/\//, "")}`;
}

/** Uebersetzt Koyeb-API-Fehler in lesbare deutsche Meldungen. */
export function koyebApiError(status, bodyText) {
  const snippet = String(bodyText ?? "").slice(0, 200);
  if (status === 401) {
    return "Koyeb lehnt den Token ab (401): ungueltig, widerrufen oder falsches Format. Neuen Token in der Konsole erstellen und KOYEB_TOKEN aktualisieren.";
  }
  if (status === 403) {
    return "Koyeb verweigert den Zugriff (403): Token ohne ausreichende Rechte.";
  }
  if (status === 404) {
    return `Koyeb-Ressource nicht gefunden (404): ${snippet}`;
  }
  if (status === 409) {
    return `Koyeb-Konflikt (409, z. B. Name existiert schon): ${snippet}`;
  }
  return `Koyeb-API-Fehler (HTTP ${status}): ${snippet}`;
}

/** Maskiert Datenbank-Passwoerter in Logs. */
export function maskSecrets(text) {
  return String(text ?? "")
    .replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/g, "$1***$2")
    .replace(/(password=)[^&\s]+/gi, "$1=***")
    .replace(/\b(SERVICE_ACCESS_TOKEN|METRICS_TOKEN|JWT_SECRET)=[^\s"\\]+/g, "$1=***");
}
