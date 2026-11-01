import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Users, TrendingUp, Send, RefreshCw,
  ExternalLink, CheckCircle2, Clock, Eye,
} from "lucide-react";

const BASE = "/api";
function authH() {
  const t = import.meta.env["VITE_API_AUTH_TOKEN"] as string | undefined;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface NewsletterPost {
  id: string;
  betreff: string;
  status: string;
  webUrl: string;
  erstelltAm: string;
  empfaenger: number;
  oeffnungsrate?: number;
}

interface NewsletterStatus {
  stats: { gesamt: number; aktiv: number; letzteWoche: number; boostsVerdienst: number } | null;
  letzte: NewsletterPost[];
}

const MARKEN = ["GeldPilot AI", "CyberSarah", "UnternehmerGPT"] as const;

export default function Newsletter() {
  const qc = useQueryClient();
  const [marke, setMarke] = useState<typeof MARKEN[number]>("GeldPilot AI");
  const [neueEmail, setNeueEmail] = useState("");

  const { data, isLoading } = useQuery<NewsletterStatus>({
    queryKey: ["newsletter-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/newsletter/status`, { headers: authH() });
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { mutate: publizieren, isPending: publiziert } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/newsletter/veroeffentlichen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH() },
        body: JSON.stringify({ marke }),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["newsletter-status"] }); },
  });

  const { mutate: abonnentHinzu, isPending: hinzufuegen } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/newsletter/abonnent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH() },
        body: JSON.stringify({ email: neueEmail, marke }),
      });
      return r.json();
    },
    onSuccess: () => { setNeueEmail(""); void qc.invalidateQueries({ queryKey: ["newsletter-status"] }); },
  });

  const { mutate: syncLeads, isPending: syncing } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/newsletter/leads-synchronisieren`, {
        method: "POST", headers: authH(),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["newsletter-status"] }); },
  });

  const konfiguriert = data?.stats !== null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Newsletter-Agent
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Beehiiv · Automatisch jeden Freitag 08:00 Uhr · 138% Wachstum YoY
          </p>
        </div>
        {!konfiguriert && (
          <a href="/einstellungen" className="text-xs text-primary underline flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Beehiiv-Keys einrichten
          </a>
        )}
      </div>

      {/* Nicht konfiguriert */}
      {!isLoading && !konfiguriert && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Beehiiv noch nicht eingerichtet</p>
            <p className="text-xs text-muted-foreground mb-3">
              Erstelle ein kostenloses Beehiiv-Konto (bis 2.500 Abonnenten gratis) und trage den API-Key + Publication-ID unter Einstellungen ein.
            </p>
            <div className="flex gap-2 flex-wrap">
              <a href="https://app.beehiiv.com" target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="h-7 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Beehiiv.com (kostenlos)
                </Button>
              </a>
              <a href="/einstellungen">
                <Button variant="outline" size="sm" className="h-7 text-xs">API-Key eintragen</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : data?.stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Abonnenten</span>
              </div>
              <p className="text-2xl font-bold">{data.stats.gesamt.toLocaleString("de-DE")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Boosts-Potenzial</span>
              </div>
              <p className="text-2xl font-bold text-green-400">
                {data.stats.boostsVerdienst.toLocaleString("de-DE")} €
              </p>
              <p className="text-[10px] text-muted-foreground">≈ 6 €/Abo</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Newsletter jetzt senden */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Newsletter veröffentlichen
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            KI generiert den Inhalt automatisch (aktueller Markttrend + Affiliate-Links + Tipp der Woche).
            Automatisch jeden <strong>Freitag 08:00 Uhr</strong>.
          </p>
          {/* Marke auswählen */}
          <div className="flex gap-1.5 flex-wrap">
            {MARKEN.map(m => (
              <button key={m} onClick={() => setMarke(m)}
                className={`text-[10px] px-3 py-1.5 rounded-full border transition-colors ${
                  marke === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" onClick={() => publizieren()} disabled={publiziert || !konfiguriert}>
              {publiziert ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {publiziert ? "Wird generiert..." : "Jetzt senden"}
            </Button>
            <Button variant="outline" onClick={() => syncLeads()} disabled={syncing} className="gap-1 text-xs">
              {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Leads sync
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Abonnent hinzufügen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Abonnent manuell hinzufügen</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@beispiel.de"
              value={neueEmail}
              onChange={e => setNeueEmail(e.target.value)}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              onClick={() => abonnentHinzu()}
              disabled={!neueEmail || hinzufuegen || !konfiguriert}
            >
              Hinzufügen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Letzte Newsletter */}
      {(data?.letzte ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Letzte Newsletter</h2>
          <div className="space-y-2">
            {(data?.letzte ?? []).map(post => (
              <Card key={post.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{post.betreff}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {post.erstelltAm ? new Date(post.erstelltAm).toLocaleDateString("de-DE") : "—"}
                        {post.empfaenger > 0 && ` · ${post.empfaenger} Empfänger`}
                        {post.oeffnungsrate && ` · ${(post.oeffnungsrate * 100).toFixed(0)}% Öffnungsrate`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[9px] ${
                        post.status === "confirmed" ? "text-green-400 border-green-500/30" : "text-muted-foreground"
                      }`}>
                        {post.status === "confirmed" ? "✓ Gesendet" : post.status}
                      </Badge>
                      {post.webUrl && (
                        <a href={post.webUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Setup-Anleitung */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Einrichtung (einmalig, 10 Min)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {[
            { nr: 1, text: "beehiiv.com → kostenloses Konto erstellen", url: "https://app.beehiiv.com" },
            { nr: 2, text: "Publication erstellen ('GeldPilot AI Newsletter')" },
            { nr: 3, text: "Settings → Integrations → API → API-Key kopieren", url: "https://app.beehiiv.com/settings/integrations/api" },
            { nr: 4, text: "Publication-ID aus der URL kopieren (pub_xxxxx)" },
            { nr: 5, text: "Beide Keys unter Einstellungen → API-Keys eintragen", url: "/einstellungen" },
            { nr: 6, text: "Beehiiv Monetization → Boosts aktivieren (6€/Abo im KI-Segment)", url: "https://app.beehiiv.com/monetize/boosts" },
          ].map(step => (
            <div key={step.nr} className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.nr}
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {step.text}
                {step.url && (
                  <a href={step.url} target="_blank" rel="noopener noreferrer"
                    className="ml-1 text-primary inline-flex items-center gap-0.5">
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
