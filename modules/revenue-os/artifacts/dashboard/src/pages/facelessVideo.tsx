import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clapperboard, Sparkles, Send, ChartBar, Eye, MousePointerClick } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { apiFetch } from "@/lib/api-fetch";

interface FacelessVideo {
  id: number;
  marke: string;
  plattform: string;
  thema: string;
  hook: string | null;
  callToAction: string | null;
  thumbnailUrl: string | null;
  status: string;
  aufrufe: number;
  klicks: number;
  performanceScore: number;
  quelle: string;
  createdAt: string;
}

interface VideoUebersicht {
  videos: FacelessVideo[];
  stats: {
    gesamt: number;
    entwuerfe: number;
    veroeffentlicht: number;
    pausiert: number;
    gesamtAufrufe: number;
    gesamtKlicks: number;
    heutigeGenerierungen: number;
  };
}

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  veroeffentlicht: "Veröffentlicht",
  pausiert: "Pausiert",
  fehler: "Fehler",
};

export default function FacelessVideo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<VideoUebersicht>({
    queryKey: ["faceless-video-uebersicht"],
    queryFn: async () => {
      const res = await apiFetch("/api/faceless-video/uebersicht");
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json() as Promise<VideoUebersicht>;
    },
    refetchInterval: 20_000,
  });

  const generierenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/faceless-video/generieren", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ video: FacelessVideo | null }>;
    },
    onSuccess: (ergebnis) => {
      toast({
        title: ergebnis.video ? `Video generiert: "${ergebnis.video.thema}"` : "Generierung übersprungen",
        description: ergebnis.video ? `${ergebnis.video.marke} · ${ergebnis.video.plattform}` : "Tageslimit erreicht oder Agent pausiert",
      });
      void queryClient.invalidateQueries({ queryKey: ["faceless-video-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  const veroeffentlichenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/faceless-video/veroeffentlichen", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ veroeffentlicht: number; uebersprungen: number; details: string[] }>;
    },
    onSuccess: (ergebnis) => {
      toast({ title: `${ergebnis.veroeffentlicht} veröffentlicht, ${ergebnis.uebersprungen} übersprungen`, description: ergebnis.details.slice(0, 2).join(" · ") });
      void queryClient.invalidateQueries({ queryKey: ["faceless-video-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  const analysierenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/faceless-video/analysieren", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ analysiert: number; pausiert: number; details: string[] }>;
    },
    onSuccess: (ergebnis) => {
      toast({ title: `${ergebnis.analysiert} analysiert, ${ergebnis.pausiert} pausiert`, description: ergebnis.details.slice(0, 2).join(" · ") });
      void queryClient.invalidateQueries({ queryKey: ["faceless-video-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const { videos, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            Faceless-Video-Auto-Publish-Agent
          </h2>
          <p className="text-muted-foreground text-sm">
            3-Phasen-Loop: KI-Skript+Thumbnail → automatisches Posten → Performance-Optimierung
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => generierenMutation.mutate()}
            disabled={generierenMutation.isPending}
            variant="outline"
            className="gap-2"
            data-testid="button-video-generieren"
          >
            <Sparkles className={`h-4 w-4 ${generierenMutation.isPending ? "animate-pulse" : ""}`} />
            Video generieren
          </Button>
          <Button
            onClick={() => veroeffentlichenMutation.mutate()}
            disabled={veroeffentlichenMutation.isPending}
            className="bg-primary text-black hover:bg-primary/90 font-bold gap-2"
            data-testid="button-video-veroeffentlichen"
          >
            <Send className={`h-4 w-4 ${veroeffentlichenMutation.isPending ? "animate-pulse" : ""}`} />
            Veröffentlichen
          </Button>
          <Button
            onClick={() => analysierenMutation.mutate()}
            disabled={analysierenMutation.isPending}
            variant="outline"
            className="gap-2"
            data-testid="button-video-analysieren"
          >
            <ChartBar className={`h-4 w-4 ${analysierenMutation.isPending ? "animate-pulse" : ""}`} />
            Analysieren
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Videos gesamt</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamt}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Entwürfe</div>
            <div className="text-2xl font-bold mt-1">{stats.entwuerfe}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Veröffentlicht</div>
            <div className="text-2xl font-bold mt-1 text-primary">{stats.veroeffentlicht}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Pausiert</div>
            <div className="text-2xl font-bold mt-1 text-muted-foreground">{stats.pausiert}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Aufrufe</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamtAufrufe}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Heute generiert</div>
            <div className="text-2xl font-bold mt-1">{stats.heutigeGenerierungen}<span className="text-xs text-muted-foreground">/8</span></div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
          <Clapperboard className="h-3 w-3" /> Videos ({videos.length})
        </div>
        {videos.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">
            Noch keine Videos — "Video generieren" klicken
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => (
              <Card key={v.id} className="bg-card border-border overflow-hidden">
                {v.thumbnailUrl && (
                  <img src={v.thumbnailUrl} alt={v.thema} className="w-full h-40 object-cover" />
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm line-clamp-2">{v.thema}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{v.marke}</Badge>
                    <Badge variant="outline" className="text-xs">{v.plattform}</Badge>
                    <Badge
                      className={`text-xs ${
                        v.status === "veroeffentlicht"
                          ? "bg-primary/20 text-primary"
                          : v.status === "pausiert"
                            ? "bg-muted text-muted-foreground"
                            : v.status === "fehler"
                              ? "bg-destructive/20 text-destructive"
                              : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {STATUS_LABEL[v.status] ?? v.status}
                    </Badge>
                  </div>
                  {v.hook && <p className="text-xs text-muted-foreground line-clamp-2">"{v.hook}"</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {v.aufrufe}</span>
                    <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {v.klicks}</span>
                    <span>Score {v.performanceScore}</span>
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
