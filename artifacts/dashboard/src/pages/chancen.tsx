import { useState } from "react";
import { useListRevenueOpportunities, useUpdateRevenueOpportunity, getListRevenueOpportunitiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, TrendingUp, Zap, ShoppingCart, Users, Star, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const KANAL_LABELS: Record<string, string> = {
  affiliate: "Affiliate",
  eigenes_produkt: "Eigenes Produkt",
  abo: "Abo",
  coaching: "Coaching",
  freelance: "Freelance",
};

const KANAL_ICONS: Record<string, typeof TrendingUp> = {
  affiliate: TrendingUp,
  eigenes_produkt: ShoppingCart,
  abo: Star,
  coaching: Users,
  freelance: Zap,
};

const STATUS_COLORS: Record<string, string> = {
  entdeckt: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  aktiv: "bg-green-500/10 text-green-400 border-green-500/20",
  getestet: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  pausiert: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const MARKE_COLORS: Record<string, string> = {
  "CyberSarah": "text-purple-400",
  "GeldPilot AI": "text-green-400",
  "UnternehmerGPT": "text-blue-400",
};

type FilterKanal = "alle" | "affiliate" | "eigenes_produkt" | "abo" | "coaching" | "freelance";

export default function Chancen() {
  const { data: chancen, isLoading } = useListRevenueOpportunities({
    query: { refetchInterval: 30000 } as any
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateChance = useUpdateRevenueOpportunity();
  const [filter, setFilter] = useState<FilterKanal>("alle");

  const handleStatusChange = (id: number, newStatus: string, titel: string) => {
    updateChance.mutate(
      { id, data: { status: newStatus as "entdeckt" | "aktiv" | "getestet" | "pausiert" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRevenueOpportunitiesQueryKey() });
          toast({ title: `✅ ${titel}`, description: `Status auf "${newStatus}" gesetzt` });
        },
      }
    );
  };

  const filtered = chancen?.filter(c => filter === "alle" || c.kanal === filter) ?? [];
  const totalGeschaetzt = filtered.reduce((s, c) => s + c.geschaetzterMonatsumsatz, 0);
  const aktiveAnzahl = filtered.filter(c => c.status === "aktiv").length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-52 w-full bg-card" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">Revenue-Chancen</h2>
        <p className="text-muted-foreground text-xs md:text-sm">
          Autonome Umsatzquellen — entdeckt, analysiert und bewertet vom Revenue Analyst Agent
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-primary">
              {Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(totalGeschaetzt)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Gesch. Monatsumsatz</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold text-green-400">{aktiveAnzahl}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Aktiv</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="text-xl md:text-2xl font-bold">{filtered.length}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Gesamt</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["alle", "affiliate", "eigenes_produkt", "abo", "coaching", "freelance"] as FilterKanal[]).map(k => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? "default" : "outline"}
            className="h-7 text-[10px] px-2"
            onClick={() => setFilter(k)}
          >
            {k === "alle" ? "Alle" : KANAL_LABELS[k]}
          </Button>
        ))}
      </div>

      {/* Chancen-Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered
          .sort((a, b) => b.geschaetzterMonatsumsatz - a.geschaetzterMonatsumsatz)
          .map(chance => {
            const Icon = KANAL_ICONS[chance.kanal] ?? TrendingUp;
            return (
              <Card key={chance.id} className="bg-card border-border flex flex-col">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm leading-tight truncate">{chance.titel}</CardTitle>
                        <p className={`text-[10px] font-medium mt-0.5 ${MARKE_COLORS[chance.marke ?? ""] ?? "text-muted-foreground"}`}>
                          {chance.marke ?? "—"}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${STATUS_COLORS[chance.status] ?? ""}`}>
                      {chance.status.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-4 pt-0 gap-3">
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {chance.beschreibung}
                  </p>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Geschätzt/Monat</span>
                    <span className="font-bold text-primary font-mono">
                      {Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(chance.geschaetzterMonatsumsatz)}
                    </span>
                  </div>

                  {chance.tatsaechlicherUmsatz > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tatsächlich</span>
                      <span className="font-bold text-green-400 font-mono">
                        {Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(chance.tatsaechlicherUmsatz)}
                      </span>
                    </div>
                  )}

                  {/* Links */}
                  <div className="flex gap-2 flex-wrap">
                    {chance.stripePaymentLink && (
                      <a href={chance.stripePaymentLink} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="default" className="h-7 text-[10px] px-2 gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          Kaufen
                        </Button>
                      </a>
                    )}
                    {chance.affiliateUrl && (
                      <a href={chance.affiliateUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1">
                          <ExternalLink className="h-3 w-3" />
                          Affiliate-Link
                        </Button>
                      </a>
                    )}
                  </div>

                  {/* Status-Aktionen */}
                  <div className="flex gap-1.5 mt-auto">
                    {chance.status !== "aktiv" && (
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary"
                        onClick={() => handleStatusChange(chance.id, "aktiv", chance.titel)}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        Aktivieren
                      </Button>
                    )}
                    {chance.status === "aktiv" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[10px]"
                        onClick={() => handleStatusChange(chance.id, "getestet", chance.titel)}
                      >
                        Als getestet markieren
                      </Button>
                    )}
                    {chance.status !== "pausiert" && chance.status !== "entdeckt" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] px-2 text-muted-foreground"
                        onClick={() => handleStatusChange(chance.id, "pausiert", chance.titel)}
                      >
                        Pause
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Filter className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p>Keine Chancen in dieser Kategorie</p>
          <p className="text-xs mt-1">Der Revenue Analyst scannt automatisch alle 2 Stunden</p>
        </div>
      )}
    </div>
  );
}
