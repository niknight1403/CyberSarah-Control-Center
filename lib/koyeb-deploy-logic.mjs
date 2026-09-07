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
          health_checks: [{ type: "http", port, path: "/api/health" }],
        },
      },
    ],
  };
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
    .replace(/(password=)[^&\s]+/gi, "$1***");
}
