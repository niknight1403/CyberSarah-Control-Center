import { useAdminAutoRouter } from "@/lib/use-admin-auto-router";
import { useAdminDesignThemeSync } from "@/lib/use-admin-design-theme-sync";
import { useAdminGithubTokenSync } from "@/lib/use-admin-github-token-sync";
import { useAdminRepositoryAutoConnect } from "@/lib/use-admin-repository-autoconnect";

type AdminUser = { role?: string } | null | undefined;

/**
 * Sprint 149 — Globale Admin-Vollintegration nach dem Login.
 *
 * Der Administrator erwartet, dass das Control Center nach dem Login OHNE
 * jeden manuellen Klick vollstaendig einsatzbereit ist: Router-Konfiguration,
 * GitHub-Token, Cyber-Neon-Design und Repository-Verbindung muessen auf
 * JEDEM Screen autonom hergestellt sein — im Superagent-Tab genauso wie im
 * normalen Entwicklungs-Chat, unabhaengig davon, welcher Tab als erster
 * geoeffnet wird.
 *
 * Bisher liefen die vier Hooks getrennt in chat.tsx, agent.tsx und
 * settings.tsx — d.h. sie wurden erst beim OEFFNEN des jeweiligen Screens
 * aktiv. Dieser Composite-Hook wird einmal zentral im Root-Layout
 * (AdminAutonomyBootstrap) ausgefuehrt und deckt damit die gesamte App ab.
 * Alle Hooks sind idempotent und still (kein manueller Schritt noetig).
 */
export function useAdminFullIntegration(user: AdminUser) {
  useAdminAutoRouter(user);
  useAdminGithubTokenSync(user);
  useAdminDesignThemeSync(user);
  useAdminRepositoryAutoConnect(user);
}
