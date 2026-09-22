import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, HelpCircle, FileText, Mail, Search as SearchIcon } from "lucide-react";

import { apiFetch } from "@/lib/api-fetch";

interface AttributionEintrag {
  typ: string;
  id: number;
  label: string;
  umsatz: number;
  anzahlZahlungen: number;
}

interface AttributionUebersicht {
  gesamtUmsatz: number;
  attribuierterUmsatz: number;
  nichtZugeordneterUmsatz: number;
  topContent: AttributionEintrag[];
}

const TYP_LABELS: Record<string, { label: string; icon: typeof FileText }> = {
  seo_content: { label: "SEO-Artikel", icon: SearchIcon },
  email_sequenz: { label: "E-Mail-Sequenz", icon: Mail },
  content: { label: "Content", icon: FileText },
  produkt: { label: "Produkt", icon: Target },
};

function formatEuro(betrag: number): string {
  return betrag.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function Attribution() {
  const { data, isLoading } = useQuery<AttributionUebersicht>({
    queryKey: ["attribution-uebersicht"],
    queryFn: async () => {
      const res = await apiFetch("/api/attribution/uebersicht");
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json() as Promise<AttributionUebersicht>;
    },
    refetchInterval: 20_000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const { gesamtUmsatz, attribuierterUmsatz, nichtZugeordneterUmsatz, topContent } = data;
  const attribuierterAnteil = gesamtUmsatz > 0 ? Math.round((attribuierterUmsatz / gesamtUmsatz) * 100) : 0;
  const maxUmsatz = topContent.length > 0 ? Math.max(...topContent.map(e => e.umsatz)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Umsatz-Attribution
        </h2>
        <p className="text-muted-foreground text-sm">
          Welcher Content hat wirklich zu einer echten Stripe-Zahlung geführt — nachverfolgt über Tracking-Links,
          die bei jedem Klick auf einen Produkt-Link mitgegeben werden.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Gesamtumsatz</div>
            <div className="text-2xl font-bold mt-1">{formatEuro(gesamtUmsatz)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Content zugeordnet</div>
            <div className="text-2xl font-bold mt-1 text-primary">{formatEuro(attribuierterUmsatz)}</div>
            <div className="text-xs text-muted-foreground mt-1">{attribuierterAnteil}% des Umsatzes</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <HelpCircle className="h-3 w-3" /> Nicht zugeordnet
            </div>
            <div className="text-2xl font-bold mt-1 text-muted-foreground">{formatEuro(nichtZugeordneterUmsatz)}</div>
            <div className="text-xs text-muted-foreground mt-1">Direktverkäufe ohne Tracking-Link</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
          <TrendingUp className="h-3 w-3" /> Top-Content nach echtem Umsatz ({topContent.length})
        </div>
        {topContent.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">
            Noch keine zugeordneten Zahlungen — sobald über einen SEO-Artikel oder eine E-Mail-Sequenz verkauft wird,
            erscheint hier die Rangliste.
          </div>
        ) : (
          <div className="space-y-2">
            {topContent.map((eintrag) => {
              const meta = TYP_LABELS[eintrag.typ] ?? { label: eintrag.typ, icon: FileText };
              const Icon = meta.icon;
              const balken = maxUmsatz > 0 ? Math.max(4, Math.round((eintrag.umsatz / maxUmsatz) * 100)) : 0;
              return (
                <Card key={`${eintrag.typ}-${eintrag.id}`} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{eintrag.label}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{meta.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{eintrag.anzahlZahlungen}x bezahlt</span>
                        <span className="text-sm font-bold text-primary">{formatEuro(eintrag.umsatz)}</span>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${balken}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
