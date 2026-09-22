import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import {
  Zap, CheckCircle2, XCircle, Clock, RefreshCw,
  TrendingUp, Play, Globe, Send
} from "lucide-react";

const BASE = "/api";

interface Plattform {
  id: number; name: string; anzeigeName: string; symbol: string;
  webhookUrl: string | null; aktiv: boolean; postingsProTag: number;
  besteZeiten: string; postingsHeute: number; postingsGesamt: number;
  letzterPost: string | null;
}
interface Posting {
  id: number; contentId: number | null; plattform: string; status: string;
  inhaltKurz: string | null; webhookResponse: string | null;
  fehler: string | null; gepostetAm: string | null; createdAt: string;
}
interface Stats {
  postingsHeute: number; postingsWoche: number;
  aktivePlattformen: number; contentBereit: number;
}

const PLATTFORM_FARBEN: Record<string, string> = {
  tiktok: "text-pink-400", instagram: "text-purple-400",
  youtube: "text-red-400", linkedin: "text-blue-400",
  pinterest: "text-rose-400", twitter: "text-sky-400",
};

export default function Influencer() {
  const qc = useQueryClient();
  const [webhooks, setWebhooks] = useState<Record<string, string>>({});
  const [aktionMsg, setAktionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: plattData, isLoading: plattLoading } = useQuery({
    queryKey: ["influencer-plattformen"],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/influencer/plattformen`);
      return r.json() as Promise<{ plattformen: Plattform[] }>;
    },
    refetchInterval: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["influencer-stats"],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/influencer/stats`);
      return r.json() as Promise<Stats>;
    },
    refetchInterval: 10_000,
  });

  const { data: postingData, isLoading: postingLoading } = useQuery({
    queryKey: ["influencer-postings"],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/influencer/postings?limit=30`);
      return r.json() as Promise<{ postings: Posting[] }>;
    },
    refetchInterval: 10_000,
  });

  const savePlattformMutation = useMutation({
    mutationFn: async ({ name, webhookUrl, aktiv }: { name: string; webhookUrl?: string; aktiv?: boolean }) => {
      const r = await apiFetch(`${BASE}/influencer/plattformen/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, aktiv }),
      });
      return r.json() as Promise<{ gespeichert: boolean }>;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["influencer-plattformen"] }),
  });

  const autoPostMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`${BASE}/influencer/auto-post`, { method: "POST" });
      return r.json() as Promise<{ gepostet: number; fehler: number; plattformen: string[]; contentId: number | null }>;
    },
    onSuccess: (d) => {
      setAktionMsg({ ok: d.gepostet > 0, msg: `✅ ${d.gepostet} Posts gesendet auf: ${d.plattformen.join(", ") || "—"}` });
      void qc.invalidateQueries({ queryKey: ["influencer-postings"] });
      void qc.invalidateQueries({ queryKey: ["influencer-stats"] });
      setTimeout(() => setAktionMsg(null), 8000);
    },
    onError: () => setAktionMsg({ ok: false, msg: "❌ Auto-Post fehlgeschlagen" }),
  });

  const plattformen = plattData?.plattformen ?? [];
  const postings = postingData?.postings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            KI-Influencer Autopilot
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Autonomes Posten auf TikTok · Instagram · YouTube · LinkedIn · Pinterest · X
          </p>
        </div>
        <Button
          className="gap-2 bg-primary hover:bg-primary/90"
          onClick={() => autoPostMutation.mutate()}
          disabled={autoPostMutation.isPending}
        >
          {autoPostMutation.isPending
            ? <><RefreshCw className="h-4 w-4 animate-spin" />Postet...</>
            : <><Send className="h-4 w-4" />Jetzt auto-posten</>}
        </Button>
      </div>

      {aktionMsg && (
        <div className={`text-sm font-mono px-4 py-2 rounded-lg border ${aktionMsg.ok ? "border-primary/30 bg-primary/5 text-primary" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
          {aktionMsg.msg}
        </div>
      )}

      {/* ─── Stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Posts heute", wert: stats?.postingsHeute ?? 0, icon: <Zap className="h-4 w-4" /> },
          { label: "Posts Woche", wert: stats?.postingsWoche ?? 0, icon: <TrendingUp className="h-4 w-4" /> },
          { label: "Aktive Plattformen", wert: stats?.aktivePlattformen ?? 0, icon: <Globe className="h-4 w-4" /> },
          { label: "Content bereit", wert: stats?.contentBereit ?? 0, icon: <Play className="h-4 w-4" /> },
        ].map(s => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">{s.icon}<span className="text-xs">{s.label}</span></div>
              <p className="text-2xl font-bold font-mono text-primary">{s.wert}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Plattformen ────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Plattform-Verbindungen
            <Badge variant="outline" className="text-xs ml-auto">
              {plattformen.filter(p => p.aktiv).length}/{plattformen.length} aktiv
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Webhook-URL von Make.com / Zapier / n8n eintragen → Plattform aktivieren → KI postet automatisch
          </p>
        </CardHeader>
        <CardContent>
          {plattLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-3">
              {plattformen.map(p => (
                <div key={p.name} className={`rounded-lg border p-3 transition-all ${p.aktiv ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{p.symbol}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${PLATTFORM_FARBEN[p.name] ?? "text-foreground"}`}>
                          {p.anzeigeName}
                        </span>
                        {p.aktiv
                          ? <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">AKTIV</Badge>
                          : <Badge variant="outline" className="text-[10px] text-muted-foreground">INAKTIV</Badge>}
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                          {p.postingsHeute} heute · {p.postingsGesamt} gesamt
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {p.postingsProTag}x täglich · beste Zeiten: {p.besteZeiten}
                        {p.letzterPost && ` · letzter Post: ${new Date(p.letzterPost).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono text-xs h-8 flex-1"
                      placeholder={`https://hook.eu1.make.com/... (${p.anzeigeName} Webhook)`}
                      value={webhooks[p.name] ?? p.webhookUrl ?? ""}
                      onChange={e => setWebhooks(prev => ({ ...prev, [p.name]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => savePlattformMutation.mutate({
                        name: p.name,
                        webhookUrl: webhooks[p.name] ?? p.webhookUrl ?? undefined,
                      })}
                      disabled={savePlattformMutation.isPending}
                    >
                      Speichern
                    </Button>
                    <Button
                      size="sm"
                      className={`h-8 text-xs min-w-[80px] ${p.aktiv ? "bg-muted text-muted-foreground hover:bg-muted/80" : ""}`}
                      onClick={() => savePlattformMutation.mutate({ name: p.name, aktiv: !p.aktiv })}
                      disabled={!p.webhookUrl && !webhooks[p.name]}
                    >
                      {p.aktiv ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Posting-Historie ───────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Posting-Protokoll
            <Badge variant="outline" className="text-xs ml-auto">{postings.length} Einträge</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {postingLoading ? <Skeleton className="h-40 w-full" /> : postings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Noch keine Posts — Plattform aktivieren und "Jetzt auto-posten" klicken</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {postings.map(post => (
                <div key={post.id} className={`flex items-start gap-3 rounded-lg border p-2.5 text-xs ${post.status === "gepostet" ? "border-primary/20 bg-primary/5" : "border-destructive/20 bg-destructive/5"}`}>
                  {post.status === "gepostet"
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-semibold capitalize ${PLATTFORM_FARBEN[post.plattform] ?? "text-foreground"}`}>
                        {post.plattform}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {post.gepostetAm
                          ? new Date(post.gepostetAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : new Date(post.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {post.webhookResponse && (
                        <span className="text-muted-foreground/60 font-mono">{post.webhookResponse}</span>
                      )}
                    </div>
                    {post.inhaltKurz && (
                      <p className="text-muted-foreground truncate">{post.inhaltKurz}</p>
                    )}
                    {post.fehler && (
                      <p className="text-destructive font-mono">{post.fehler}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Anleitung ─────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">So richtest du Auto-Posting ein</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p><span className="text-primary font-mono">1.</span> Gratis-Konto auf <a href="https://make.com" target="_blank" className="text-primary hover:underline">make.com</a> erstellen</p>
          <p><span className="text-primary font-mono">2.</span> Neues Scenario anlegen: <span className="font-mono bg-muted px-1 rounded">Webhooks → Custom Webhook</span> → Webhook-URL kopieren</p>
          <p><span className="text-primary font-mono">3.</span> Im Scenario: <span className="font-mono bg-muted px-1 rounded">TikTok / Instagram / YouTube</span> Modul hinzufügen → mit deinem Account verbinden</p>
          <p><span className="text-primary font-mono">4.</span> Webhook-URL hier eintragen → Plattform aktivieren → fertig ✅</p>
          <p className="pt-1 border-t border-border/50">Payload-Felder: <span className="font-mono bg-muted px-1 rounded">inhalt</span> <span className="font-mono bg-muted px-1 rounded">titel</span> <span className="font-mono bg-muted px-1 rounded">marke</span> <span className="font-mono bg-muted px-1 rounded">plattform</span> <span className="font-mono bg-muted px-1 rounded">contentId</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
