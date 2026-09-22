import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import {
  TrendingUp, TrendingDown, Minus, Play, Square, Zap,
  Brain, RefreshCw, BarChart3, Shield, AlertTriangle, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface MarktDaten {
  symbol: string;
  preis: number;
  aenderung1h: number;
  aenderung24h: number;
  volumen24h: number;
}

interface Position {
  symbol: string;
  menge: number;
  einstiegspreis: number;
  aktuellKurs: number;
  pnlProzent: number;
}

interface TradingDaten {
  portfolio: {
    kassenbestand: number;
    gesamtwert: number;
    gesamtPnL: number;
    gesamtPnLProzent: number;
    winRate: number;
    gesamtTrades: number;
    gewinnTrades: number;
    verlustTrades: number;
    positionen: Position[];
    letzteAktualisierung: string | null;
  };
  strategie: {
    version: number | null;
    name: string | null;
    risikoLevel: string | null;
    winRate: number;
    optimierungszaehler: number;
    letzteOptimierung: string | null;
  };
  orders: Array<{
    id: number;
    symbol: string;
    richtung: string;
    menge: string;
    preis: string;
    gesamt: string;
    pnl: string | null;
    pnlProzent: string | null;
    grund: string | null;
    strategyVersion: number | null;
    createdAt: string | null;
  }>;
  signale: Array<{
    id: number;
    symbol: string;
    signal: string;
    konfidenz: string | null;
    analyse: string | null;
    preis: string | null;
    ausgefuehrt: boolean | null;
    createdAt: string | null;
  }>;
  marktDaten: MarktDaten[];
  aktiv: boolean;
}

// ─── Preis-Karte ──────────────────────────────────────────────────────────────

function PreisKarte({ d }: { d: MarktDaten }) {
  const positiv24 = d.aenderung24h >= 0;
  const positiv1h = d.aenderung1h >= 0;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold">{d.symbol}</span>
          <Badge variant="outline" className={cn("text-[9px]",
            positiv24 ? "text-green-400 border-green-500/20 bg-green-500/10" : "text-red-400 border-red-500/20 bg-red-500/10"
          )}>
            {positiv24 ? "▲" : "▼"} {Math.abs(d.aenderung24h).toFixed(2)}%
          </Badge>
        </div>
        <div className="text-lg font-bold font-mono">
          €{d.preis.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: d.preis > 100 ? 2 : 4 })}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] text-muted-foreground">1h:</span>
          <span className={cn("text-[10px] font-medium", positiv1h ? "text-green-400" : "text-red-400")}>
            {positiv1h ? "+" : ""}{d.aenderung1h.toFixed(2)}%
          </span>
          <span className="text-[10px] text-muted-foreground ml-2">Vol: {(d.volumen24h / 1_000_000).toFixed(0)}M</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Signal-Badge ─────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string }) {
  const config: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    STARK_KAUF: { label: "STARK KAUF", cls: "text-green-400 border-green-500/30 bg-green-500/15", icon: TrendingUp },
    KAUF: { label: "KAUF", cls: "text-green-300 border-green-500/20 bg-green-500/10", icon: TrendingUp },
    HALTEN: { label: "HALTEN", cls: "text-yellow-400 border-yellow-500/20 bg-yellow-500/10", icon: Minus },
    VERKAUF: { label: "VERKAUF", cls: "text-red-300 border-red-500/20 bg-red-500/10", icon: TrendingDown },
    STARK_VERKAUF: { label: "STARK VERK.", cls: "text-red-400 border-red-500/30 bg-red-500/15", icon: TrendingDown },
  };
  const c = config[signal] ?? config["HALTEN"]!;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={cn("text-[9px] gap-1", c.cls)}>
      <Icon className="h-2.5 w-2.5" />{c.label}
    </Badge>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function Trading() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"dashboard" | "trades" | "signale" | "strategie">("dashboard");

  const { data, isLoading } = useQuery<TradingDaten>({
    queryKey: ["trading"],
    queryFn: async () => {
      const res = await apiFetch("/api/trading/daten");
      if (!res.ok) throw new Error("Fehler");
      return res.json() as Promise<TradingDaten>;
    },
    refetchInterval: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/trading/starten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: 5 }) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "🤖 Trading Agent gestartet!", description: "Analysiert alle 5 Minuten — Papertrades aktiv" });
      void queryClient.invalidateQueries({ queryKey: ["trading"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/trading/stoppen", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "⛔ Trading gestoppt" });
      void queryClient.invalidateQueries({ queryKey: ["trading"] });
    },
  });

  const zyklusMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/trading/zyklus", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ analysen: Array<{ signal: string }>; trades: number }>;
    },
    onSuccess: (d) => {
      const signale = d.analysen?.filter(a => a.signal !== "HALTEN").length ?? 0;
      toast({ title: `✅ Analyse abgeschlossen`, description: `${signale} Signale, ${d.trades} Trades` });
      void queryClient.invalidateQueries({ queryKey: ["trading"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 bg-card" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 bg-card" />)}
        </div>
      </div>
    );
  }

  const p = data?.portfolio;
  const s = data?.strategie;
  const pnlPositiv = (p?.gesamtPnL ?? 0) >= 0;

  const TABS = ["dashboard", "trades", "signale", "strategie"] as const;
  const TAB_LABELS: Record<typeof TABS[number], string> = {
    dashboard: "Portfolio", trades: "Trades", signale: "Signale", strategie: "Strategie",
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Micro-Trading Agent
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Autonomer KI-Händler · Self-Optimizing · {data?.strategie.name ?? "Loading..."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm" variant="outline" className="h-8 text-xs gap-1.5"
            onClick={() => zyklusMutation.mutate()}
            disabled={zyklusMutation.isPending}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", zyklusMutation.isPending && "animate-spin")} />
            Jetzt analysieren
          </Button>
          {data?.aktiv ? (
            <Button size="sm" variant="destructive" className="h-8 text-xs gap-1.5"
              onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
              <Square className="h-3.5 w-3.5" />Stop
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs bg-primary text-black hover:bg-primary/90 gap-1.5"
              onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
              <Play className="h-3.5 w-3.5" />Agent starten
            </Button>
          )}
          <div className={cn("h-2 w-2 rounded-full", data?.aktiv ? "bg-green-400 animate-pulse" : "bg-muted-foreground")} />
          <span className="text-[10px] text-muted-foreground">{data?.aktiv ? "AKTIV" : "GESTOPPT"}</span>
        </div>
      </div>

      {/* Paper-Trading Hinweis */}
      <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-[11px] text-yellow-400">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong>Paper-Trading Modus</strong> — Simuliertes Portfolio (€10.000 Startkapital). Kein echtes Geld. 
          Für echtes Trading: Binance-API-Key als Umgebungsvariable eintragen (BINANCE_API_KEY).
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ─── PORTFOLIO TAB ─────────────────────────────────────────────────── */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          {/* KPI-Kacheln */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card border-border">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Gesamtwert</div>
                <div className="text-xl font-bold font-mono">€{(p?.gesamtwert ?? 10000).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</div>
                <div className="text-[9px] text-muted-foreground">Basis: €10.000</div>
              </CardContent>
            </Card>
            <Card className={cn("border", pnlPositiv ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20")}>
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Gesamt P&L</div>
                <div className={cn("text-xl font-bold font-mono", pnlPositiv ? "text-green-400" : "text-red-400")}>
                  {pnlPositiv ? "+" : ""}€{(p?.gesamtPnL ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                </div>
                <div className={cn("text-[9px]", pnlPositiv ? "text-green-400" : "text-red-400")}>
                  {pnlPositiv ? "▲ +" : "▼ "}{(p?.gesamtPnLProzent ?? 0).toFixed(2)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Win-Rate</div>
                <div className="text-xl font-bold font-mono">{(p?.winRate ?? 0).toFixed(1)}%</div>
                <div className="text-[9px] text-muted-foreground">{p?.gewinnTrades ?? 0}W / {p?.verlustTrades ?? 0}V</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-3">
                <div className="text-[10px] text-muted-foreground mb-1">Trades gesamt</div>
                <div className="text-xl font-bold font-mono">{p?.gesamtTrades ?? 0}</div>
                <div className="text-[9px] text-muted-foreground">Kassenbestand: €{(p?.kassenbestand ?? 10000).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</div>
              </CardContent>
            </Card>
          </div>

          {/* Live-Preise */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Live-Marktdaten
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {(data?.marktDaten ?? []).map(d => <PreisKarte key={d.symbol} d={d} />)}
              {(data?.marktDaten ?? []).length === 0 && (
                <div className="col-span-full text-center text-xs text-muted-foreground py-4">
                  Keine Marktdaten — Binance API nicht erreichbar (Dev-Modus: Fallback-Daten werden genutzt)
                </div>
              )}
            </div>
          </div>

          {/* Offene Positionen */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Offene Positionen
            </h3>
            {(p?.positionen ?? []).length === 0 ? (
              <Card className="bg-card border-dashed border-border">
                <CardContent className="p-4 text-center text-xs text-muted-foreground">
                  Keine offenen Positionen — Agent analysiert Einstiegschancen
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {p!.positionen.map(pos => (
                  <Card key={pos.symbol} className={cn("border", pos.pnlProzent >= 0 ? "border-green-500/20" : "border-red-500/20")}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold">{pos.symbol}</span>
                          <div className="text-[10px] text-muted-foreground">
                            {pos.menge.toFixed(8)} × €{pos.einstiegspreis.toLocaleString("de-DE")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={cn("text-sm font-bold", pos.pnlProzent >= 0 ? "text-green-400" : "text-red-400")}>
                            {pos.pnlProzent >= 0 ? "+" : ""}{pos.pnlProzent.toFixed(2)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            Aktuell: €{pos.aktuellKurs.toLocaleString("de-DE")}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TRADES TAB ────────────────────────────────────────────────────── */}
      {tab === "trades" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Letzte Trades</h3>
          {(data?.orders ?? []).length === 0 ? (
            <Card className="bg-card border-dashed border-border">
              <CardContent className="p-6 text-center text-xs text-muted-foreground">
                Noch keine Trades — Starte den Agent und klicke "Jetzt analysieren"
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {data!.orders.map(o => {
                const pnl = o.pnl ? parseFloat(o.pnl) : null;
                const pnlProzent = o.pnlProzent ? parseFloat(o.pnlProzent) : null;
                const istKauf = o.richtung === "KAUF";
                return (
                  <Card key={o.id} className={cn("border", !istKauf && pnl != null
                    ? pnl >= 0 ? "border-green-500/15 bg-green-500/5" : "border-red-500/15 bg-red-500/5"
                    : "border-border bg-card")}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn("text-[9px] shrink-0",
                            istKauf ? "text-blue-400 border-blue-500/20 bg-blue-500/10" : pnl && pnl >= 0 ? "text-green-400 border-green-500/20 bg-green-500/10" : "text-red-400 border-red-500/20 bg-red-500/10"
                          )}>
                            {istKauf ? "KAUF" : "VERKAUF"}
                          </Badge>
                          <span className="text-xs font-bold">{o.symbol}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{o.grund}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold">€{parseFloat(o.gesamt).toLocaleString("de-DE", { minimumFractionDigits: 2 })}</div>
                          {pnl != null && (
                            <div className={cn("text-[10px] font-medium", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                              {pnl >= 0 ? "+" : ""}€{pnl.toFixed(2)} ({pnlProzent != null ? (pnlProzent >= 0 ? "+" : "") + pnlProzent.toFixed(2) + "%" : ""})
                            </div>
                          )}
                          <div className="text-[9px] text-muted-foreground">
                            {o.createdAt ? new Date(o.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : ""}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── SIGNALE TAB ───────────────────────────────────────────────────── */}
      {tab === "signale" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">KI-Handelssignale</h3>
          {(data?.signale ?? []).length === 0 ? (
            <Card className="bg-card border-dashed border-border">
              <CardContent className="p-6 text-center text-xs text-muted-foreground">
                Noch keine Signale — klicke "Jetzt analysieren"
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {data!.signale.map(sig => (
                <Card key={sig.id} className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold shrink-0">{sig.symbol}</span>
                        <SignalBadge signal={sig.signal} />
                        <span className="text-[10px] text-muted-foreground truncate">{sig.analyse}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono">€{sig.preis ? parseFloat(sig.preis).toLocaleString("de-DE") : "?"}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {sig.konfidenz ? parseFloat(sig.konfidenz).toFixed(0) + "% Konfidenz" : ""}
                        </div>
                        {sig.ausgefuehrt && <div className="text-[9px] text-primary">✓ Ausgeführt</div>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── STRATEGIE TAB ─────────────────────────────────────────────────── */}
      {tab === "strategie" && (
        <div className="space-y-4">
          <Card className="bg-card border-primary/30">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                Aktuelle Strategie: {s?.name ?? "–"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Version", value: `v${s?.version ?? 1}`, cls: "text-primary" },
                { label: "Risiko-Level", value: s?.risikoLevel ?? "mittel" },
                { label: "Win-Rate", value: `${(s?.winRate ?? 0).toFixed(1)}%` },
                { label: "Optimierungszyklen", value: `${s?.optimierungszaehler ?? 0}` },
                { label: "Letzte Optimierung", value: s?.letzteOptimierung ? new Date(s.letzteOptimierung).toLocaleDateString("de-DE") : "Noch keine" },
                { label: "Nächste Optimierung", value: `Nach ${20 - ((data?.portfolio.gesamtTrades ?? 0) % 20)} Trades` },
              ].map(item => (
                <div key={item.label} className="bg-background/60 rounded p-2 border border-border">
                  <div className="text-[9px] text-muted-foreground">{item.label}</div>
                  <div className={cn("text-sm font-bold", item.cls)}>{item.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Self-Improvement Mechanismus</span>
              </div>
              <div className="space-y-2 text-[11px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-primary">1</div>
                  <span>Nach jeweils 20 Trades analysiert der Agent seine gesamte Trade-History via OpenAI GPT-4o-mini</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-primary">2</div>
                  <span>Was hat funktioniert? Was nicht? Welche Signale waren falsch? → KI extrahiert Erkenntnisse</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-primary">3</div>
                  <span>Neue Strategie-Version wird angelegt: angepasste Stop-Loss, Take-Profit, Risiko-Level und Entscheidungs-Prompts</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-[9px] font-bold text-primary">4</div>
                  <span>Strategie-Evolution setzt sich fort — der Agent wird mit jeder Generation präziser</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-500/5 border-yellow-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-2 text-[11px] text-yellow-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block mb-1">Für echtes Trading (Live-Geld):</strong>
                  Trage deine Binance API-Keys als Umgebungsvariablen ein: <code className="bg-background px-1 rounded">BINANCE_API_KEY</code> + <code className="bg-background px-1 rounded">BINANCE_SECRET</code>.
                  Der Agent schaltet dann automatisch von Paper-Trading auf echte Orders um.
                  <strong className="block mt-1 text-red-400">Warnung: Echtes Trading beinhaltet Verlustrisiko. Teste ausführlich im Paper-Modus zuerst.</strong>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
