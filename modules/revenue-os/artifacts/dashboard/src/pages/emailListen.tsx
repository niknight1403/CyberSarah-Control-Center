import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Sparkles, Send, UserMinus, MousePointerClick, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { apiFetch } from "@/lib/api-fetch";

interface Lead {
  id: number;
  email: string;
  marke: string;
  quelle: string | null;
  sequenzId: number | null;
  aktuellerSchritt: number;
  status: string;
  letzteEmailAm: string | null;
  createdAt: string;
}

interface EmailSequenz {
  id: number;
  marke: string;
  leadMagnet: string;
  name: string;
  emails: Array<{ betreff: string; inhalt: string; tagNachAnmeldung: number }>;
  produktId: number | null;
  aktiv: boolean;
  klicks: number;
  createdAt: string;
}

interface ListenUebersicht {
  leads: Lead[];
  sequenzen: EmailSequenz[];
  stats: {
    gesamtLeads: number;
    aktiveLeads: number;
    abgemeldeteLeads: number;
    aktiveSequenzen: number;
    gesamtKlicks: number;
  };
}

export default function EmailListen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ListenUebersicht>({
    queryKey: ["leads-uebersicht"],
    queryFn: async () => {
      const res = await apiFetch("/api/leads/uebersicht");
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json() as Promise<ListenUebersicht>;
    },
    refetchInterval: 20_000,
  });

  const sequenzenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/leads/sequenzen-erstellen", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ erstellt: number; details: string[] }>;
    },
    onSuccess: (ergebnis) => {
      toast({ title: `${ergebnis.erstellt} neue Sequenzen erstellt`, description: ergebnis.details.join(" · ") });
      void queryClient.invalidateQueries({ queryKey: ["leads-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  const versendenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/leads/versenden", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ versendet: number; details: string[] }>;
    },
    onSuccess: (ergebnis) => {
      toast({ title: `${ergebnis.versendet} fällige E-Mails versendet`, description: ergebnis.details.slice(0, 3).join(" · ") || "Keine fälligen E-Mails" });
      void queryClient.invalidateQueries({ queryKey: ["leads-uebersicht"] });
    },
    onError: (err) => toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannt", variant: "destructive" }),
  });

  const abmeldenMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/leads/${id}/abmelden`, { method: "POST" });
      if (!res.ok) throw new Error("Fehler");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["leads-uebersicht"] }),
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const { leads, sequenzen, stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            E-Mail-Listen-Monetarisierungs-Agent
          </h2>
          <p className="text-muted-foreground text-sm">
            Echte Leads, KI-Nurture-Sequenzen und getrackte Klicks auf Digitalprodukte
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => sequenzenMutation.mutate()}
            disabled={sequenzenMutation.isPending}
            variant="outline"
            className="gap-2"
            data-testid="button-sequenzen-erstellen"
          >
            <Sparkles className={`h-4 w-4 ${sequenzenMutation.isPending ? "animate-pulse" : ""}`} />
            Sequenzen erstellen
          </Button>
          <Button
            onClick={() => versendenMutation.mutate()}
            disabled={versendenMutation.isPending}
            className="bg-primary text-black hover:bg-primary/90 font-bold gap-2"
            data-testid="button-emails-versenden"
          >
            <Send className={`h-4 w-4 ${versendenMutation.isPending ? "animate-pulse" : ""}`} />
            Fällige E-Mails versenden
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Leads gesamt</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamtLeads}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Aktiv</div>
            <div className="text-2xl font-bold mt-1 text-primary">{stats.aktiveLeads}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Abgemeldet</div>
            <div className="text-2xl font-bold mt-1 text-muted-foreground">{stats.abgemeldeteLeads}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Sequenzen</div>
            <div className="text-2xl font-bold mt-1">{stats.aktiveSequenzen}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Klicks</div>
            <div className="text-2xl font-bold mt-1">{stats.gesamtKlicks}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
          <MousePointerClick className="h-3 w-3" /> Aktive Sequenzen
        </div>
        {sequenzen.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">
            Noch keine Sequenzen — "Sequenzen erstellen" klicken
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sequenzen.map((s) => (
              <Card key={s.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm line-clamp-2">{s.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{s.marke}</Badge>
                    <Badge className={`text-xs ${s.aktiv ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {s.aktiv ? "aktiv" : "inaktiv"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{s.emails.length} E-Mails in der Sequenz</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MousePointerClick className="h-3 w-3" /> {s.klicks} Klicks
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
          <Users className="h-3 w-3" /> Leads ({leads.length})
        </div>
        {leads.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">
            Noch keine Leads erfasst — Opt-in-Route: POST /api/leads/anmelden
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between gap-3 p-3 bg-card border border-border rounded-lg text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{lead.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {lead.marke} · Schritt {lead.aktuellerSchritt} · {lead.quelle}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={`text-xs ${lead.status === "aktiv" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {lead.status}
                  </Badge>
                  {lead.status === "aktiv" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => abmeldenMutation.mutate(lead.id)}>
                      <UserMinus className="h-3 w-3" /> Abmelden
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
