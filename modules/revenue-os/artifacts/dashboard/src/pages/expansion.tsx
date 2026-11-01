import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import {
  TrendingUp, Zap, CheckCircle, XCircle, ExternalLink, Play,
  Pause, Shield, BarChart3, Clock, DollarSign, AlertTriangle,
  RefreshCw, Search, Users, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface ExpansionChance {
  id: number;
  titel: string;
  beschreibung: string;
  kategorie: string;
  plattform: string | null;
  kosten: string | null;
  geschaetzterUmsatz: string | null;
  roi: string | null;
  kostenlos: boolean | null;
  sofortStartbar: boolean | null;
  prioritaet: number | null;
  status: string;
  aktionsUrl: string | null;
  zeitBisErstemUmsatz: string | null;
  monatlichesWachstumPotenzial: string | null;
  validiert: boolean | null;
  entdecktVon: string | null;
  createdAt: string;
}

interface ExpansionStatus {
  gesamt: number;
  aktiv: number;
  kostenlos: number;
  sofortStartbar: number;
  geschaetzterMonatsumsatz: number;
}

interface Projektion {
  monat1: { konservativ: number; realistisch: number; optimistisch: number; beschreibung: string; aktionen: string[] };
  monat2: { konservativ: number; realistisch: number; optimistisch: number; beschreibung: string; aktionen: string[] };
  monat3: { konservativ: number; realistisch: number; optimistisch: number; beschreibung: string; aktionen: string[] };
  voraussetzungen: string[];
  risiken: string[];
  kostenlosFuerErstenMonat: boolean;
  offeneChancenAnzahl: number;
  aktivierteChancen: number;
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const kategorieLabel: Record<string, string> = {
  affiliate: "Affiliate",
  eigenes_produkt: "Eigenes Produkt",
  abo: "Abo/Newsletter",
  coaching: "Coaching",
  freelance: "Freelance",
  content: "Content",
};

const wachstumFarbe: Record<string, string> = {
  viral: "text-pink-400",
  hoch: "text-green-400",
  mittel: "text-yellow-400",
  gering: "text-gray-400",
};

const statusFarbe: Record<string, string> = {
  entdeckt: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  aktiv: "bg-green-500/10 text-green-400 border-green-500/20",
  getestet: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  pausiert: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const KATEGORIEN = ["Alle", "affiliate", "eigenes_produkt", "abo", "coaching", "freelance", "content"];

// ─── Expansion-Agenten Team ───────────────────────────────────────────────────

const EXPANSION_TEAM = [
  {
    name: "Opportunity Scanner",
    beschreibung: "Durchsucht 50+ Plattformen und Programme nach kostenlosen Umsatzquellen. Priorisiert nach Sofort-Potential.",
    icon: Search,
    farbe: "text-blue-400",
    takt: "alle 6h",
  },
  {
    name: "ROI Validator",
    beschreibung: "Prüft jede Chance auf Kosten-Nutzen-Verhältnis. Blockiert alle Ausgaben wo Umsatz < 200% der Kosten.",
    icon: Shield,
    farbe: "text-green-400",
    takt: "bei jeder neuen Chance",
  },
  {
    name: "Growth Hacker",
    beschreibung: "Findet Viral-Strategien und Wachstums-Hebel für organische Reichweite ohne Werbekosten.",
    icon: TrendingUp,
    farbe: "text-pink-400",
    takt: "tägl. 10:00",
  },
  {
    name: "Partnership Scout",
    beschreibung: "Identifiziert Affiliate-Netzwerke, JV-Partner und Cross-Promotions. Stellt Kooperations-Templates bereit.",
    icon: Users,
    farbe: "text-yellow-400",
    takt: "alle 12h",
  },
];

// ─── Komponenten ──────────────────────────────────────────────────────────────

function ProjektionsCard({ projektion }: { projektion: Projektion }) {
  const [monat, setMonat] = useState<1 | 2 | 3>(1);
  const aktuellerMonat = projektion[`monat${monat}`];
  const fmt = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Realistische Umsatzprognose
          </CardTitle>
          <div className="flex gap-1">
            {([1, 2, 3] as const).map(m => (
              <button key={m} onClick={() => setMonat(m)}
                className={cn("text-[10px] font-mono px-2 py-0.5 rounded border transition-all",
                  monat === m ? "bg-primary text-black border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                )}>M{m}</button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-background/50 rounded p-2">
            <div className="text-lg font-bold text-gray-400">{fmt(aktuellerMonat.konservativ)}</div>
            <div className="text-[9px] text-muted-foreground">Konservativ</div>
          </div>
          <div className="bg-primary/5 border border-primary/20 rounded p-2">
            <div className="text-lg font-bold text-primary">{fmt(aktuellerMonat.realistisch)}</div>
            <div className="text-[9px] text-primary/60">Realistisch ★</div>
          </div>
          <div className="bg-background/50 rounded p-2">
            <div className="text-lg font-bold text-green-400">{fmt(aktuellerMonat.optimistisch)}</div>
            <div className="text-[9px] text-muted-foreground">Optimistisch</div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">{aktuellerMonat.beschreibung}</p>

        <div className="space-y-1">
          <div className="text-[9px] text-muted-foreground font-mono">MONAT {monat} AKTIONEN:</div>
          {aktuellerMonat.aktionen.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px]">
              <CheckCircle className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          <div className="text-[9px] text-orange-400 font-mono mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />WICHTIGE HINWEISE:
          </div>
          {projektion.risiken.slice(0, 2).map((r, i) => (
            <div key={i} className="text-[10px] text-muted-foreground">• {r}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChanceCard({ chance, onAktivieren, onPausieren }: {
  chance: ExpansionChance;
  onAktivieren: (id: number) => void;
  onPausieren: (id: number) => void;
}) {
  const kosten = parseFloat(chance.kosten ?? "0");
  const umsatz = parseFloat(chance.geschaetzterUmsatz ?? "0");
  const fmt = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <Card className={cn("bg-card border transition-all duration-200 flex flex-col",
      chance.status === "aktiv" ? "border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.08)]" : "border-border"
    )}>
      <CardContent className="p-4 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-xs font-bold leading-tight">{chance.titel}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[9px] text-muted-foreground font-mono">{chance.plattform}</span>
              {chance.kostenlos && (
                <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 rounded">GRATIS</span>
              )}
              {chance.sofortStartbar && (
                <span className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 rounded">SOFORT</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={`text-[9px] h-4 ${statusFarbe[chance.status] ?? ""}`}>
              {chance.status.toUpperCase()}
            </Badge>
            <span className="text-[9px] font-mono text-muted-foreground">
              {kategorieLabel[chance.kategorie] ?? chance.kategorie}
            </span>
          </div>
        </div>

        {/* Beschreibung */}
        <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 mb-3 flex-1">{chance.beschreibung}</p>

        {/* Zahlen */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-background/50 rounded p-2 text-center">
            <div className="text-base font-bold text-primary">{fmt(umsatz)}</div>
            <div className="text-[9px] text-muted-foreground">Gesch./Monat</div>
          </div>
          <div className="bg-background/50 rounded p-2 text-center">
            <div className={cn("text-base font-bold", wachstumFarbe[chance.monatlichesWachstumPotenzial ?? "gering"] ?? "")}>
              {chance.monatlichesWachstumPotenzial ?? "—"}
            </div>
            <div className="text-[9px] text-muted-foreground">Wachstum</div>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {chance.zeitBisErstemUmsatz ?? "Unbekannt"}
          </span>
          <span className="flex items-center gap-1">
            {chance.validiert
              ? <CheckCircle className="h-2.5 w-2.5 text-green-400" />
              : <XCircle className="h-2.5 w-2.5 text-gray-400" />}
            {chance.validiert ? "ROI validiert" : "Nicht validiert"}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {chance.status === "aktiv" ? (
            <Button size="sm" variant="secondary" className="flex-1 h-7 text-[10px]"
              onClick={() => onPausieren(chance.id)}>
              <Pause className="h-3 w-3 mr-1" />Pausieren
            </Button>
          ) : (
            <Button size="sm" className="flex-1 h-7 text-[10px] bg-primary text-black hover:bg-primary/90"
              onClick={() => onAktivieren(chance.id)}>
              <Play className="h-3 w-3 mr-1" />Aktivieren
            </Button>
          )}
          {chance.aktionsUrl && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
              onClick={() => window.open(chance.aktionsUrl!, "_blank")}>
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function Expansion() {
  const [filterKategorie, setFilterKategorie] = useState("Alle");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chancen, isLoading: chancenLoading } = useQuery<ExpansionChance[]>({
    queryKey: ["expansion-chancen"],
    queryFn: async () => {
      const res = await apiFetch("/api/expansion/chancen");
      if (!res.ok) throw new Error("Chancen nicht verfügbar");
      return res.json() as Promise<ExpansionChance[]>;
    },
    refetchInterval: 30_000,
  });

  const { data: expansionStatus } = useQuery<ExpansionStatus>({
    queryKey: ["expansion-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/expansion/status");
      if (!res.ok) throw new Error("Status nicht verfügbar");
      return res.json() as Promise<ExpansionStatus>;
    },
    refetchInterval: 30_000,
  });

  const { data: projektion } = useQuery<Projektion>({
    queryKey: ["expansion-projektion"],
    queryFn: async () => {
      const res = await apiFetch("/api/expansion/projektion");
      if (!res.ok) throw new Error("Projektion nicht verfügbar");
      return res.json() as Promise<Projektion>;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/expansion/scan", { method: "POST" });
      if (!res.ok) throw new Error("Scan fehlgeschlagen");
      return res.json() as Promise<{ entdeckt: number; gespeichert: number }>;
    },
    onSuccess: (data) => {
      toast({ title: "✅ Scan abgeschlossen", description: `${data.entdeckt} Chancen gescannt, ${data.gespeichert} neu gespeichert` });
      void queryClient.invalidateQueries({ queryKey: ["expansion-chancen"] });
      void queryClient.invalidateQueries({ queryKey: ["expansion-status"] });
    },
    onError: () => toast({ title: "Fehler", description: "Scan fehlgeschlagen", variant: "destructive" }),
  });

  const aktivierenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/expansion/chancen/${id}/aktivieren`, { method: "POST" });
      if (!res.ok) throw new Error("Aktivierung fehlgeschlagen");
    },
    onSuccess: () => {
      toast({ title: "⚡ Chance aktiviert", description: "Die Umsatz-Chance wurde gestartet" });
      void queryClient.invalidateQueries({ queryKey: ["expansion-chancen"] });
      void queryClient.invalidateQueries({ queryKey: ["expansion-status"] });
    },
  });

  const pausierenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/expansion/chancen/${id}/pausieren`, { method: "POST" });
      if (!res.ok) throw new Error("Pausierung fehlgeschlagen");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expansion-chancen"] });
      void queryClient.invalidateQueries({ queryKey: ["expansion-status"] });
    },
  });

  const gefilterteChancen = chancen?.filter(c =>
    filterKategorie === "Alle" || c.kategorie === filterKategorie
  ) ?? [];

  const fmt = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Expansion</h2>
          <p className="text-muted-foreground text-xs md:text-sm">
            Autonome Umsatz-Chancen — kostenlos zuerst, ROI-validiert, 24/7
          </p>
        </div>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="bg-primary text-black hover:bg-primary/90 h-9 text-xs gap-1.5 shrink-0"
        >
          {scanMutation.isPending
            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Scannt...</>
            : <><Search className="h-3.5 w-3.5" />Neuen Scan starten</>}
        </Button>
      </div>

      {/* KPI Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Chancen gesamt", val: expansionStatus?.gesamt ?? 0, icon: Sparkles, farbe: "text-blue-400" },
          { label: "Aktiv", val: expansionStatus?.aktiv ?? 0, icon: Play, farbe: "text-green-400" },
          { label: "Kostenlos", val: expansionStatus?.kostenlos ?? 0, icon: CheckCircle, farbe: "text-primary" },
          { label: "Gesch. Umsatz", val: fmt(expansionStatus?.geschaetzterMonatsumsatz ?? 0), icon: DollarSign, farbe: "text-primary" },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <kpi.icon className={cn("h-4 w-4 shrink-0", kpi.farbe)} />
              <div className="min-w-0">
                <div className="text-base font-bold">{kpi.val}</div>
                <div className="text-[9px] text-muted-foreground leading-tight">{kpi.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2-Spalten Layout: Prognose + Expansion-Team */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Umsatzprognose */}
        {projektion ? (
          <ProjektionsCard projektion={projektion} />
        ) : (
          <Skeleton className="h-64 bg-card" />
        )}

        {/* Expansion-Agenten-Team */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Expansion-Agenten-Team
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {EXPANSION_TEAM.map((agent) => (
              <div key={agent.name} className="flex items-start gap-3 bg-background/40 rounded p-2.5">
                <agent.icon className={cn("h-4 w-4 shrink-0 mt-0.5", agent.farbe)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{agent.name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{agent.takt}</span>
                    <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{agent.beschreibung}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Filter-Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {KATEGORIEN.map(k => (
          <button key={k} onClick={() => setFilterKategorie(k)}
            className={cn(
              "text-[10px] font-medium px-3 py-1 rounded-full border transition-all",
              filterKategorie === k
                ? "bg-primary text-black border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            )}>
            {kategorieLabel[k] ?? k}
            {k !== "Alle" && chancen && (
              <span className="ml-1 opacity-60">
                ({chancen.filter(c => c.kategorie === k).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chancen-Grid */}
      {chancenLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-64 bg-card" />)}
        </div>
      ) : gefilterteChancen.length === 0 ? (
        <Card className="bg-card border-dashed border-border">
          <CardContent className="p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Keine Chancen gefunden</p>
            <Button size="sm" className="mt-3 bg-primary text-black"
              onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              Scan starten
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {gefilterteChancen.map((chance) => (
            <ChanceCard
              key={chance.id}
              chance={chance}
              onAktivieren={(id) => aktivierenMutation.mutate(id)}
              onPausieren={(id) => pausierenMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Voraussetzungen Banner */}
      {projektion && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] font-mono text-muted-foreground mb-2">VORAUSSETZUNGEN FÜR ERSTEN UMSATZ</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {projektion.voraussetzungen.map((v, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  <CheckCircle className={cn("h-3 w-3 shrink-0 mt-0.5",
                    v.includes("✅") ? "text-green-400" : "text-yellow-400")} />
                  <span className={v.includes("✅") ? "text-foreground" : "text-muted-foreground"}>{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
