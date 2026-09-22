import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Users, Calendar, AlertTriangle, CheckCircle, XCircle, ExternalLink } from "lucide-react";

interface Abo {
  id: string; status: string; betrag: number; waehrung: string; intervall?: string;
  produkt?: string; erstellt: string;
  aktuellerZyklusStart?: string; aktuellerZyklusEnde?: string;
  probeBis?: string; gekuendigt: boolean;
  kunde?: { id: string; email?: string; name?: string };
}

interface AbosResponse { abos: Abo[]; anzahl: number }

function useAbos() {
  return useQuery<AbosResponse>({
    queryKey: ["stripe-abos"],
    queryFn: async () => {
      const res = await apiFetch("/api/stripe/abos");
      if (!(res instanceof Response)) return res as AbosResponse;
      if (!res.ok) throw new Error("Abos nicht verfügbar");
      return res.json() as Promise<AbosResponse>;
    },
    refetchInterval: 30_000,
  });
}

function formatEur(val: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
}

export default function StripeAbos() {
  const { data, isLoading, refetch } = useAbos();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const cancelMut = useMutation({
    mutationFn: async ({ id, sofort }: { id: string; sofort: boolean }) => {
      const res = await apiFetch(`/api/stripe/abos/${id}/kuendigen`, {
        method: "POST",
        body: JSON.stringify({ sofort }),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stripe-abos"] }); toast({ title: "✅ Abo gekündigt" }); },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  const reactMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/stripe/abos/${id}/reaktivieren`, { method: "POST" });
      if (!(res instanceof Response)) return res;
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stripe-abos"] }); toast({ title: "✅ Abo reaktiviert" }); },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  const abos = data?.abos ?? [];
  const gefiltert = filter === "all" ? abos : abos.filter(a => a.status === filter);
  const aktive = abos.filter(a => a.status === "active").length;
  const gekuendigt = abos.filter(a => a.gekuendigt).length;
  const monatsUmsatz = abos.filter(a => a.status === "active").reduce((s, a) => s + a.betrag, 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔄 Abonnements</h1>
          <p className="text-sm text-gray-500 mt-1">{abos.length} Abos · {formatEur(monatsUmsatz)}/Monat wiederkehrend</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
        </Button>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Aktive Abos</p>
          <p className="text-xl font-bold text-green-600">{aktive}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Monatlicher Umsatz</p>
          <p className="text-xl font-bold text-blue-600">{formatEur(monatsUmsatz)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Gekündigt</p>
          <p className="text-xl font-bold text-yellow-600">{gekuendigt}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Gesamt</p>
          <p className="text-xl font-bold">{abos.length}</p>
        </CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "active", "past_due", "canceled", "incomplete", "trialing"].map(s => (
          <Badge key={s} variant={filter === s ? "default" : "outline"} className="cursor-pointer px-3 py-1.5"
            onClick={() => setFilter(s)}>
            {s === "all" ? "Alle" : s === "active" ? "Aktiv" : s === "past_due" ? "Überfällig" : s === "canceled" ? "Gekündigt" : s}
          </Badge>
        ))}
      </div>

      {/* Abo-Liste */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : gefiltert.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Keine Abonnements gefunden</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gefiltert.map((abo) => (
            <Card key={abo.id} className={`hover:shadow-md transition-shadow ${abo.status !== "active" ? "opacity-70" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{abo.produkt ?? "Unbekannt"}</h3>
                    {abo.kunde?.email && <p className="text-xs text-gray-500">{abo.kunde.email}</p>}
                  </div>
                  <Badge variant={abo.status === "active" ? "default" : "secondary"}>
                    {abo.status === "active" ? "✅ Aktiv" : abo.status === "past_due" ? "⚠️ Überfällig" : abo.status === "canceled" ? "❌ Gekündigt" : abo.status}
                  </Badge>
                </div>

                <div className="text-2xl font-bold mb-2">
                  {formatEur(abo.betrag)}
                  <span className="text-sm font-normal text-gray-500">/{abo.intervall === "month" ? "Monat" : "Jahr"}</span>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                  {abo.aktuellerZyklusStart && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Start: {new Date(abo.aktuellerZyklusStart).toLocaleDateString("de-DE")}
                    </span>
                  )}
                  {abo.gekuendigt && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="w-3 h-3" />
                      Läuft aus
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  {abo.status === "active" && !abo.gekuendigt && (
                    <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => { if (confirm(`Abo ${abo.id} kündigen?`)) cancelMut.mutate({ id: abo.id, sofort: false }); }}>
                      <XCircle className="w-3 h-3 mr-1" /> Kündigen
                    </Button>
                  )}
                  {abo.gekuendigt && (
                    <Button variant="outline" size="sm" className="text-green-500 border-green-200 hover:bg-green-50"
                      onClick={() => reactMut.mutate(abo.id)}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Reaktivieren
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
