import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Search, Download, RefreshCw, ExternalLink } from "lucide-react";

interface Transaktion {
  id: number; transaktionsId?: string; quelle: string; typ: string;
  betrag: string; waehrung: string; beschreibung?: string; createdAt?: string;
}

interface TransaktionenResponse {
  transaktionen: Transaktion[]; anzahl: number;
  statistik: { gesamtUmsatz: string; erfolgreicherUmsatz: string; anzahlTransaktionen: number; anzahlErfolgreich: number };
  aufteilung: Record<string, number>;
}

function useTransaktionen() {
  return useQuery<TransaktionenResponse>({
    queryKey: ["stripe-transaktionen"],
    queryFn: async () => {
      const res = await apiFetch("/api/stripe/transaktionen?limit=100");
      if (!(res instanceof Response)) return res as TransaktionenResponse;
      if (!res.ok) throw new Error("Transaktionen nicht verfügbar");
      return res.json() as Promise<TransaktionenResponse>;
    },
    refetchInterval: 60_000,
  });
}

function formatEur(val?: string | number | null): string {
  const num = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

export default function StripeZahlungen() {
  const { data, isLoading, refetch } = useTransaktionen();
  const { toast } = useToast();
  const [suche, setSuche] = useState("");

  const gefiltert = data?.transaktionen.filter(t =>
    !suche || t.beschreibung?.toLowerCase().includes(suche.toLowerCase()) ||
    t.transaktionsId?.toLowerCase().includes(suche.toLowerCase()) ||
    t.quelle?.toLowerCase().includes(suche.toLowerCase())
  ) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">💳 Transaktionen</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data?.statistik.anzahlTransaktionen ?? 0} Transaktionen · {formatEur(data?.statistik.gesamtUmsatz)} Gesamtumsatz
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); toast({ title: "✅ Aktualisiert" }); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
        </Button>
      </div>

      {/* Statistik-Karten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Gesamtumsatz</p>
          <p className="text-xl font-bold text-green-600">{formatEur(data?.statistik.gesamtUmsatz)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Erfolgreich</p>
          <p className="text-xl font-bold text-blue-600">{formatEur(data?.statistik.erfolgreicherUmsatz)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Anzahl</p>
          <p className="text-xl font-bold">{data?.statistik.anzahlTransaktionen ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-gray-500">Erfolgreiche</p>
          <p className="text-xl font-bold">{data?.statistik.anzahlErfolgreich ?? 0}</p>
        </CardContent></Card>
      </div>

      {/* Quelle-Aufteilung */}
      {data?.aufteilung && Object.keys(data.aufteilung).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">📊 Umsatz nach Quelle</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(data.aufteilung).map(([quelle, betrag]) => (
              <Badge key={quelle} variant="secondary" className="text-sm px-3 py-1">
                {quelle}: {formatEur(betrag)}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input className="pl-9" placeholder="Transaktion suchen..." value={suche} onChange={e => setSuche(e.target.value)} />
      </div>

      {/* Transaktionsliste */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {gefiltert.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Keine Transaktionen gefunden</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-gray-50">
                      <th className="p-3 font-medium">Betrag</th>
                      <th className="p-3 font-medium">Typ</th>
                      <th className="p-3 font-medium">Quelle</th>
                      <th className="p-3 font-medium">Beschreibung</th>
                      <th className="p-3 font-medium">Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gefiltert.map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 font-medium">{formatEur(t.betrag)} <span className="text-xs text-gray-400">{t.waehrung}</span></td>
                        <td className="p-3">
                          <Badge variant={t.typ.includes("erfolg") || t.typ.includes("paid") ? "default" : "secondary"} className="text-xs">
                            {t.typ}
                          </Badge>
                        </td>
                        <td className="p-3 text-gray-600">{t.quelle}</td>
                        <td className="p-3 text-gray-600 max-w-xs truncate">{t.beschreibung ?? "-"}</td>
                        <td className="p-3 text-gray-500 text-xs">
                          {t.createdAt ? new Date(t.createdAt).toLocaleDateString("de-DE") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
