import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageCircle, Send, Users, Zap, ExternalLink, RefreshCw,
  CheckCircle2, AlertCircle, Bot,
} from "lucide-react";

const BASE = "/api";
function authH() {
  const t = import.meta.env["VITE_API_AUTH_TOKEN"] as string | undefined;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface WAStatus {
  konfiguriert: boolean;
  telefonNummer: string | null;
  empfaengerAnzahl: number;
  heutigeNachrichten: number;
}

interface EmpfaengerResponse {
  empfaenger: string[];
  anzahl: number;
}

export default function WhatsApp() {
  const qc = useQueryClient();
  const [neueTelefon, setNeueTelefon] = useState("");
  const [tippVorschau, setTippVorschau] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const { data: status, isLoading } = useQuery<WAStatus>({
    queryKey: ["wa-status"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/whatsapp/status`, { headers: authH() });
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: empfaengerData } = useQuery<EmpfaengerResponse>({
    queryKey: ["wa-empfaenger"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/whatsapp/empfaenger`, { headers: authH() });
      return r.json();
    },
  });

  const { mutate: sendeTipp, isPending: sendet } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/whatsapp/tipp-senden`, {
        method: "POST", headers: authH(),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wa-status"] }); },
  });

  const { mutate: fuegeHinzu, isPending: hinzufuegen } = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/whatsapp/empfaenger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH() },
        body: JSON.stringify({ telefon: neueTelefon }),
      });
      return r.json();
    },
    onSuccess: () => {
      setNeueTelefon("");
      void qc.invalidateQueries({ queryKey: ["wa-empfaenger", "wa-status"] });
    },
  });

  const ladeVorschau = async () => {
    setLaedt(true);
    try {
      const r = await fetch(`${BASE}/whatsapp/tipp-vorschau`, { headers: authH() });
      const d = await r.json() as { tipp: string };
      setTippVorschau(d.tipp);
    } finally {
      setLaedt(false);
    }
  };

  const konfiguriert = status?.konfiguriert ?? false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-400" />
            WhatsApp-Agent
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Meta Business API · 40–70% Öffnungsrate · Tägl. 09:30 Uhr
          </p>
        </div>
        {konfiguriert ? (
          <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" /> AKTIV
          </Badge>
        ) : (
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[10px]">
            <AlertCircle className="h-3 w-3 mr-1" /> Setup nötig
          </Badge>
        )}
      </div>

      {/* Nicht konfiguriert */}
      {!isLoading && !konfiguriert && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-yellow-400 mb-2">⚠️ WhatsApp Business API noch nicht eingerichtet</p>
            <p className="text-xs text-muted-foreground mb-3">
              Einmalige Einrichtung ~30 Min. Danach vollautomatischer Betrieb: tägliche KI-Tipps + Sales-Bot der auf Kunden-Nachrichten antwortet.
            </p>
            <a href="https://developers.facebook.com/docs/whatsapp/getting-started" target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-1 text-xs">
                <ExternalLink className="h-3.5 w-3.5" />
                Meta Developer Docs
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Card className={konfiguriert ? "" : "opacity-50"}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-green-400" />
                <span className="text-xs text-muted-foreground">Empfänger</span>
              </div>
              <p className="text-2xl font-bold">{status?.empfaengerAnzahl ?? 0}</p>
            </CardContent>
          </Card>
          <Card className={konfiguriert ? "" : "opacity-50"}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Send className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Heute gesendet</span>
              </div>
              <p className="text-2xl font-bold">{status?.heutigeNachrichten ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 border-green-500/20 bg-green-500/5">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-green-400">40–70% Öffnungsrate</p>
                  <p className="text-[11px] text-muted-foreground">3× mehr als E-Mail. {status?.telefonNummer ?? "Nummer noch nicht konfiguriert"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tipp Vorschau + Senden */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Täglicher KI-Tipp
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {tippVorschau ? (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1 font-mono">VORSCHAU</p>
              <p className="text-sm">{tippVorschau}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              KI generiert jeden Tag automatisch einen neuen Tipp. Automatisch täglich <strong>09:30 Uhr</strong>.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => void ladeVorschau()}
              disabled={laedt}
            >
              {laedt ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Vorschau
            </Button>
            <Button
              className="flex-1 gap-2 text-xs"
              onClick={() => sendeTipp()}
              disabled={sendet || !konfiguriert || (status?.empfaengerAnzahl ?? 0) === 0}
            >
              {sendet ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {sendet ? "Sendet..." : `Jetzt senden (${status?.empfaengerAnzahl ?? 0} Empfänger)`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Empfänger verwalten */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Broadcast-Liste</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Format: Ländercode + Nummer ohne +, Leerzeichen oder Bindestriche.<br />
            Beispiel: <span className="font-mono">4917612345678</span> (DE: 49, AT: 43, CH: 41)
          </p>
          <div className="flex gap-2">
            <Input
              type="tel"
              placeholder="4917612345678"
              value={neueTelefon}
              onChange={e => setNeueTelefon(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 text-sm font-mono"
            />
            <Button
              size="sm"
              onClick={() => fuegeHinzu()}
              disabled={neueTelefon.length < 10 || hinzufuegen}
            >
              Hinzufügen
            </Button>
          </div>

          {(empfaengerData?.empfaenger ?? []).length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {(empfaengerData?.empfaenger ?? []).map(nr => (
                <div key={nr} className="flex items-center justify-between py-1 border-b border-border/50">
                  <span className="text-xs font-mono text-muted-foreground">+{nr}</span>
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales Bot Info */}
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Bot className="h-5 w-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-purple-400 mb-1">Automatischer Sales-Bot</p>
              <p className="text-xs text-muted-foreground">
                Wenn Kunden auf deine WhatsApp-Nummer schreiben, antwortet der KI-Bot automatisch:
                Fragen beantworten, Produkte empfehlen, Payment Links senden.
                Webhook-URL für Meta: <span className="font-mono text-[10px]">https://deine-domain.de/api/whatsapp/webhook</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup-Anleitung */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Einrichtung (30 Min, einmalig)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {[
            { nr: 1, text: "business.facebook.com → Meta Business Account erstellen", url: "https://business.facebook.com" },
            { nr: 2, text: "developers.facebook.com → Neue App → WhatsApp Business API aktivieren", url: "https://developers.facebook.com" },
            { nr: 3, text: "Telefonnummer hinzufügen → Phone Number ID kopieren" },
            { nr: 4, text: "System User Token erstellen (permanent) → Access Token kopieren" },
            { nr: 5, text: "Webhook-URL eintragen: https://deine-domain.de/api/whatsapp/webhook" },
            { nr: 6, text: "Phone Number ID + Access Token unter Einstellungen → API-Keys eintragen", url: "/einstellungen" },
          ].map(step => (
            <div key={step.nr} className="flex items-start gap-3">
              <div className="h-5 w-5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.nr}
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {step.text}
                {step.url && (
                  <a href={step.url} target={step.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer"
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
