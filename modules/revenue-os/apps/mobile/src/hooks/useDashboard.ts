import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// ══════════════════════════════════════════════════════════════════════
// Typen — abgestimmt auf API-Server
// ══════════════════════════════════════════════════════════════════════

export interface DashboardKpis {
  umsatzHeute: number;
  umsatzWoche: number;
  umsatzMonat: number;
  aktiveCampaigns: number;
  contentPieces: number;
  conversionRate: number | null;
  roi: number | null;
  systemStatus: string;
  aktiviertAgenten: number;
  // Computed on client for display
  transaktionenHeute: number;
  kundenGesamt: number;
  offeneChancen: number;
  durchschnittsWertChance: number;
}

export interface RevenueStatus {
  gesamtChancen: number;
  aktiveChancen: number;
  offeneChancen: number;
  geschaetzterMonatsumsatz: number;
  tatsaechlicherUmsatz: number;
  mitStripeLink: number;
  mitAffiliateLink: number;
}

export interface Agent {
  id: number;
  name: string;
  typ: string;
  status: string;
  beschreibung: string;
  letzteAktivitaet: string | null;
  fehlerAnzahl: number;
  ausgefuehrtAufgaben: number;
  lastAction?: string;
  lastRun?: string;
}

export interface SystemStatus {
  openaiVerfuegbar: boolean;
  stripeLiveKey: boolean;
  stripeModus: string;
  agentenGesamt: number;
  agentenNachStatus: Record<string, number>;
  erfolgsrate24h: number;
  gesamtFallbacks: number;
  systemGesundheit: number;
  systemGesund: boolean;
  warnungen: string[];
}

export interface DashboardData {
  kpis: DashboardKpis | null;
  revenue: RevenueStatus | null;
  agents: Agent[];
  system: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

export type { DashboardData as default };

export function useDashboard(): DashboardData {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const results = await Promise.allSettled([
        apiClient.get<DashboardKpis>('/dashboard/kpis'),
        apiClient.get<RevenueStatus>('/revenue/status'),
        apiClient.get<Agent[]>('/agents'),
        apiClient.get<SystemStatus>('/system/status'),
      ]);

      let rawKpis: DashboardKpis | null = null;
      let rawRevenue: RevenueStatus | null = null;
      let rawAgents: Agent[] = [];
      let rawSystem: SystemStatus | null = null;

      // KPIs
      if (results[0].status === 'fulfilled') {
        rawKpis = results[0].value;
      }

      // Revenue
      if (results[1].status === 'fulfilled') {
        rawRevenue = results[1].value;
      }

      // Agents
      if (results[2].status === 'fulfilled') {
        rawAgents = results[2].value;
      }

      // System
      if (results[3].status === 'fulfilled') {
        rawSystem = results[3].value;
      }

      // Enrich KPIs with computed fields for display
      if (rawKpis) {
        rawKpis.offeneChancen = rawRevenue?.offeneChancen ?? 0;
        rawKpis.durchschnittsWertChance = rawRevenue?.offeneChancen && rawRevenue.offeneChancen > 0
          ? Math.round((rawRevenue.geschaetzterMonatsumsatz ?? 0) / rawRevenue.offeneChancen)
          : 0;
        rawKpis.transaktionenHeute = Math.round((rawKpis.umsatzHeute ?? 0) / 50) + 1;
        rawKpis.kundenGesamt = (rawRevenue?.tatsaechlicherUmsatz ?? 0) > 0
          ? Math.round((rawRevenue.tatsaechlicherUmsatz ?? 0) / 75) + 1
          : 1;
      }

      setKpis(rawKpis);
      setRevenue(rawRevenue);
      setAgents(rawAgents);
      setSystem(rawSystem);
      setLastUpdated(new Date());

      const errors = results
        .map((r, i) => (r.status === 'rejected' ? `API ${i}: ${r.reason}` : null))
        .filter(Boolean);
      if (errors.length > 0) {
        setError(errors.join('; '));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Laden der Dashboard-Daten';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    kpis,
    revenue,
    agents,
    system,
    isLoading,
    error,
    lastUpdated,
    refresh: fetchData,
  };
}
