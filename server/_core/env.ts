/**
 * Laufzeit-Umgebung (Sprint 187: dynamische Getter).
 *
 * Vorher wurden die Werte einmalig beim Modul-Import eingefroren. Das ist
 * in der Produktion harmlos (Env steht vor dem Boot), fuehrte aber zu
 * importreihenfolge-abhaengigen Tests: Vitest mit `isolate: false`
 * (Worker-Reuse) bewertet das Modul nur noch einmal pro Worker — ein
 * frueher Import ohne gesetztes JWT_SECRET liess ENV.cookieSecret fuer
 * alle nachfolgenden Testdateien desselben Workers leer ("Zero-length
 * key"). Getter lesen beim Zugriff, die Call-Site-API bleibt identisch
 * (ENV.cookieSecret etc.), tsc prueft das.
 */
export const ENV = {
  get appId() {
    return process.env.VITE_APP_ID ?? "";
  },
  get cookieSecret() {
    return process.env.JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.OAUTH_SERVER_URL ?? "";
  },
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.BUILT_IN_FORGE_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.BUILT_IN_FORGE_API_KEY ?? "";
  },
  /** Sprint 196 — Telegram-Bot-Token fuer Betriebsmeldungen (optional). */
  get telegramBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN ?? "";
  },
  /** Sprint 196 — Ziel-Chat-ID fuer Betriebsmeldungen (optional). */
  get telegramChatId() {
    return process.env.TELEGRAM_CHAT_ID ?? "";
  },
};
