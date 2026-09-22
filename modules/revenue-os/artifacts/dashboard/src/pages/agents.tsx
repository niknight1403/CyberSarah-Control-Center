import { useQuery } from "@tanstack/react-query";
import { useListAgents, useUpdateAgentStatus, useRunAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Pause, Clock, Zap, CheckCircle, TrendingUp, AlertTriangle, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { apiFetch } from "@/lib/api-fetch";

const statusColorMap: Record<string, string> = {
  aktiv: "bg-green-500/10 text-green-500 border-green-500/20",
  wartend: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  fehler: "bg-red-500/10 text-red-500 border-red-500/20",
  gestoppt: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  pausiert: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

interface AgentStats {
  id: number;
  name: string;
  status: string;
  erfolgsrate: number | null;
  logsGesamt: number;
  erfolgreich: number;
  fehler: number;
  fallbacks: number;
  letzteAktivitaet: string | null;
}

function useAgentStats() {
  return useQuery<AgentStats[]>({
    queryKey: ["agent-stats"],
    queryFn: async () => {
      const res = await apiFetch("/api/system/status/agents");
      if (!res.ok) throw new Error("Stats nicht verfügbar");
      return res.json() as Promise<AgentStats[]>;
    },
    refetchInterval: 30_000,
    retry: false,
  });
}

function ErfolgsrateBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-[10px] text-muted-foreground">Keine Daten</span>;
  const farbe = rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", farbe)} style={{ width: `${rate}%` }} />
      </div>
      <span className={cn("text-[10px] font-mono tabular-nums",
        rate >= 80 ? "text-green-500" : rate >= 50 ? "text-yellow-500" : "text-red-500"
      )}>{rate}%</span>
    </div>
  );
}

export default function Agents() {
  const { data: agents, isLoading } = useListAgents({
    query: { refetchInterval: 30000 } as any
  });
  const { data: agentStats } = useAgentStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);

  const updateStatus = useUpdateAgentStatus();
  const runAgent = useRunAgent();

  const handleStatusChange = (id: number, newStatus: string) => {
    updateStatus.mutate(
      { id, data: { status: newStatus as "aktiv" | "wartend" | "fehler" | "gestoppt" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
          toast({ title: "Status aktualisiert", description: "Agentenstatus wurde geändert." });
        }
      }
    );
  };

  const handleReset = async (id: number, agentName: string) => {
    setResettingId(id);
    try {
      const res = await apiFetch(`/api/agents/${id}/reset`, { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      if (data.success) {
        toast({ title: "✅ Agent zurückgesetzt", description: data.message });
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
      } else {
        toast({ title: "Fehler", description: "Reset fehlgeschlagen", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Netzwerkfehler beim Reset", variant: "destructive" });
    } finally {
      setResettingId(null);
    }
  };

  const handleRun = (id: number, agentName: string) => {
    setLastTriggered(agentName);
    toast({ title: "⚡ " + agentName, description: "Ausführung wird gestartet..." });
    runAgent.mutate({ id }, {
      onSettled: () => {
        setTimeout(() => setLastTriggered(null), 4000);
      }
    });
  };

  if (isLoading || !agents) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-52 w-full bg-card" />)}
      </div>
    );
  }

  const statsMap = agentStats ? new Map(agentStats.map(s => [s.id, s])) : new Map<number, AgentStats>();
  const gesamtFallbacks = agentStats ? agentStats.reduce((s, a) => s + a.fallbacks, 0) : 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">Agenten-Flotte</h2>
        <p className="text-muted-foreground text-xs md:text-sm">
          Übersicht aller {agents.length} KI-Agenten · Erfolgsrate 7 Tage
          {gesamtFallbacks > 0 && (
            <span className="ml-2 text-orange-400 inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {gesamtFallbacks} Fallbacks gesamt
            </span>
          )}
        </p>
      </div>

      {/* Trigger-Status-Banner */}
      <div
        data-testid="agent-trigger-status"
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className={`flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 ${lastTriggered ? 'opacity-100' : 'opacity-0 h-0 py-0 overflow-hidden border-0'}`}
      >
        <CheckCircle className="h-4 w-4 shrink-0" />
        <span>{lastTriggered ? `⚡ ${lastTriggered} — Ausführung gestartet` : ''}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent) => {
          const stats = statsMap.get(agent.id);
          return (
            <Card key={agent.id} className="bg-card border-border flex flex-col">
              <CardHeader className="pb-2 p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight">{agent.name}</CardTitle>
                    <CardDescription className="font-mono text-[10px] mt-0.5">{agent.typ}</CardDescription>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColorMap[agent.status] || "bg-muted"}`}>
                    {agent.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between p-4 pt-0">
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                  {agent.beschreibung || "Keine Beschreibung verfügbar."}
                </p>

                <div className="space-y-2.5">
                  {/* Erfolgsrate-Bar */}
                  {stats && stats.logsGesamt > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Erfolgsrate 7T
                        </span>
                        {stats.fallbacks > 0 && (
                          <span className="text-[9px] text-orange-400 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {stats.fallbacks} Fallbacks
                          </span>
                        )}
                      </div>
                      <ErfolgsrateBar rate={stats.erfolgsrate} />
                      <div className="text-[9px] text-muted-foreground font-mono">
                        {stats.erfolgreich} OK · {stats.fehler} Fehler · {stats.logsGesamt} Logs
                      </div>
                    </div>
                  )}

                  {/* Letzte Aktivität */}
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono bg-background/50 px-2 py-1.5 rounded">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {agent.letzteAktivitaet
                        ? new Date(agent.letzteAktivitaet).toLocaleString('de-DE')
                        : 'Nie'}
                    </span>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {/* Reset-Button — nur bei pausiert oder fehler sichtbar */}
                    {(agent.status === 'pausiert' || agent.status === 'fehler') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:border-orange-400"
                        onClick={() => void handleReset(agent.id, agent.name)}
                        disabled={resettingId === agent.id}
                        data-testid={`btn-reset-agent-${agent.id}`}
                      >
                        <RotateCcw className={cn("h-3 w-3 mr-1", resettingId === agent.id && "animate-spin")} />
                        {resettingId === agent.id ? "Wird zurückgesetzt..." : "Reset"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={agent.status === 'aktiv' ? "secondary" : "default"}
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleStatusChange(agent.id, agent.status === 'aktiv' ? 'gestoppt' : 'aktiv')}
                      data-testid={`btn-toggle-agent-${agent.id}`}
                    >
                      {agent.status === 'aktiv'
                        ? <><Pause className="h-3 w-3 mr-1" />Pause</>
                        : <><Play className="h-3 w-3 mr-1" />Start</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs px-3"
                      onClick={() => handleRun(agent.id, agent.name)}
                      data-testid={`btn-run-agent-${agent.id}`}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Trigger
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
