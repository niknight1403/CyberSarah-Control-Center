import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Sparkles, Pause, Play, ExternalLink, Eye, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { apiFetch } from "@/lib/api-fetch";

interface SeoArtikel {
  id: number;
  keyword: string;
  slug: string;
  titel: string;
  metaDescription: string | null;
  body: string;
  marke: string;
  produktId: number | null;
  status: string;
  aufrufe: number;
  veroeffentlichtAm: string | null;
  createdAt: string;
}

interface SeoUebersicht {
  artikel: SeoArtikel[];
  stats: { gesamt: number; veroeffentlicht: number; pausiert: number; gesamtAufrufe: number };
}

interface ScanErgebnis {
  erstellt: number;
  artikel: Array<{ titel: string; slug: string; marke: string }>;
  fehler: string[];
}

export default function SeoContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SeoUebersicht>({
    queryKey: ["seo-uebersicht"],
    queryFn: async () => {
      const res = await apiFetch("/api/seo/uebersicht");
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json() as Promise<SeoUebersicht>;
    },
    refetchInterval: 20_000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/seo/scan", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ScanErgebnis>;
    },
    onSuccess: (ergebnis) => {
      if (ergebnis.erstellt > 0) {
        toast({ title: `✅ ${ergebnis.erstellt} neue SEO-Artikel veröffentlicht!`, description: "Sofort öffentlich crawlbar" });
      } else {
        toast({ title: "Kein neuer Artikel", description: ergebnis.fehler[0] ?? "Aktuell kein Bedarf" });
      }
      void queryClient.invalidateQueries({ queryKey: ["seo-uebersicht"] });
    },
    onError: (err) => {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannter Fehler", variant: "destructive" });
    },
  });

  const pausierenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/seo/${id}/pausieren`, { method: "POST" });
      if (!res.ok) throw new Error("Fehler");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["seo-uebersicht"] }),
  });

  const reaktivierenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/seo/${id}/reaktivieren`, { method: "POST" });
      if (!res.ok) throw new Error("Fehler");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["seo-uebersicht"] }),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const { artikel, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            SEO-Content-Empire-Agent
          </h2>
          <p className="text-muted-foreground text-sm">
            Autonome SEO-Artikel — öffentlich crawlbar, mit Digitalprodukt-Verlinkung monetarisiert
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="bg-primary text-black hover:bg-primary/90 font-bold gap-2"
          data-testid="button-seo-scan"
        >
          <Sparkles className={`h-4 w-4 ${scanMutation.isPending ? "animate-pulse" : ""}`} />
          {scanMutation.isPending ? "Generiere Artikel..." : "Neue SEO-Artikel generieren"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Gesamt</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamt}</div>
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
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Aufrufe gesamt</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamtAufrufe}</div>
          </CardContent>
        </Card>
      </div>

      {artikel.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground font-mono text-sm">
          Noch keine SEO-Artikel — Scan starten, um die ersten Artikel autonom zu generieren
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {artikel.map((a) => (
            <SeoArtikelKarte
              key={a.id}
              artikel={a}
              onPausieren={() => pausierenMutation.mutate(a.id)}
              onReaktivieren={() => reaktivierenMutation.mutate(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SeoArtikelKarte({
  artikel,
  onPausieren,
  onReaktivieren,
}: {
  artikel: SeoArtikel;
  onPausieren: () => void;
  onReaktivieren: () => void;
}) {
  const [erweitert, setErweitert] = useState(false);
  const veroeffentlicht = artikel.status === "veroeffentlicht";

  return (
    <Card className={`bg-card border-border flex flex-col ${veroeffentlicht ? "" : "opacity-60"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm line-clamp-2 leading-snug">{artikel.titel}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs">{artikel.marke}</Badge>
          <Badge variant="outline" className="text-xs">{artikel.keyword}</Badge>
          <Badge
            className={`text-xs ${veroeffentlicht ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {artikel.status}
          </Badge>
        </div>

        <div
          className={`text-xs text-muted-foreground bg-muted/50 p-2.5 rounded font-mono border border-border cursor-pointer transition-all ${erweitert ? "" : "line-clamp-3"}`}
          onClick={() => setErweitert(!erweitert)}
        >
          {artikel.metaDescription || artikel.body}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" /> {artikel.aufrufe} Aufrufe
        </div>

        <div className="flex gap-2 mt-auto pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="text-xs h-8 flex-1" asChild>
            <a href={`/api/seo/artikel/${artikel.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> Ansehen
            </a>
          </Button>
          {veroeffentlicht ? (
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={onPausieren} data-testid={`button-pausieren-${artikel.id}`}>
              <Pause className="h-3 w-3 mr-1" /> Pausieren
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="text-xs h-8" onClick={onReaktivieren} data-testid={`button-reaktivieren-${artikel.id}`}>
              <Play className="h-3 w-3 mr-1" /> Reaktivieren
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground/60">
          {artikel.veroeffentlichtAm
            ? new Date(artikel.veroeffentlichtAm).toLocaleString("de-DE")
            : new Date(artikel.createdAt).toLocaleString("de-DE")}
        </div>
      </CardContent>
    </Card>
  );
}
