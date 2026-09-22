import {
  useGetFinanceTeamOverview,
  useScanFinanceTeam,
  useBestaetigeRegistrierung,
  getGetFinanceTeamOverviewQueryKey,
  useListCampaigns,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ExternalLink, CheckCircle2, Sparkles, RefreshCw, ListChecks, Megaphone, TrendingUp, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fmtEUR = (n?: number | null, _s = Number.isFinite(Number(n)) ? Number(n) : 0) =>
  Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(_s);

const fmtDatum = (iso: string | null | undefined) =>
  iso ? Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short" }).format(new Date(iso)) : "—";

const KONFIDENZ_STYLE: Record<string, string> = {
  niedrig: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  mittel: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  hoch: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function FinanceTeam() {
  const { data: overview, isLoading } = useGetFinanceTeamOverview({
    query: { refetchInterval: 30000 } as any,
  });
  const { data: kampagnen } = useListCampaigns({
    query: { refetchInterval: 30000 } as any,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const scan = useScanFinanceTeam();
  const bestaetigen = useBestaetigeRegistrierung();

  const affiliateKampagnen = (kampagnen ?? []).filter(k => k.typ === "affiliate");

  const handleScan = () => {
    scan.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetFinanceTeamOverviewQueryKey() });
        toast({ title: "🧠 Finance-Team gescannt", description: data.message });
      },
    });
  };

  const handleBestaetigen = (id: number, titel: string) => {
    bestaetigen.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getGetFinanceTeamOverviewQueryKey() });
          toast({ title: `✅ ${titel}`, description: data.message });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40 w-full bg-card" />)}
      </div>
    );
  }

  const vorbereitet = overview?.vorbereiteteRegistrierungen ?? [];
  const empfehlungen = overview?.topEmpfehlungen ?? [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Finance-Optimierungs-Team</h2>
          <p className="text-muted-foreground text-xs md:text-sm">
            Autonomes Affiliate-Experten-Team — analysiert, bereitet Registrierungen vor, du bestätigst mit einem Klick
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleScan}
          disabled={scan.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`} />
          Team jetzt scannen
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-primary">{overview?.aktiveKampagnen ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Aktive Kampagnen</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-green-400">{fmtEUR(overview?.gesamtUmsatzKampagnen ?? 0)}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Umsatz Kampagnen</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-yellow-400">{overview?.wartendeRegistrierungen ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Wartend auf Bestätigung</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold">{affiliateKampagnen.length}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Auto-erstellte Kampagnen</p>
          </CardContent>
        </Card>
      </div>

      {/* Umsatzprognose */}
      {overview?.umsatzPrognose && (
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Umsatzprognose — wann kommt echtes Geld?
              </CardTitle>
              <Badge variant="outline" className={`text-[9px] shrink-0 ${KONFIDENZ_STYLE[overview.umsatzPrognose.konfidenz] ?? ""}`}>
                Konfidenz: {overview.umsatzPrognose.konfidenz.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            {overview.umsatzPrognose.status === "wachstum" ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <TrendingUp className="h-5 w-5 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-400">
                    Erster echter Umsatz bereits erzielt: {fmtEUR(overview.umsatzPrognose.echterGesamtUmsatz)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{overview.umsatzPrognose.hinweis}</p>
                </div>
              </div>
            ) : overview.umsatzPrognose.status === "keine_kampagnen" ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border border-border">
                <CalendarClock className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">{overview.umsatzPrognose.hinweis}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                  <CalendarClock className="h-5 w-5 text-yellow-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">
                      Geschätzt: {fmtDatum(overview.umsatzPrognose.geschaetztesDatumVon)} – {fmtDatum(overview.umsatzPrognose.geschaetztesDatumBis)}
                      {" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        ({overview.umsatzPrognose.geschaetzteTageBisErsteEinnahmeMin}–{overview.umsatzPrognose.geschaetzteTageBisErsteEinnahmeMax} Tage)
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{overview.umsatzPrognose.hinweis}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team-Empfehlungen */}
      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Team-Empfehlungen — priorisiert
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {empfehlungen.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Noch keine Empfehlungen — das Team scannt automatisch alle 20 Minuten
            </p>
          ) : (
            <div className="space-y-2">
              {empfehlungen.map((e) => (
                <div key={e.opportunityId} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/40 border border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{e.titel}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{e.begruendung}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary shrink-0">{fmtEUR(e.geschaetzterMonatsumsatz)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vorbereitete Registrierungen */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          Vorbereitete Registrierungen — bereit zur Bestätigung
        </h3>
        {vorbereitet.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-md">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>Keine offenen Registrierungen</p>
            <p className="text-xs mt-1">Der Affiliate-Registrierungs-Agent scannt automatisch alle 10 Minuten</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vorbereitet.map((v) => (
              <Card key={v.id} className="bg-card border-border flex flex-col">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-tight">{v.titel}</CardTitle>
                    <Badge variant="outline" className="text-[9px] shrink-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                      VORBEREITET
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{v.marke ?? "—"}</p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 pt-0 gap-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Geschätzt/Monat</span>
                    <span className="font-bold text-primary font-mono">{fmtEUR(v.geschaetzterMonatsumsatz)}</span>
                  </div>

                  {v.registrierungsAnleitung && v.registrierungsAnleitung.length > 0 && (
                    <ol className="text-[10px] text-muted-foreground space-y-1 list-decimal list-inside">
                      {v.registrierungsAnleitung.slice(0, 3).map((s) => (
                        <li key={s.schritt} className="truncate">{s.titel}</li>
                      ))}
                    </ol>
                  )}

                  <div className="flex gap-2 flex-wrap mt-auto pt-1">
                    {v.registrierungsLink && (
                      <a href={v.registrierungsLink} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1">
                          <ExternalLink className="h-3 w-3" />
                          Sofort-Start-Link
                        </Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary gap-1"
                      onClick={() => handleBestaetigen(v.id, v.titel)}
                      disabled={bestaetigen.isPending}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Jetzt bestätigen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Automatisch erstellte Kampagnen */}
      {affiliateKampagnen.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            Automatisch erstellte Kampagnen
          </h3>
          <div className="space-y-1.5">
            {affiliateKampagnen.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/40 border border-border">
                <span className="text-xs font-medium truncate">{k.name}</span>
                <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">
                  {k.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
