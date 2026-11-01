import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Recycle, Sparkles, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { apiFetch } from "@/lib/api-fetch";

interface RecyclingEintrag {
  id: number;
  quelleTyp: string;
  quelleId: number;
  quelleTitel: string;
  quelleAufrufe: number;
  neuerContentId: number | null;
  marke: string;
  neuePlattform: string;
  neuerTyp: string;
  begruendung: string | null;
  status: string;
  createdAt: string;
}

interface RecyclingUebersicht {
  eintraege: RecyclingEintrag[];
  stats: {
    gesamt: number;
    gesamtQuellAufrufe: number;
    markenVerteilung: Record<string, number>;
  };
}

export default function ContentRecycling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<RecyclingUebersicht>({
    queryKey: ["content-recycling-uebersicht"],
    queryFn: async () => {
      const res = await apiFetch("/api/content-recycling/uebersicht");
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json() as Promise<RecyclingUebersicht>;
    },
    refetchInterval: 20_000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/content-recycling/scan", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ recycelt: number; details: string[] }>;
    },
    onSuccess: (ergebnis) => {
      toast({
        title: ergebnis.recycelt > 0 ? `${ergebnis.recycelt} Variante(n) erstellt` : "Kein neuer Top-Performer",
        description: ergebnis.details.slice(0, 2).join(" · "),
      });
      void queryClient.invalidateQueries({ queryKey: ["content-recycling-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const { eintraege, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Recycle className="h-5 w-5 text-primary" />
            Content-Recycling-Agent
          </h2>
          <p className="text-muted-foreground text-sm">
            Findet echte Top-Performer-Inhalte und erstellt daraus neue Varianten für andere Formate/Plattformen
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="bg-primary text-black hover:bg-primary/90 font-bold gap-2"
            data-testid="button-recycling-scan"
          >
            <Sparkles className={`h-4 w-4 ${scanMutation.isPending ? "animate-pulse" : ""}`} />
            Top-Performer recyceln
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Recycelte Varianten</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamt}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Quell-Aufrufe gesamt</div>
            <div className="text-2xl font-bold mt-1 text-primary">{stats.gesamtQuellAufrufe}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Marken</div>
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(stats.markenVerteilung).length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                Object.entries(stats.markenVerteilung).map(([marke, anzahl]) => (
                  <Badge key={marke} variant="outline" className="text-xs">{marke}: {anzahl}</Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
          <Recycle className="h-3 w-3" /> Recycling-Verlauf ({eintraege.length})
        </div>
        {eintraege.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">
            Noch keine Recycling-Varianten — "Top-Performer recyceln" klicken
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {eintraege.map((e) => (
              <Card key={e.id} className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm line-clamp-2">{e.quelleTitel}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{e.marke}</Badge>
                    <Badge variant="outline" className="text-xs">{e.neuerTyp} → {e.neuePlattform}</Badge>
                    <Badge className="text-xs bg-primary/20 text-primary">{e.status}</Badge>
                  </div>
                  {e.begruendung && <p className="text-xs text-muted-foreground line-clamp-2">{e.begruendung}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {e.quelleAufrufe} Quell-Aufrufe</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
