import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, AlertCircle, ExternalLink, Key, Zap,
  RefreshCw, Eye, EyeOff, Search, TrendingUp, Sparkles,
} from "lucide-react";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = import.meta.env["VITE_API_AUTH_TOKEN"] as string | undefined;
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

interface ApiKeyStatus {
  schluessel: string;
  name: string;
  kategorie: string;
  gesetzt: boolean;
  gueltig: boolean | null;
  testNachricht: string | null;
  einrichtungsUrl: string;
  umsatzPotenzial: string;
  monatlicheKosten: string;
  provision?: string;
  autoIntegrierbar: boolean;
}

interface ApiScanResult {
  gesetzt: number;
  fehlend: number;
  monatlichesUmsatzpotenzial: string;
  naechsteEmpfehlung: string;
  alleStatus: ApiKeyStatus[];
}

const KATEGORIE_LABEL: Record<string, string> = {
  pflicht: "🔴 Pflicht",
  umsatz: "💰 Umsatz",
  content: "📱 Content",
  analytics: "📊 Analytics",
};

const POTENZIAL_COLOR: Record<string, string> = {
  hoch: "text-green-400",
  mittel: "text-yellow-400",
  niedrig: "text-muted-foreground",
};

function ApiKeyCard({ status, onSave, onTest }: {
  status: ApiKeyStatus;
  onSave: (schluessel: string, wert: string) => void;
  onTest: (schluessel: string) => void;
}) {
  const [wert, setWert] = useState("");
  const [sichtbar, setSichtbar] = useState(false);

  return (
    <Card className={`border ${status.gesetzt ? "border-green-500/20 bg-green-500/5" : "border-border"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{status.name}</span>
              <Badge variant="outline" className="text-[9px]">
                {KATEGORIE_LABEL[status.kategorie] ?? status.kategorie}
              </Badge>
              {status.provision && (
                <Badge variant="outline" className="text-[9px] text-green-400 border-green-500/30">
                  {status.provision}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{status.monatlicheKosten}</p>
          </div>
          <div className="shrink-0">
            {status.gesetzt ? (
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>
        </div>

        {status.testNachricht && (
          <p className="text-[11px] text-muted-foreground mb-3">{status.testNachricht}</p>
        )}

        {/* Umsatzpotenzial */}
        <div className="flex items-center gap-1 mb-3">
          <TrendingUp className={`h-3 w-3 ${POTENZIAL_COLOR[status.umsatzPotenzial]}`} />
          <span className={`text-[10px] font-medium ${POTENZIAL_COLOR[status.umsatzPotenzial]}`}>
            Umsatzpotenzial: {status.umsatzPotenzial}
          </span>
        </div>

        {/* Key-Eingabe */}
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Input
              type={sichtbar ? "text" : "password"}
              placeholder={`${status.schluessel} eingeben...`}
              value={wert}
              onChange={e => setWert(e.target.value)}
              className="h-8 text-xs pr-8 font-mono"
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setSichtbar(!sichtbar)}
            >
              {sichtbar ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!wert}
            onClick={() => { onSave(status.schluessel, wert); setWert(""); }}
          >
            Speichern
          </Button>
        </div>

        {/* Aktions-Buttons */}
        <div className="flex gap-2">
          {status.gesetzt && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={() => onTest(status.schluessel)}
            >
              Testen
            </Button>
          )}
          <a href={status.einrichtungsUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1">
              <ExternalLink className="h-3 w-3" />
              Einrichten
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Einstellungen() {
  const qc = useQueryClient();
  const [neueEmpfehlungen, setNeueEmpfehlungen] = useState<string[]>([]);
  const [sucheVorgang, setSucheVorgang] = useState(false);
  const [filterKategorie, setFilterKategorie] = useState<string>("alle");

  const { data, isLoading } = useQuery<ApiScanResult>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/einstellungen/api-keys`, { headers: authHeaders() });
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { mutate: speichereKey } = useMutation({
    mutationFn: async ({ schluessel, wert }: { schluessel: string; wert: string }) => {
      const r = await fetch(`${BASE}/einstellungen/api-keys/${schluessel}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ wert }),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["api-keys"] }); },
  });

  const { mutate: testeKey } = useMutation({
    mutationFn: async ({ schluessel }: { schluessel: string }) => {
      const r = await fetch(`${BASE}/einstellungen/api-keys/${schluessel}/testen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      return r.json();
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["api-keys"] }); },
  });

  const sucheNeueApis = async () => {
    setSucheVorgang(true);
    try {
      const r = await fetch(`${BASE}/einstellungen/api-keys/neue-suchen`, { headers: authHeaders() });
      const d = await r.json() as { empfehlungen: string[] };
      setNeueEmpfehlungen(d.empfehlungen);
    } finally {
      setSucheVorgang(false);
    }
  };

  const kategorien = ["alle", "pflicht", "umsatz", "content", "analytics"];
  const gefiltert = (data?.alleStatus ?? []).filter(s =>
    filterKategorie === "alle" || s.kategorie === filterKategorie
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            API-Key-Agent
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Autonome API-Verwaltung — mehr Keys = mehr echter Umsatz
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => void sucheNeueApis()}
          disabled={sucheVorgang}
        >
          {sucheVorgang ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          KI: Neue APIs suchen
        </Button>
      </div>

      {/* Status-Karten */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-green-400">{data.gesetzt}</p>
              <p className="text-[11px] text-muted-foreground">APIs aktiv</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-yellow-400">{data.fehlend}</p>
              <p className="text-[11px] text-muted-foreground">APIs fehlen</p>
            </CardContent>
          </Card>
          <Card className="col-span-2 border-primary/20 bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-primary">{data.monatlichesUmsatzpotenzial}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{data.naechsteEmpfehlung}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* KI-Empfehlungen */}
      {neueEmpfehlungen.length > 0 && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              KI hat neue APIs gefunden
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {neueEmpfehlungen.map((emp, i) => (
              <p key={i} className="text-xs text-muted-foreground border-l-2 border-purple-500/30 pl-3"
                dangerouslySetInnerHTML={{ __html: emp.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>') }}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {kategorien.map(k => (
          <button
            key={k}
            onClick={() => setFilterKategorie(k)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
              filterKategorie === k
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-foreground"
            }`}
          >
            {k === "alle" ? "Alle" : KATEGORIE_LABEL[k]}
          </button>
        ))}
      </div>

      {/* API-Key-Karten */}
      <div className="grid gap-3">
        {isLoading
          ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)
          : gefiltert.map(status => (
            <ApiKeyCard
              key={status.schluessel}
              status={status}
              onSave={(schluessel, wert) => speichereKey({ schluessel, wert })}
              onTest={(schluessel) => testeKey({ schluessel })}
            />
          ))
        }
      </div>
    </div>
  );
}
