import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Sprint 68 — Capacitor-Konfiguration: Android-Wrapper (APK) um den
 * statischen Expo-Web-Export (web-dist).
 *
 * Die App laedt die Web-Export-Dateien lokal aus dem APK und spricht die
 * Produktiv-API https://app.cybersarah-ki.com an (DEFAULT_API_BASE_URL in
 * constants/oauth.ts). androidScheme "https" sorgt dafuer, dass WebView-
 * Urspruenge als sicherer Kontext gelten (localStorage, fetch-Auth).
 */
const config: CapacitorConfig = {
  appId: "com.cybersarah.controlcenter",
  appName: "CyberSarah Control Center",
  webDir: "web-dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
