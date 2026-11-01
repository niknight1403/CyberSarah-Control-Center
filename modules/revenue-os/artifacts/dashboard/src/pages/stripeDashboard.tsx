import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-fetch";
import { DollarSign, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight, Wallet, Banknote, RefreshCw, ExternalLink, ShoppingCart, Users, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StripeDashboard {
  balance: { verfuegbar: number; ausstehend: number; waehrung: string };
  umsatz: { heute: string; dieseWoche: string; diesenMonat: string; gesamt: string };
  transaktionen: { letzte30Tage: number; gesamt: number; letzteZahlungen: Zahlung[] };
  auszahlungen: Auszahlung[];
  stripeLive: boolean;
  stripeDashboardUrl: string;
}

interface Zahlung {
  id: string; betrag: string; waehrung: string; status: string;
  beschreibung?: string; email?: string; erstellt: string;
}

interface Auszahlung {
  id: string; betrag: string; waehrung: string; status: string;
  ankunftsDatum?: string; beschreibung?: string; erstellt: string;
}

function useStripeDashboard() {
  return useQuery<StripeDashboard>({
    queryKey: ["stripe-dashboard"],
    queryFn: async () => {
      const res = await apiFetch("/api/stripe/dashboard");
      if (!(res instanceof Response)) return res as StripeDashboard;
      if (!res.ok) throw new Error("Dashboard nicht verfügbar");
      return res.json() as Promise<StripeDashboard>;
    },
    refetchInterval: 30_000,
  });
}

function formatEur(centBetrag: number | string | undefined | null): string {
  const num = typeof centBetrag === "string" ? parseFloat(centBetrag) : (centBetrag ?? 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

function formatDatum(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    succeeded: "bg-green-100 text-green-800",
    succeeded_not_charged: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    requires_payment_method: "bg-red-100 text-red-800",
    paid: "bg-green-100 text-green-800",
    unpaid: "bg-yellow-100 text-yellow-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-800";
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    succeeded: "✅ Erfolgreich", paid: "✅ Bezahlt",
    processing: "⏳ In Bearbeitung", requires_payment_method: "❌ Fehlgeschlagen",
    unpaid: "⏳ Ausstehend", cancelled: "❌ Storniert",
  };
  return map[status] ?? status;
}

export default function StripeDashboard() {
  const { data, isLoading, error, refetch } = useStripeDashboard();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    refetch().then(() => {
      setRefreshing(false);
      toast({ title: "✅ Dashboard aktualisiert", description: "Neueste Stripe-Daten geladen" });
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Stripe nicht verbunden</h2>
          <p className="text-gray-500 mb-4">Stelle sicher, dass STRIPE_SECRET_KEY gesetzt ist.</p>
          <Button onClick={handleRefresh}>Erneut versuchen</Button>
        </Card>
      </div>
    );
  }

  const umsatzHeute = parseFloat(data.umsatz.heute);
  const umsatzMonat = parseFloat(data.umsatz.diesenMonat);
  const balanceVerfuegbar = data.balance.verfuegbar;
  const balanceAusstehend = data.balance.ausstehend;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">💰 Stripe Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.stripeLive ? "🔴 LIVE-MODUS" : "🧪 TEST-MODUS"} — Echtzeit-Finanzdaten
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={data.stripeDashboardUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Stripe.com
            </a>
          </Button>
        </div>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Umsatz heute</p>
              <TrendingUp className={`w-5 h-5 ${umsatzHeute > 0 ? "text-green-500" : "text-gray-400"}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{formatEur(umsatzHeute)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Umsatz 30 Tage</p>
              <ShoppingCart className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{formatEur(umsatzMonat)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Verfügbar</p>
              <Wallet className={`w-5 h-5 ${balanceVerfuegbar > 0 ? "text-green-500" : "text-gray-400"}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{formatEur(balanceVerfuegbar)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Ausstehend</p>
              <Banknote className="w-5 h-5 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{formatEur(balanceAusstehend)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Letzte Zahlungen + Auszahlungen */}
      <Tabs defaultValue="zahlungen">
        <TabsList>
          <TabsTrigger value="zahlungen">💳 Letzte Zahlungen ({data.transaktionen.letzteZahlungen.length})</TabsTrigger>
          <TabsTrigger value="auszahlungen">🏦 Auszahlungen ({data.auszahlungen.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="zahlungen" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Letzte Transaktionen</CardTitle>
              <CardDescription>
                {data.transaktionen.letzte30Tage} Zahlungen in den letzten 30 Tagen · {data.transaktionen.gesamt} gesamt
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.transaktionen.letzteZahlungen.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Noch keine Zahlungen</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium">Betrag</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Beschreibung</th>
                        <th className="pb-3 font-medium">Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transaktionen.letzteZahlungen.map((z) => (
                        <tr key={z.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 font-medium">{formatEur(z.betrag)}</td>
                          <td className="py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge(z.status)}`}>
                              {statusText(z.status)}
                            </span>
                          </td>
                          <td className="py-3 text-gray-600 max-w-xs truncate">{z.beschreibung ?? z.email ?? "-"}</td>
                          <td className="py-3 text-gray-500 text-xs">{formatDatum(z.erstellt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auszahlungen" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Auszahlungshistorie</CardTitle>
              <CardDescription>Guthabenauszahlungen auf dein Bankkonto</CardDescription>
            </CardHeader>
            <CardContent>
              {data.auszahlungen.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Banknote className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Noch keine Auszahlungen</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium">Betrag</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium">Ankunft</th>
                        <th className="pb-3 font-medium">Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.auszahlungen.map((a) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 font-medium">{formatEur(a.betrag)}</td>
                          <td className="py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusBadge(a.status)}`}>
                              {a.status === "paid" ? "✅ Überwiesen" : a.status === "pending" ? "⏳ Ausstehend" : a.status}
                            </span>
                          </td>
                          <td className="py-3 text-gray-600 text-xs">{formatDatum(a.ankunftsDatum)}</td>
                          <td className="py-3 text-gray-500 text-xs">{formatDatum(a.erstellt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
