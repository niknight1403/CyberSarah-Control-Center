import {
  useGetHaraOverview,
  useScanHara,
  useBestaetigeHaraProposal,
  useVerwerfeHaraProposal,
  useErledigeHaraSchritt,
  getGetHaraOverviewQueryKey,
} from "@workspace/api-client-react";
import type { HaraProposal, HaraSchritt } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Circle,
  Zap,
  Target,
  Gauge,
  Cog,
  BrainCircuit,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fmtEUR = (n?: number | null, _s = Number.isFinite(Number(n)) ? Number(n) : 0) =>
  Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(_s);

const STATUS_STYLE: Record<string, string> = {
  vorgeschlagen: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  bestaetigt: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_umsetzung: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  abgeschlossen: "bg-green-500/10 text-green-400 border-green-500/20",
  verworfen: "bg-red-500/10 text-red-400 border-red-500/20",
};

const STATUS_LABEL: Record<string, string> = {
  vorgeschlagen: "WARTET AUF CONFIRM",
  bestaetigt: "BESTÄTIGT",
  in_umsetzung: "IN UMSETZUNG",
  abgeschlossen: "ABGESCHLOSSEN",
  verworfen: "VERWORFEN",
};

const RESULTAT_STYLE: Record<string, string> = {
  erfolg: "bg-green-500/10 text-green-400 border-green-500/20",
  misserfolg: "bg-red-500/10 text-red-400 border-red-500/20",
  verworfen: "bg-muted text-muted-foreground border-border",
};

