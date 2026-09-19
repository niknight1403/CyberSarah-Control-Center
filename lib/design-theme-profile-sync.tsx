import { useEffect, useRef } from "react";

import { resolveInitialDesignTheme, type DesignTheme } from "@/lib/design-theme-logic";
import { trpc } from "@/lib/trpc";
import { useThemeContext } from "@/lib/theme-provider";

type AccountMe = { openId: string; designTheme?: string | null } | undefined | null;

/**
 * Sprint 160 — Zwei-Wege-Sync zwischen lokalem Design-Theme und dem
 * Benutzerprofil (Server). Muss INNERHALB von trpc.Provider gerendert
 * werden (siehe app/_layout.tsx) — ThemeProvider selbst liegt ausserhalb
 * des tRPC-Baums und darf keine trpc-Hooks verwenden.
 *
 * Ablauf:
 * 1. Reconcile: sobald der lokale Speicher (themeLoaded) und die Profilabfrage
 *    bereit sind, entscheidet resolveInitialDesignTheme (Profil > lokaler
 *    Speicher > Default) ueber das aktive Theme. Das laeuft einmal beim Start
 *    UND bei jedem Benutzerwechsel (Login/Logout), damit nach einem Login das
 *    im Profil gespeicherte Design gewinnt.
 * 2. Danach wird jede lokale Aenderung (z. B. Auswahl in den Einstellungen)
 *    an angemeldete Benutzer zurueck ins Profil geschrieben.
 *
 * Ohne Login (kein Profil) bleibt die App voll funktionsfaehig — es wird
 * schlicht nichts synchronisiert. Der Sync loescht weder Sitzungen noch
 * Navigationszustand; er veraendert ausschliesslich das Design-Theme.
 */
export function DesignThemeProfileSync() {
  const { designTheme, setDesignTheme, themeLoaded } = useThemeContext();
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const setDesignThemeMutation = trpc.account.setDesignTheme.useMutation();
  const reconciledUserRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<DesignTheme | null>(null);

  // Schritt 1 — Abgleich beim Start und bei jedem Benutzerwechsel.
  useEffect(() => {
    if (!themeLoaded || accountQuery.isLoading) return;
    const account: AccountMe = accountQuery.data ?? null;
    const userId = account?.openId ?? null;
    // Bereits abgeglichen: gleicher Benutzer, Reconcile lief einmal.
    if (reconciledUserRef.current === userId) return;
    reconciledUserRef.current = userId;
    const profileTheme = account?.designTheme ?? null;
    const resolved = resolveInitialDesignTheme(profileTheme, designTheme);
    if (resolved !== designTheme) setDesignTheme(resolved);
    lastSyncedRef.current = resolved;
  }, [themeLoaded, accountQuery.isLoading, accountQuery.data, designTheme, setDesignTheme]);

  // Schritt 2 — lokale Aenderungen nach dem Abgleich ins Profil zurueckschreiben.
  useEffect(() => {
    if (reconciledUserRef.current === null) return; // nicht (mehr) angemeldet
    if (lastSyncedRef.current === designTheme) return;
    lastSyncedRef.current = designTheme;
    setDesignThemeMutation.mutate({ designTheme });
  }, [designTheme, setDesignThemeMutation]);

  return null;
}
