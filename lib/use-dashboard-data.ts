/**
 * Sprint 156 — Dashboard-Daten-Hook: verbindet das Neon-Pulse-Dashboard mit
 * echten Backend-Quellen (tRPC) und mapped alles ueber das ehrliche
 * Dashboard-View-Model. Keine erfundenen Werte, keine Provider-Keys.
 */
import { useMemo } from "react";

import { trpc } from "@/lib/trpc";
import {
  formatUptime,
  mapActivity,
  mapChatStatus,
  mapSuperAgentStatus,
  mapSystemStatus,
  mapWorkspaceStatus,
  type DashboardViewModel,
} from "@/lib/dashboard-view-model";

export type DashboardQueryState = "loading" | "ready" | "error" | "offline";

export function useDashboardData(): {
  vm: DashboardViewModel | null;
  state: DashboardQueryState;
  hasAlerts: boolean;
  isAdmin: boolean;
  retry: () => void;
  serverUptimeText: string;
} {
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const statusQuery = trpc.appStatus.status.useQuery(undefined, { retry: false });
  const providerQuery = trpc.appStatus.providerSummary.useQuery(undefined, { retry: false });
  const superAgentsQuery = trpc.superAgents.list.useQuery(undefined, { retry: false });
  const projectsQuery = trpc.projects.list.useQuery(undefined, { retry: false });
  const quotaQuery = trpc.developmentChat.quota.useQuery(undefined, { retry: false });

  const retry = () => {
    void statusQuery.refetch();
    void providerQuery.refetch();
    void superAgentsQuery.refetch();
    void projectsQuery.refetch();
    void quotaQuery.refetch();
  };

  const user = accountQuery.data ?? null;
  const authenticated = Boolean(user);
  const sessionExpired = accountQuery.isError && accountQuery.error?.data?.code === "UNAUTHORIZED";
  const isAdmin = user?.role === "admin";

  const vm = useMemo<DashboardViewModel | null>(() => {
    if (accountQuery.isLoading && statusQuery.isLoading) return null;

    const status = statusQuery.data ?? null;
    const providers = providerQuery.data ?? null;
    const agents = superAgentsQuery.data ?? null;
    const projects = projectsQuery.data ?? null;
    const quota = quotaQuery.data ?? null;

    const backendReachable = !(statusQuery.isError && providerQuery.isError && superAgentsQuery.isError);
    const hasRecentErrors = status ? status.state === "error" || status.state === "stopped" : statusQuery.isError;

    const system = mapSystemStatus({
      reachable: backendReachable && !statusQuery.isError,
      checking: statusQuery.isLoading || providerQuery.isLoading,
      hasRecentErrors,
      workspaceReachable: status?.pingMs != null ? status.pingMs < 10_000 : null,
    });

    const chat = mapChatStatus({
      providersConfigured: providers?.configuredCount ?? null,
      activeProvider: providers?.activeProvider ?? null,
      activeModel: providers?.activeModel ?? null,
    });

    const workspace = mapWorkspaceStatus({
      configured: Boolean(status?.pingMs !== undefined),
      reachable: status?.pingMs != null ? status.pingMs < 10_000 : null,
      count: Array.isArray(projects) ? projects.length : null,
    });

    const activity = mapActivity({
      countLast24h: quota && typeof quota.usedToday === "number" ? quota.usedToday : null,
      previousCount: null,
      points: null,
    });

    const superAgent = mapSuperAgentStatus({
      reachable: backendReachable ? null : false,
      loadError: superAgentsQuery.isError,
      agents: Array.isArray(agents)
        ? agents.map((agent) => ({ status: String(agent.status ?? ""), lastActiveAt: String(agent.lastActiveAt ?? new Date(0).toISOString()) }))
        : [],
    });

    const activeAgents = Array.isArray(agents)
      ? agents.filter((agent) => (agent as { status?: string }).status !== "archiviert").length
      : null;

    return {
      user: {
        name: user?.name ?? user?.email ?? "",
        role: user?.role ?? "unknown",
        online: authenticated,
        sessionState: authenticated ? "online" : sessionExpired ? "sitzung-abgelaufen" : "anmeldung-erforderlich",
      },
      kpis: {
        agents: activeAgents,
        providers: providers?.healthyCount ?? providers?.configuredCount ?? null,
        uptime: status?.serverUptimeMs ?? null,
      },
      system,
      chat,
      workspace,
      activity,
      superAgent,
    };
  }, [accountQuery, statusQuery, providerQuery, superAgentsQuery, projectsQuery, quotaQuery, user, authenticated, sessionExpired]);

  const anyCoreError = statusQuery.isError && superAgentsQuery.isError && providerQuery.isError;
  const state: DashboardQueryState = vm === null
    ? "loading"
    : anyCoreError
      ? "error"
      : "ready";

  return {
    vm,
    state,
    hasAlerts: Boolean(vm && (vm.system.status === "degraded" || vm.system.status === "offline")),
    isAdmin,
    retry,
    serverUptimeText: formatUptime(statusQuery.data?.serverUptimeMs ?? null),
  };
}