function ScoreBadge({ label, wert, icon: Icon }: { label: string; wert: number; icon: typeof Target }) {
  const farbe = wert >= 70 ? "text-green-400" : wert >= 40 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold font-mono ${farbe}`}>{wert}</span>
    </div>
  );
}

function SchrittZeile({
  schritt,
  index,
  proposal,
  onErledigt,
  pending,
}: {
  schritt: HaraSchritt;
  index: number;
  proposal: HaraProposal;
  onErledigt: (proposalId: number, index: number) => void;
  pending: boolean;
}) {
  const istAktiv = proposal.status === "in_umsetzung" || proposal.status === "bestaetigt";
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
      {schritt.status === "erledigt" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 flex-shrink-0" />
      ) : schritt.status === "fehlgeschlagen" ? (
        <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 flex-shrink-0" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${schritt.status === "erledigt" ? "text-muted-foreground line-through" : ""}`}>
          {schritt.beschreibung}
        </p>
        {schritt.ergebnis && (
          <p className="text-[10px] text-muted-foreground mt-0.5">→ {schritt.ergebnis}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {schritt.typ === "manuell" ? "DU" : "AUTO"}
        </Badge>
        {schritt.typ === "manuell" && schritt.status === "offen" && istAktiv && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2"
            disabled={pending}
            onClick={() => onErledigt(proposal.id, index)}
          >
            Erledigt
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Hara() {
  const { data: overview, isLoading } = useGetHaraOverview({
    query: { refetchInterval: 15000 } as any,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const scan = useScanHara();
  const bestaetigen = useBestaetigeHaraProposal();
  const verwerfen = useVerwerfeHaraProposal();
  const erledigen = useErledigeHaraSchritt();

  const refresh = () => queryClient.invalidateQueries({ queryKey: getGetHaraOverviewQueryKey() });

  const handleScan = () => {
    scan.mutate(undefined, {
      onSuccess: (data: any) => {
        if (data.background) {
          toast({ title: "🔍 HARA-Scan gestartet", description: "Läuft im Hintergrund (30-60s) — Daten werden automatisch aktualisiert" });
          setTimeout(() => {
            refresh();
            toast({ title: "🔄 HARA aktualisiert", description: "Neue Vorschläge werden geladen" });
          }, 10000);
        } else {
          refresh();
          toast({ title: "🔍 HARA-Scan abgeschlossen", description: data.message });
        }
      },
      onError: (err: any) => {
        console.error("HARA Fehler:", err);
        toast({ title: "Scan fehlgeschlagen", variant: "destructive" });
      },
    });
  };

  const handleConfirm = (id: number, titel: string) => {
    bestaetigen.mutate(
      { id },
      {
        onSuccess: (data) => {
          refresh();
          toast({ title: `🚀 CONFIRM: ${titel}`, description: data.message });
          // Auto-Schritte laufen asynchron — nach kurzer Zeit nachladen
          setTimeout(refresh, 8000);
          setTimeout(refresh, 20000);
        },
        onError: () => toast({ title: "Bestätigung fehlgeschlagen", variant: "destructive" }),
      },
    );
  };

  const handleVerwerfen = (id: number, titel: string) => {
    verwerfen.mutate(
      { id },
      {
        onSuccess: (data) => {
          refresh();
          toast({ title: `🗑 ${titel}`, description: data.message });
        },
        onError: () => toast({ title: "Verwerfen fehlgeschlagen", variant: "destructive" }),
      },
    );
  };

  const handleErledigt = (id: number, index: number) => {
    erledigen.mutate(
      { id, index },
      {
        onSuccess: (data) => {
          refresh();
          toast({ title: "✅ Schritt erledigt", description: data.message });
        },
        onError: () => toast({ title: "Aktion fehlgeschlagen", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 w-full bg-card" />)}
      </div>
    );
  }

  const proposals = overview?.proposals ?? [];
  const performance = overview?.performance ?? [];
  const stat = overview?.statistik;
  const wartend = proposals.filter(p => p.status === "vorgeschlagen");
  const aktiv = proposals.filter(p => p.status === "bestaetigt" || p.status === "in_umsetzung");
  const historie = proposals.filter(p => p.status === "abgeschlossen" || p.status === "verworfen");

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">HARA — Hyper-Autonomer Revenue Agent</h2>
          <p className="text-muted-foreground text-xs md:text-sm">
            Rekursiver Loop: Chancen finden → Revenue-Paket vorschlagen → du gibst CONFIRM → autonome Umsetzung → aus Ergebnissen lernen
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleScan} disabled={scan.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`} />
          {scan.isPending ? "KI scannt..." : "Jetzt scannen (Phase 1)"}
        </Button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-primary">{stat?.gesamtVorschlaege ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Revenue-Pakete gesamt</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-yellow-400">{stat?.offen ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Warten auf CONFIRM</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-blue-400">{stat?.inUmsetzung ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">In Umsetzung</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-green-400">{stat?.abgeschlossen ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Abgeschlossen</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-primary">
              {stat?.erfolgsquote != null ? `${stat.erfolgsquote}%` : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Erfolgsquote</p>
          </CardContent>
        </Card>
      </div>

      {/* Phase 2: Wartende Vorschläge */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-400" />
            Revenue-Pakete — warten auf dein CONFIRM
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wartend.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Keine offenen Vorschläge — HARA scannt automatisch alle 4 Stunden, oder starte den Scan manuell.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {wartend.map(p => (
                <Card key={p.id} className="bg-background border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-sm">{p.titel}</h4>
                        <p className="text-[10px] text-muted-foreground">{p.marke} · {p.kanal}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-primary">{fmtEUR(p.geschaetzterMonatsumsatz)}/M</div>
                        <div className="text-[9px] text-muted-foreground">geschätzt, konservativ</div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">{p.businessCase}</p>
                    <p className="text-[11px] text-muted-foreground italic">ROI: {p.roiErwartung}</p>

                    <div className="flex flex-wrap gap-3">
                      <ScoreBadge label="ROI" wert={p.roiScore} icon={Target} />
                      <ScoreBadge label="Tempo" wert={p.geschwindigkeitScore} icon={Gauge} />
                      <ScoreBadge label="Auto" wert={p.automatisierbarkeitScore} icon={Cog} />
                      <ScoreBadge label="Gesamt" wert={p.gesamtScore} icon={Zap} />
                    </div>

                    {p.ressourcen.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.ressourcen.map((r, i) => (
                          <Badge key={i} variant="outline" className="text-[9px]">{r}</Badge>
                        ))}
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> Automatisierungs-Pfad ({p.automatisierungsPfad.length} Schritte)
                      </p>
                      {p.automatisierungsPfad.map((s, i) => (
                        <SchrittZeile key={i} schritt={s} index={i} proposal={p} onErledigt={handleErledigt} pending={erledigen.isPending} />
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-xs flex-1 gap-1.5"
                        disabled={bestaetigen.isPending}
                        onClick={() => handleConfirm(p.id, p.titel)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        CONFIRM — autonom umsetzen
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        disabled={verwerfen.isPending}
                        onClick={() => handleVerwerfen(p.id, p.titel)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Verwerfen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 3: In Umsetzung */}
      {aktiv.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-400" />
              In Umsetzung — Auto-Schritte laufen, manuelle Schritte warten auf dich
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aktiv.map(p => (
              <Card key={p.id} className="bg-background border-border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-sm">{p.titel}</h4>
                      <p className="text-[10px] text-muted-foreground">{p.marke} · {p.kanal}</p>
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[p.status] ?? ""}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                  {p.automatisierungsPfad.map((s, i) => (
                    <SchrittZeile key={i} schritt={s} index={i} proposal={p} onErledigt={handleErledigt} pending={erledigen.isPending} />
                  ))}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Phase 4: Lern-Historie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-primary" />
              Self-Optimization — was HARA gelernt hat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {performance.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Noch keine Lern-Einträge — jedes abgeschlossene oder verworfene Paket fließt hier ein und schärft den nächsten Scan.
              </p>
            ) : (
              <div className="space-y-2">
                {performance.map(e => (
                  <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${RESULTAT_STYLE[e.resultat] ?? ""}`}>
                      {e.resultat.toUpperCase()}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{e.titel} {e.kanal ? `(${e.kanal})` : ""}</p>
                      <p className="text-[11px] text-muted-foreground">{e.analyse}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              Historie — abgeschlossen & verworfen
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historie.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Noch keine abgeschlossenen Pakete.</p>
            ) : (
              <div className="space-y-2">
                {historie.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{p.titel}</p>
                      <p className="text-[10px] text-muted-foreground">{p.marke} · {p.kanal} · {fmtEUR(p.geschaetzterMonatsumsatz)}/M geschätzt</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${STATUS_STYLE[p.status] ?? ""}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
