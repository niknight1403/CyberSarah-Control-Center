import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, ExternalLink, Euro, Tag, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

interface StripeProdukt {
  id: string; name: string; beschreibung?: string; preis?: string;
  waehrung: string; aboIntervall?: string; aktiv: boolean;
  bild?: string; erstelltAm: string;
  lokaleDaten?: { id: number; kategorie?: string; stripePaymentLink?: string; verkauft?: string };
}

interface ProdukteResponse {
  produkte: StripeProdukt[]; anzahl: number; stripeVerfuegbar: boolean;
}

function useProdukte() {
  return useQuery<ProdukteResponse>({
    queryKey: ["stripe-produkte"],
    queryFn: async () => {
      const res = await apiFetch("/api/stripe/produkte");
      if (!(res instanceof Response)) return res as ProdukteResponse;
      if (!res.ok) throw new Error("Produkte nicht verfügbar");
      return res.json() as Promise<ProdukteResponse>;
    },
    refetchInterval: 60_000,
  });
}

function formatEur(val?: string | number | null): string {
  const num = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

export default function StripeProdukte() {
  const { data, isLoading, error, refetch } = useProdukte();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreis, setNewPreis] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newKategorie, setNewKategorie] = useState("allgemein");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName || !newPreis) throw new Error("Name und Preis erforderlich");
      const res = await apiFetch("/api/stripe/produkte", {
        method: "POST",
        body: JSON.stringify({ name: newName, preis: parseFloat(newPreis), beschreibung: newDesc, kategorie: newKategorie }),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe-produkte"] });
      setShowCreate(false);
      setNewName(""); setNewPreis(""); setNewDesc("");
      toast({ title: "✅ Produkt erstellt", description: "Stripe-Produkt + Payment-Link wurden angelegt" });
    },
    onError: (err: Error) => {
      toast({ title: "❌ Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/stripe/produkte/${id}`, { method: "DELETE" });
      if (!(res instanceof Response)) return res;
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe-produkte"] });
      toast({ title: "✅ Produkt deaktiviert" });
    },
    onError: (err: Error) => {
      toast({ title: "❌ Fehler", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📦 Stripe Produkte</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.anzahl ?? 0} Produkte · Verwaltung aller Stripe-Produkte</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
          </Button>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Neues Produkt</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Neues Stripe-Produkt erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Produktname *</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="z.B. KI-Prompt Paket Pro" />
                </div>
                <div>
                  <Label>Preis (EUR) *</Label>
                  <Input type="number" step="0.01" min="0" value={newPreis} onChange={e => setNewPreis(e.target.value)} placeholder="49.00" />
                </div>
                <div>
                  <Label>Kategorie</Label>
                  <Select value={newKategorie} onValueChange={setNewKategorie}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allgemein">Allgemein</SelectItem>
                      <SelectItem value="prompt_paket">Prompt-Paket</SelectItem>
                      <SelectItem value="coaching">Coaching</SelectItem>
                      <SelectItem value="kurs">Kurs</SelectItem>
                      <SelectItem value="template">Template</SelectItem>
                      <SelectItem value="abo">Abonnement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Beschreibung</Label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Kurze Beschreibung..." />
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!newName || !newPreis}>
                  {createMutation.isPending ? "Erstelle..." : "🚀 Produkt + Payment-Link erstellen"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : error || !data ? (
        <Card className="p-8 text-center">
          <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Keine Verbindung zu Stripe</h2>
          <p className="text-gray-500 mb-4">STRIPE_SECRET_KEY prüfen oder Server neu starten.</p>
          <Button onClick={() => refetch()}>Erneut versuchen</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.produkte.map((p) => (
            <Card key={p.id} className={`hover:shadow-md transition-shadow ${!p.aktiv ? "opacity-60" : ""}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    {p.beschreibung && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.beschreibung}</p>}
                  </div>
                  <Badge variant={p.aktiv ? "default" : "secondary"} className="ml-2 shrink-0">
                    {p.aktiv ? "Aktiv" : "Inaktiv"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Euro className="w-4 h-4 text-green-600" />
                  <span className="text-xl font-bold">{formatEur(p.preis)}</span>
                  <span className="text-xs text-gray-400">{p.waehrung}</span>
                  {p.aboIntervall && (
                    <Badge variant="outline" className="text-xs">
                      /{p.aboIntervall === "month" ? "Monat" : "Jahr"}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  {p.lokaleDaten?.kategorie && (
                    <Badge variant="secondary" className="text-xs">
                      <Tag className="w-3 h-3 mr-1" />{p.lokaleDaten.kategorie}
                    </Badge>
                  )}
                  {p.lokaleDaten?.verkauft && parseFloat(p.lokaleDaten.verkauft) > 0 && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      €{parseFloat(p.lokaleDaten.verkauft).toFixed(2)} verkauft
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2 mt-2">
                  {p.lokaleDaten?.stripePaymentLink && (
                    <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                      <a href={p.lokaleDaten.stripePaymentLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3 h-3 mr-1" /> Kauf-Link
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" 
                    onClick={() => { if (confirm("Produkt deaktivieren?")) deleteMutation.mutate(p.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
