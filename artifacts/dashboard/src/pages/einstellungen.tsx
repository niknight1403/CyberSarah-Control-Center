import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import {
  CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Zap, Link, Webhook, Settings, Copy, Check, RefreshCw,
  ChevronDown, ChevronUp, Eye, EyeOff, KeyRound
} from "lucide-react";

// ─── Typen ───────────────────────────────────────────────────────────────────
interface AffiliateLink {
  marke: string;
  netzwerk: string;
  url: string;
  cta: string;
  provision?: string;
}

interface SetupStatus {
  schritte: Array<{
    id: number;
    schluessel: string;
    name: string;
    erledigt: boolean;
    metadaten: string | null;
    erledigtAm: string | null;
    createdAt: string;
  }>;
  systemStatus: {
    openaiKeyGesetzt: boolean;
    webhookKonfiguriert: boolean;
    affiliateLinksKonfiguriert: boolean;
    stripeAktiv: boolean;
  };
}

// ─── Custom Fetches (ohne generierten Hook da frischer Codegen) ──────────────
const BASE = "/api";

async function fetchSetup(): Promise<SetupStatus> {
  const r = await apiFetch(`${BASE}/einstellungen/setup`).catch(() => ({ ok: false, json: async () => ({}) } as Response));
  return r.json() as Promise<SetupStatus>;
}
async function fetchAffiliateLinks(): Promise<{ affiliateLinks: AffiliateLink[] }> {
  const r = await apiFetch(`${BASE}/einstellungen/affiliate-links`).catch(() => ({ ok: false, json: async () => ({ affiliateLinks: [] }) } as Response));
  return r.json() as Promise<{ affiliateLinks: AffiliateLink[] }>;
}
async function fetchWebhook(): Promise<{ webhookUrl: string | null; aktiv: boolean }> {
  const r = await apiFetch(`${BASE}/einstellungen/webhook`).catch(() => ({ ok: false, json: async () => ({ webhookUrl: null, aktiv: false }) } as Response));
  return r.json() as Promise<{ webhookUrl: string | null; aktiv: boolean }>;
}

// ─── Setup-Checkliste ────────────────────────────────────────────────────────
const EXTERNE_SETUP_SCHRITTE = [
  {
    schluessel: "openai_key",
    name: "OpenAI API-Key",
    beschreibung: "Für echten KI-Content statt Templates",
    url: "https://platform.openai.com/api-keys",
    urlLabel: "platform.openai.com",
    provision: null,
    prioritaet: 1,
  },
  {
    schluessel: "amazon_affiliate",
    name: "Amazon PartnerNet",
    beschreibung: "3-10% Provision auf Technik, KI-Tools, Bücher",
    url: "https://affiliate-program.amazon.de",
    urlLabel: "affiliate-program.amazon.de",
    provision: "3-10%",
    prioritaet: 2,
  },
  {
    schluessel: "digistore24",
    name: "Digistore24",
    beschreibung: "25-60% Provision auf digitale Produkte, Kurse, Coaching",
    url: "https://www.digistore24.com",
    urlLabel: "digistore24.com",
    provision: "25-60%",
    prioritaet: 3,
  },
  {
    schluessel: "tiktok_creator",
    name: "TikTok Creator Account",
    beschreibung: "Creator Rewards Programm: €0,02-0,04 pro View",
    url: "https://www.tiktok.com/creators/creator-portal",
    urlLabel: "tiktok.com/creators",
    provision: "per View",
    prioritaet: 4,
  },
  {
    schluessel: "make_webhook",
    name: "Make.com / n8n Automation",
    beschreibung: "Content auto-posten auf TikTok, Instagram, Blog",
    url: "https://www.make.com",
    urlLabel: "make.com",
    provision: null,
    prioritaet: 5,
  },
];

