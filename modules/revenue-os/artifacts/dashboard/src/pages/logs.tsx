import { useListAgentLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

export default function Logs() {
  const { data: logs, isLoading } = useListAgentLogs(
    { limit: 100 },
    { query: { refetchInterval: 30000 } as any }
  );

  if (isLoading || !logs) {
    return <Skeleton className="h-[60vh] w-full bg-card" />;
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'erfolgreich': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'fehler': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  return (
    <div className="space-y-4" style={{ height: 'calc(100dvh - 8rem)' }}>
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">System-Protokolle</h2>
        <p className="text-muted-foreground text-xs md:text-sm">Live-Stream aller Agenten-Aktivitäten</p>
      </div>

      <Card className="bg-black border-border flex flex-col" style={{ height: 'calc(100% - 4rem)' }}>
        <div className="border-b border-border px-3 py-2 bg-zinc-950 flex items-center gap-2 shrink-0">
          <Terminal className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-mono text-[10px] text-muted-foreground truncate">/var/log/cyber-sarah/agents.log</span>
        </div>
        <CardContent className="p-0 flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-full w-full">
            <div className="p-3 space-y-0.5 font-mono">
              {logs.map((log) => (
                <div key={log.id} className="hover:bg-white/5 rounded transition-colors group">
                  {/* Mobile: stacked layout */}
                  <div className="md:hidden p-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 ${getStatusColor(log.status)}`}>
                        {log.status}
                      </Badge>
                      <span className="text-blue-400 text-[10px] font-bold truncate max-w-[140px]">
                        [{log.agentName}]
                      </span>
                      <span className="text-[9px] text-muted-foreground ml-auto">
                        {new Date(log.createdAt).toLocaleTimeString('de-DE')}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-relaxed break-words">
                      <span className="text-foreground/70">{log.aktion}: </span>
                      {log.nachricht}
                    </div>
                  </div>
                  {/* Desktop: horizontal layout */}
                  <div className="hidden md:flex gap-3 px-2 py-1 text-xs items-start">
                    <span className="text-muted-foreground shrink-0 w-32 text-[11px]">
                      {new Date(log.createdAt).toLocaleString('de-DE')}
                    </span>
                    <span className="text-blue-400 shrink-0 w-36 font-bold truncate">
                      [{log.agentName}]
                    </span>
                    <Badge variant="outline" className={`shrink-0 w-24 justify-center ${getStatusColor(log.status)} text-[10px] h-5`}>
                      {log.status}
                    </Badge>
                    <span className="text-foreground shrink-0 w-28 truncate text-[11px]">
                      {log.aktion}
                    </span>
                    <span className="text-muted-foreground break-words flex-1 group-hover:text-foreground transition-colors text-[11px]">
                      {log.nachricht}
                    </span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground py-8 text-center text-xs">
                  Warte auf Agenten-Aktivität...
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
