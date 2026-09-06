import "dotenv/config";
import mysql from "mysql2/promise";

const failures = [];
const required = [
  "APP_BASE_URL",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
];

for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} fehlt`);
}

const appBaseUrl = process.env.APP_BASE_URL?.trim() ?? "";
if (appBaseUrl && !appBaseUrl.startsWith("https://")) failures.push("APP_BASE_URL muss HTTPS verwenden");
if ((process.env.JWT_SECRET?.length ?? 0) < 32) failures.push("JWT_SECRET muss mindestens 32 Zeichen lang sein");
const stripeMode = process.env.STRIPE_MODE?.trim();
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
if (stripeMode === "live" && !stripeKey.startsWith("sk_live_")) failures.push("STRIPE_SECRET_KEY passt nicht zu STRIPE_MODE=live");
if (stripeMode === "test" && !stripeKey.startsWith("sk_test_")) failures.push("STRIPE_SECRET_KEY passt nicht zu STRIPE_MODE=test");
if (stripeMode !== "live" && stripeMode !== "test") failures.push("STRIPE_MODE muss live oder test sein");
if (process.env.STRIPE_PRICE_ID && !process.env.STRIPE_PRICE_ID.startsWith("price_")) failures.push("STRIPE_PRICE_ID ist ungültig");
if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) failures.push("STRIPE_WEBHOOK_SECRET ist ungültig");

const knownEnvTypos = [
  ["DATARASE_URL", "DATABASE_URL"],
  ["ALLOWED_ORIGINS", "APP_ALLOWED_ORIGINS"],
];
for (const [typo, correct] of knownEnvTypos) {
  if (process.env[typo]?.trim()) failures.push(`${typo} ist ein Tippfehler – der Server liest ausschließlich ${correct}`);
}
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (databaseUrl && !/^(mysql|mysql2|mariadb):\/\//i.test(databaseUrl)) failures.push("DATABASE_URL muss eine MySQL-Verbindung (mysql://…) sein – der Server nutzt drizzle-orm/mysql2");
const chatProviderKeys = [
  "BUILT_IN_FORGE_API_KEY",
  "OPENAI_API_KEY",
  "AI_OPENAI_API_KEY",
  "AI_GEMINI_API_KEY",
  "AI_OPENROUTER_API_KEY",
  "AI_GROQ_API_KEY",
  "AI_TOGETHER_API_KEY",
  "AI_ANTHROPIC_API_KEY",
  "AI_HUGGINGFACE_API_KEY",
  "AI_OLLAMA_BASE_URL",
  "AI_LMSTUDIO_BASE_URL",
  "AI_CUSTOM_BASE_URL",
];
if (!chatProviderKeys.some((name) => process.env[name]?.trim())) failures.push("Kein KI-Provider konfiguriert – mindestens einen Provider-Key oder lokalen Endpoint setzen (z. B. OPENAI_API_KEY oder AI_OPENROUTER_API_KEY), damit der Entwicklungsauftrag antwortet");
if (!process.env.APP_ALLOWED_ORIGINS?.trim()) failures.push("APP_ALLOWED_ORIGINS fehlt – ohne erlaubte Origins blockiert der Server produktive Web-Requests mit HTTP 403");

if (failures.length > 0) {
  console.error("ENV-PRÜFUNG FEHLGESCHLAGEN:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

try {
  const response = await fetch(`${appBaseUrl.replace(/\/$/, "")}/api/health`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body?.ok !== true) throw new Error("Antwort enthält nicht ok=true");
  console.log("OK: Health-Endpoint erreichbar");
} catch (error) {
  console.error(`FEHLER: Health-Endpoint nicht erreichbar (${error instanceof Error ? error.message : "unbekannt"})`);
  process.exitCode = 1;
}

try {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  await connection.query("SELECT 1 AS healthy");
  await connection.end();
  console.log("OK: MySQL-Datenbankverbindung und SELECT 1 erfolgreich");
} catch (error) {
  console.error(`FEHLER: Datenbankverbindung fehlgeschlagen (${error instanceof Error ? error.message : "unbekannt"})`);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Produktions-Validator erfolgreich abgeschlossen");
