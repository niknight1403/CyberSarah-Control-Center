/**
 * Hook fuer die Umsatz-Kennzahlen des Command Dashboards.
 * Nur Admins fragen die Werte ab; fuer alle anderen wird die Abfrage
 * gar nicht erst gestartet (der Server prueft zusaetzlich selbst).
 */
import { trpc } from "@/lib/trpc";
import type { RevenueKpiSnapshot } from "@/lib/revenue-kpi-logic";

export type RevenueKpiState = {
  snapshot: RevenueKpiSnapshot | null;
  /** Abfrage laeuft und ein Ergebnis ist noch nicht da. */
  loading: boolean;
  /** Server hat die Einsicht verweigert (kein Admin). */
  forbidden: boolean;
  /** Abfrage ist fehlgeschlagen — Kennzahlen bleiben leer. */
  failed: boolean;
  refetch: () => void;
};

export function useRevenueKpis(enabled: boolean): RevenueKpiState {
  const query = trpc.revenue.kpis.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  return {
    snapshot: data && data.status === "ok" ? data.snapshot : null,
    loading: enabled && query.isLoading,
    forbidden: data?.status === "forbidden",
    failed: enabled && query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
