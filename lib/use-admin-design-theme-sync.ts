import { useEffect, useRef } from "react";

import { useThemeContext } from "@/lib/theme-provider";

type AdminUser = { role?: string } | null | undefined;

/**
 * Neon-Pulse-Aktivierung fuer Administratoren.
 *
 * Der Administrator soll nach dem Login sofort im vorgesehenen "Cyber Neon"-
 * Design landen, ohne selbst zum Theme Lab navigieren zu muessen — analog zu
 * useAdminAutoRouter (Sprint 71) und useAdminGithubTokenSync (Sprint 87).
 * Idempotent pro Sitzung: wechselt einmalig, wenn noch nicht "neon" aktiv
 * ist; eine spaetere manuelle Wahl eines anderen Designs wird respektiert
 * (kein Zurueckzwingen bei jedem Mount). Normale Nutzer bleiben unberuehrt.
 */
export function useAdminDesignThemeSync(user: AdminUser) {
  const { designTheme, setDesignTheme } = useThemeContext();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    if (user?.role !== "admin") return;
    attemptedRef.current = true;
    if (designTheme !== "pulse") setDesignTheme("pulse");
  }, [user, designTheme, setDesignTheme]);
}
