import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetDashboardKpis, useGetRevenueStatus, useStartAllAgents, useMasterOptimize } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, DollarSign, Megaphone, Target, Zap, TrendingUp, Users, BarChart3, CheckCircle, XCircle, Shield, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import { apiFetch } from "@/lib/api-fetch";

interface SystemStatus {
  openaiVerfuegbar: boolean;
  openaiModus: string;
  stripeVerfuegbar: boolean;
  stripeTestModus: boolean;
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

function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/system/status");
      if (!res.ok) throw new Error("Status nicht verfügbar");
      return res.json() as Promise<SystemStatus>;
    },
    refetchInterval: 30_000,
    retry: false,
  });
}

export default function Dashboard() {
  const { data: kpis, isLoading } = useGetDashboardKpis({
    query: { refetchInterval: 30000 } as any
  });
  const { data: revenueStatus, refetch: refetchRevenue } = useGetRevenueStatus({
    query: { refetchInterval: 30000 } as any
  });
  const { data: systemStatus } = useSystemStatus();
  const startAll = useStartAllAgents();
  const deepOptimize = useMasterOptimize();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [systemGestartet, setSystemGestartet] = useState(false);
  const [optimierungLaeuft, setOptimierungLaeuft] = useState(false);

  const formatCurrency = (val?: number | null, _s = Number.isFinite(Number(val)) ? Number(val) : 0) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(_s);

  const handleStartAll = () => {
    setSystemGestartet(true);
    toast({ title: "⚡ SYSTEM WIRD GESTARTET", description: "Alle Revenue-Agenten werden aktiviert..." });
    startAll.mutate(undefined, {
      onSuccess: (data) => {
        void refetchRevenue();
        toast({ title: "✅ System aktiv", description: data.message });
      },
      onError: () => {
        setSystemGestartet(false);
        toast({ title: "Fehler", description: "System-Start fehlgeschlagen — bitte erneut versuchen", variant: "destructive" });
      },
    });
  };

  const handleDeepOptimize = () => {
    setOptimierungLaeuft(true);
    toast({
      title: "🧠 OPTIMIERUNGS-ZYKLUS LÄUFT",
      description: "Analyse von 12 Quellen in 3s — True-ROI-Neubewertung + Auto-Streams...",
    });
    deepOptimize.mutate(undefined, {
      onSuccess: (data) => {
        void queryClient.invalidateQueries();
        void refetchRevenue();
        toast({ title: "✅ Optimierung abgeschlossen", description: data.message });
        setOptimierungLaeuft(false);
      },
      onError: () => {
        setOptimierungLaeuft(false);
        toast({ title: "Fehler", description: "Optimierung fehlgeschlagen — bitte erneut versuchen", variant: "destructive" });
      },
    });
  };

  if (isLoading || !kpis) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full bg-card" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full bg-card" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1,2].map(i => <Skeleton key={i} className="h-32 w-full bg-card" />)}
        </div>
      </div>
    );
  }

  const isRunning = startAll.isPending || systemGestartet;
  const hatWarnungen = systemStatus?.warnungen && systemStatus.warnungen.length > 0;

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">Kommandozentrum</h2>
        <p className="text-muted-foreground text-xs md:text-sm">System-Status und Live-Metriken</p>
      </div>

      {/* ─── SYSTEM-STATUS BANNER ─────────────────────────────────────── */}
      {systemStatus && (
        <div className="grid grid-cols-1 gap-2">
          {/* Warnungen */}
          {systemStatus.warnungen.map((warnung, i) => (
            <div key={i} className={cn(
              "flex items-start gap-2 rounded-md px-3 py-2 text-xs font-mono border",
              warnung.startsWith("🚨")
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            )}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{warnung}</span>
            </div>
          ))}

          {/* Status-Leiste: OpenAI / Stripe / Gesundheit */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-card border border-border rounded-md text-[10px] font-mono">
            <Shield className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground mr-1">SYSTEM HEALTH</span>

            {/* OpenAI */}
            <span className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded border",
              systemStatus.openaiVerfuegbar
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            )}>
              {systemStatus.openaiVerfuegbar
                ? <CheckCircle className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
              OpenAI {systemStatus.openaiVerfuegbar ? "LIVE" : "FALLBACK"}
            </span>

            {/* Stripe */}
            <span className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded border",
              systemStatus.stripeLiveKey
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : systemStatus.stripeTestModus
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-gray-500/10 border-gray-500/30 text-gray-400"
            )}>
              {systemStatus.stripeLiveKey
                ? <CheckCircle className="h-3 w-3" />
                : <XCircle className="h-3 w-3" />}
              Stripe {systemStatus.stripeLiveKey ? "LIVE" : systemStatus.stripeTestModus ? "TEST ⚠️" : "N/A"}
            </span>

            {/* Erfolgsrate */}
            <span className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded border",
              systemStatus.erfolgsrate24h >= 80
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : systemStatus.erfolgsrate24h >= 50
                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            )}>
              <Activity className="h-3 w-3" />
              Erfolgsrate {systemStatus.erfolgsrate24h}%
            </span>

            {/* Fallbacks */}
            {systemStatus.gesamtFallbacks > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded border bg-orange-500/10 border-orange-500/30 text-orange-400">
                <AlertTriangle className="h-3 w-3" />
                {systemStatus.gesamtFallbacks} Fallbacks
              </span>
            )}

            <span className="ml-auto text-muted-foreground">
              Health: {systemStatus.systemGesundheit}/100
            </span>
          </div>
        </div>
      )}

      {/* ⚡ HAUPT-START-BUTTON */}
      <Card className={cn(
        "border-2 transition-all duration-300",
        isRunning
          ? "border-primary bg-primary/5 shadow-[0_0_30px_hsl(var(--primary)/0.15)]"
          : "border-primary/30 bg-card hover:border-primary/60"
      )}>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  isRunning ? "bg-primary animate-pulse" : "bg-muted-foreground"
                )} />
                <span className="text-xs font-mono text-muted-foreground">
                  {isRunning ? "SYSTEM LÄUFT — AGENTEN AKTIV" : "SYSTEM BEREIT"}
                </span>
              </div>
              <h3 className="text-base md:text-lg font-bold text-foreground">
                Autonomes Revenue-System
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {revenueStatus
                  ? `${revenueStatus.aktiveChancen ?? 0} aktive Chancen · ~${formatCurrency(revenueStatus.geschaetzterMonatsumsatz)}/Monat geschätzt`
                  : "13 Agenten · Master + Revenue Analyst · Stripe-Integration"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                size="lg"
                data-testid="btn-start-all"
                className={cn(
                  "h-12 px-6 md:px-8 font-bold text-sm tracking-wider gap-2 transition-all",
                  isRunning
                    ? "bg-primary/20 text-primary border border-primary cursor-default"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                )}
                onClick={!isRunning ? handleStartAll : undefined}
                disabled={startAll.isPending}
              >
                <Zap className={cn("h-4 w-4", isRunning && "animate-pulse")} />
                {startAll.isPending ? "STARTET..." : isRunning ? "SYSTEM AKTIV" : "⚡ SYSTEM STARTEN"}
              </Button>
              <Button
                size="lg"
                data-testid="btn-deep-optimize"
                className={cn(
                  "h-12 px-6 md:px-8 font-bold text-sm tracking-wider gap-2 transition-all",
                  "bg-transparent text-primary border border-primary hover:bg-primary/10",
                  "shadow-[0_0_20px_hsl(var(--primary)/0.35)] hover:shadow-[0_0_28px_hsl(var(--primary)/0.55)]",
                  optimierungLaeuft && "cursor-default opacity-90"
                )}
                onClick={!optimierungLaeuft ? handleDeepOptimize : undefined}
                disabled={deepOptimize.isPending}
              >
                <Sparkles className={cn("h-4 w-4", optimierungLaeuft && "animate-pulse")} />
                {optimierungLaeuft ? "OPTIMIERT..." : "🧠 SYSTEM-OPTIMIERUNG STARTEN"}
              </Button>
            </div>
          </div>

          {/* Revenue-Chancen Schnellstatus */}
          {revenueStatus && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-primary">{revenueStatus.aktiveChancen}</div>
                <div className="text-[9px] text-muted-foreground">Aktive Chancen</div>
              </div>
              <div>
                <div className="text-lg font-bold">{revenueStatus.offeneChancen}</div>
                <div className="text-[9px] text-muted-foreground">Offen</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-400">{revenueStatus.mitStripeLink}</div>
                <div className="text-[9px] text-muted-foreground">Stripe-Links</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-400">{revenueStatus.mitAffiliateLink}</div>
                <div className="text-[9px] text-muted-foreground">Affiliate</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Grid — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Umsatz Heute</CardTitle>
            <DollarSign className="h-3.5 w-3.5 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="kpi-umsatz-heute">
              {formatCurrency(kpis.umsatzHeute)}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Agenten</CardTitle>
            <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="kpi-aktive-agenten">
              {kpis.aktiviertAgenten} / {systemStatus?.agentenGesamt ?? 26}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
              {kpis.systemStatus}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Kampagnen</CardTitle>
            <Megaphone className="h-3.5 w-3.5 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="kpi-kampagnen">
              {kpis.aktiveCampaigns}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground leading-tight">Gesamt-ROI</CardTitle>
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="kpi-roi">
              {kpis.roi}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Agenten-Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="glass-card">
          <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />Wochenumsatz
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-2xl md:text-3xl font-bold tracking-tighter" data-testid="kpi-umsatz-woche">
              {formatCurrency(kpis.umsatzWoche)}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Monatsumsatz
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-2xl md:text-3xl font-bold tracking-tighter text-primary" data-testid="kpi-umsatz-monat">
              {formatCurrency(kpis.umsatzMonat)}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />Content-Pieces
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <div className="text-2xl md:text-3xl font-bold tracking-tighter">
              {kpis.contentPieces}
            </div>
            <p className="text-xs text-muted-foreground mt-1">KI-generiert</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