// ─── Hauptkomponente ─────────────────────────────────────────────────────────
export default function Einstellungen() {
  const qc = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookGespeichert, setWebhookGespeichert] = useState(false);
  const [testErgebnis, setTestErgebnis] = useState<{ ok: boolean; msg: string } | null>(null);
  const [kopiertIdx, setKopiertIdx] = useState<number | null>(null);
  const [affiliateBearbeitung, setAffiliateBearbeitung] = useState<number | null>(null);
  const [affiliateForm, setAffiliateForm] = useState<Partial<AffiliateLink>>({});
  const [erweiterteSchritte, setErweiterteSchritte] = useState<Set<string>>(new Set());
  const [openaiKey, setOpenaiKey] = useState("");
  const [keySichtbar, setKeySichtbar] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["setup"],
    queryFn: fetchSetup,
    refetchInterval: 30_000,
  });

  const { data: affiliateData, isLoading: affiliateLoading } = useQuery({
    queryKey: ["affiliate-links"],
    queryFn: fetchAffiliateLinks,
  });

  const { data: webhookData, isLoading: webhookLoading } = useQuery({
    queryKey: ["webhook-config"],
    queryFn: fetchWebhook,
  });

  // Webhook-URL in State übernehmen wenn Daten geladen
  if (webhookData?.webhookUrl && !webhookUrl) {
    setWebhookUrl(webhookData.webhookUrl);
  }

  const saveOpenaiKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const r = await apiFetch(`${BASE}/einstellungen/openai-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await r.json() as { gespeichert?: boolean; gueltig?: boolean; key?: string; fehler?: string };
      if (!r.ok) throw new Error(d.fehler ?? "Fehler");
      return d;
    },
    onSuccess: (d) => {
      setKeyStatus({ ok: true, msg: `✅ Key gültig und aktiv — ${d.key ?? ""}` });
      setOpenaiKey("");
      void qc.invalidateQueries({ queryKey: ["setup"] });
      void qc.invalidateQueries({ queryKey: ["openai-key"] });
    },
    onError: (err: Error) => {
      setKeyStatus({ ok: false, msg: `❌ ${err.message}` });
    },
  });

  const { data: openaiKeyData } = useQuery({
    queryKey: ["openai-key"],
    queryFn: async () => {
      const r = await apiFetch(`${BASE}/einstellungen/openai-key`);
      return r.json() as Promise<{ gesetzt: boolean; keyVorschau: string | null; getestet: boolean }>;
    },
    refetchInterval: 10_000,
  });

  const saveAffiliateMutation = useMutation({
    mutationFn: async (links: AffiliateLink[]) => {
      const r = await apiFetch(`${BASE}/einstellungen/affiliate-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliateLinks: links }),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["affiliate-links"] }); },
  });

  const saveWebhookMutation = useMutation({
    mutationFn: async (url: string) => {
      const r = await apiFetch(`${BASE}/einstellungen/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: url, aktiv: true }),
      });
      return r.json();
    },
    onSuccess: () => {
      setWebhookGespeichert(true);
      setTimeout(() => setWebhookGespeichert(false), 3000);
      void qc.invalidateQueries({ queryKey: ["webhook-config"] });
      void qc.invalidateQueries({ queryKey: ["setup"] });
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`${BASE}/einstellungen/webhook/testen`, { method: "POST" });
      return r.json() as Promise<{ erfolgreich: boolean; statusCode?: number; fehler?: string }>;
    },
    onSuccess: (d) => {
      setTestErgebnis(d.erfolgreich
        ? { ok: true, msg: `✅ Webhook antwortet (HTTP ${d.statusCode ?? "?"})` }
        : { ok: false, msg: `❌ Fehler: ${d.fehler ?? "Unbekannt"}` });
      setTimeout(() => setTestErgebnis(null), 6000);
    },
  });

  const markSchritt = useMutation({
    mutationFn: async ({ schluessel, meta }: { schluessel: string; meta?: string }) => {
      const r = await apiFetch(`${BASE}/einstellungen/setup/${schluessel}/erledigt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadaten: meta }),
      });
      return r.json();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["setup"] }),
  });

  const links = affiliateData?.affiliateLinks ?? [];
  const sys = setup?.systemStatus;
  const dbSchritte = setup?.schritte ?? [];

  const erledigtSet = new Set([
    ...(sys?.openaiKeyGesetzt ? ["openai_key"] : []),
    ...dbSchritte.filter(s => s.erledigt).map(s => s.schluessel),
  ]);

  const erledigtAnzahl = EXTERNE_SETUP_SCHRITTE.filter(s => erledigtSet.has(s.schluessel)).length;
  const prozent = Math.round((erledigtAnzahl / EXTERNE_SETUP_SCHRITTE.length) * 100);

  const speichereAffiliate = (idx: number) => {
    const neu = links.map((l, i) => i === idx ? { ...l, ...affiliateForm } : l) as AffiliateLink[];
    saveAffiliateMutation.mutate(neu);
    setAffiliateBearbeitung(null);
    setAffiliateForm({});
  };

  const kopiereUrl = async (url: string, idx: number) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setKopiertIdx(idx);
    setTimeout(() => setKopiertIdx(null), 2000);
  };

  if (setupLoading) return <Skeleton className="h-96 w-full bg-card" />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Einstellungen</h2>
        <p className="text-muted-foreground text-sm">Setup-Wizard · Affiliate-Manager · Webhook-Automation</p>
      </div>

      {/* ─── OpenAI API-Key ────────────────────────────────────────────── */}
      <Card className={`bg-card border-2 ${openaiKeyData?.gesetzt && openaiKeyData.getestet ? "border-primary/30" : "border-amber-500/40"}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            OpenAI API-Key
            {openaiKeyData?.gesetzt && openaiKeyData.getestet
              ? <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30 ml-auto">✅ AKTIV</Badge>
              : <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 ml-auto">⚠ NICHT GESETZT</Badge>
            }
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Für echte KI-Content-Generierung statt Templates — direkt hier eingeben, kein Neustart nötig.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {openaiKeyData?.keyVorschau && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 font-mono">
              <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
              Gespeicherter Key: <span className="text-primary">{openaiKeyData.keyVorschau}</span>
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={keySichtbar ? "text" : "password"}
                className="font-mono text-xs h-10 pr-10"
                placeholder="sk-proj-... (Key hier einfügen)"
                value={openaiKey}
                onChange={e => { setOpenaiKey(e.target.value); setKeyStatus(null); }}
                onKeyDown={e => { if (e.key === "Enter" && openaiKey) saveOpenaiKeyMutation.mutate(openaiKey); }}
              />
              <button
                type="button"
                onClick={() => setKeySichtbar(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {keySichtbar ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button
              className="h-10 text-xs shrink-0 min-w-[120px]"
              onClick={() => saveOpenaiKeyMutation.mutate(openaiKey)}
              disabled={!openaiKey || saveOpenaiKeyMutation.isPending}
            >
              {saveOpenaiKeyMutation.isPending
                ? <><RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />Teste Key...</>
                : <><Zap className="h-3 w-3 mr-1.5" />Speichern & Testen</>}
            </Button>
          </div>
          {keyStatus && (
            <p className={`text-xs font-mono px-1 ${keyStatus.ok ? "text-primary" : "text-destructive"}`}>
              {keyStatus.msg}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/60">
            Der Key wird sofort gegen OpenAI geprüft — bei Erfolg starten alle KI-Agenten automatisch.
          </p>
        </CardContent>
      </Card>

      {/* ─── Setup-Fortschritt ─────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Monetarisierungs-Setup
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{erledigtAnzahl}/{EXTERNE_SETUP_SCHRITTE.length}</span>
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${prozent}%` }} />
              </div>
              <span className="text-xs font-mono text-primary">{prozent}%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* System-Status Badges */}
          <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
            {sys && (
              <>
                <StatusBadge ok={sys.openaiKeyGesetzt} label="OpenAI Key" />
                <StatusBadge ok={sys.stripeAktiv} label="Stripe Live" />
                <StatusBadge ok={sys.webhookKonfiguriert} label="Webhook" />
                <StatusBadge ok={sys.affiliateLinksKonfiguriert} label="Affiliate-Links" />
              </>
            )}
          </div>

          {/* Schritte */}
          {EXTERNE_SETUP_SCHRITTE.map((schritt) => {
            const erledigt = erledigtSet.has(schritt.schluessel);
            const erweitert = erweiterteSchritte.has(schritt.schluessel);
            return (
              <div key={schritt.schluessel}
                className={`rounded-lg border p-3 transition-all ${erledigt ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {erledigt
                      ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${erledigt ? "text-primary" : "text-foreground"}`}>
                          {schritt.name}
                        </span>
                        {schritt.provision && (
                          <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {schritt.provision}
                          </span>
                        )}
                        <span className="text-[9px] font-mono text-muted-foreground/50">#{schritt.prioritaet}</span>
                      </div>
                      {!erweitert && (
                        <p className="text-xs text-muted-foreground truncate">{schritt.beschreibung}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!erledigt && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 border-primary/30 text-primary hover:bg-primary/10"
                        asChild
                      >
                        <a href={schritt.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Öffnen
                        </a>
                      </Button>
                    )}
                    {!erledigt && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => markSchritt.mutate({ schluessel: schritt.schluessel })}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Erledigt
                      </Button>
                    )}
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setErweiterteSchritte(prev => {
                        const s = new Set(prev);
                        s.has(schritt.schluessel) ? s.delete(schritt.schluessel) : s.add(schritt.schluessel);
                        return s;
                      })}
                    >
                      {erweitert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {erweitert && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                    <p>{schritt.beschreibung}</p>
                    <div className="flex items-center gap-2">
                      <a href={schritt.url} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline font-mono">{schritt.urlLabel}</a>
                      <span className="text-muted-foreground/40">→ kostenlos anmelden → Link hier eintragen</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ─── Affiliate-Link-Manager ────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4 text-primary" />
            Affiliate-Link-Manager
            <Badge variant="outline" className="text-xs ml-auto">{links.length} Links</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Diese Links werden automatisch in jeden generierten Content eingebettet. Eigene Affiliate-IDs eintragen.
          </p>
        </CardHeader>
        <CardContent>
          {affiliateLoading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-2">
              {links.map((link, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-muted/30 p-3">
                  {affiliateBearbeitung === idx ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Marke</label>
                          <Input className="h-7 text-xs" value={affiliateForm.marke ?? link.marke}
                            onChange={e => setAffiliateForm(p => ({ ...p, marke: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Netzwerk</label>
                          <Input className="h-7 text-xs" value={affiliateForm.netzwerk ?? link.netzwerk}
                            onChange={e => setAffiliateForm(p => ({ ...p, netzwerk: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Deine Affiliate-URL (mit deiner ID)</label>
                        <Input className="h-7 text-xs font-mono" value={affiliateForm.url ?? link.url}
                          onChange={e => setAffiliateForm(p => ({ ...p, url: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">CTA-Text im Content</label>
                        <Input className="h-7 text-xs" value={affiliateForm.cta ?? link.cta}
                          onChange={e => setAffiliateForm(p => ({ ...p, cta: e.target.value }))} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="h-7 text-xs" onClick={() => speichereAffiliate(idx)}>Speichern</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setAffiliateBearbeitung(null); setAffiliateForm({}); }}>Abbrechen</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{link.marke}</span>
                          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{link.netzwerk}</span>
                          {link.provision && (
                            <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">{link.provision}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">{link.url}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => kopiereUrl(link.url, idx)}
                          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors">
                          {kopiertIdx === idx ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                        </button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { setAffiliateBearbeitung(idx); setAffiliateForm({}); }}>
                          Bearbeiten
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Webhook-Konfigurator ─────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            Auto-Publisher Webhook
            {sys?.webhookKonfiguriert && (
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30 ml-auto">AKTIV</Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Jeder neue Content wird automatisch an Make.com / Zapier / n8n gesendet und kann dort direkt auf TikTok, Instagram oder als Blog-Post veröffentlicht werden.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">Wie es funktioniert:</p>
            <p>1. Gratis-Konto auf <a href="https://make.com" target="_blank" className="text-primary hover:underline">make.com</a> anlegen</p>
            <p>2. Neues Scenario: Webhook → TikTok / Instagram / WordPress</p>
            <p>3. Webhook-URL hier eintragen → Content Factory sendet jeden neuen Inhalt sofort</p>
            <p>4. Payload-Felder: <code className="bg-muted px-1 rounded">marke</code> <code className="bg-muted px-1 rounded">typ</code> <code className="bg-muted px-1 rounded">inhalt</code> <code className="bg-muted px-1 rounded">plattform</code></p>
          </div>

          {webhookLoading ? <Skeleton className="h-10 w-full" /> : (
            <div className="flex gap-2">
              <Input
                className="font-mono text-xs h-9"
                placeholder="https://hook.eu1.make.com/xxxxx"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
              />
              <Button
                size="sm"
                className="h-9 text-xs shrink-0"
                onClick={() => saveWebhookMutation.mutate(webhookUrl)}
                disabled={!webhookUrl || saveWebhookMutation.isPending}
              >
                {webhookGespeichert ? <><Check className="h-3 w-3 mr-1" />Gespeichert</> : "Speichern"}
              </Button>
            </div>
          )}

          {sys?.webhookKonfiguriert && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => testWebhookMutation.mutate()}
                disabled={testWebhookMutation.isPending}
              >
                {testWebhookMutation.isPending
                  ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Teste...</>
                  : <><Zap className="h-3 w-3 mr-1" />Test-Webhook senden</>}
              </Button>
              {testErgebnis && (
                <span className={`text-xs font-mono ${testErgebnis.ok ? "text-primary" : "text-destructive"}`}>
                  {testErgebnis.msg}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Sofort-Geld-Plan ─────────────────────────────────────────── */}
      <Card className="bg-card border-primary/20 ring-1 ring-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Sofort-Geld-Plan — Priorisiert
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            {[
              { nr: 1, zeit: "Heute", aktion: "Content Factory triggern", details: "→ Agenten → Content Factory Agent → Trigger → echten Content mit Affiliate-Links generieren", done: sys?.openaiKeyGesetzt },
              { nr: 2, zeit: "1-2h", aktion: "Amazon PartnerNet anmelden", details: "→ affiliate-program.amazon.de → Link in Affiliate-Manager eintragen", done: erledigtSet.has("amazon_affiliate") },
              { nr: 3, zeit: "1 Tag", aktion: "Digistore24 Konto + erstes Produkt", details: "→ digistore24.com → KI-Guide erstellen → 25-60% Provision automatisch", done: erledigtSet.has("digistore24") },
              { nr: 4, zeit: "Tägl.", aktion: "5 Content-Stücke manuell posten", details: "→ Content-Seite → Kopieren → TikTok/Instagram → Affiliate-Links drin", done: false },
              { nr: 5, zeit: "Woche 1", aktion: "Make.com Webhook einrichten", details: "→ Webhook-URL eintragen → Content wird automatisch gepostet", done: sys?.webhookKonfiguriert },
            ].map(s => (
              <div key={s.nr} className={`flex gap-3 p-2.5 rounded-lg border ${s.done ? "border-primary/20 bg-primary/5" : "border-border"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${s.done ? "bg-primary text-background" : "bg-muted text-muted-foreground"}`}>
                  {s.done ? "✓" : s.nr}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${s.done ? "text-primary" : "text-foreground"}`}>{s.aktion}</span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{s.zeit}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{s.details}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Hilfkomponente ───────────────────────────────────────────────────────────
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${ok ? "border-primary/30 bg-primary/5 text-primary" : "border-border bg-muted/50 text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </div>
  );
}
