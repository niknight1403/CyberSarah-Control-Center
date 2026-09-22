import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-fetch";
import {
  Zap, CheckCircle, ExternalLink, Copy, AlertTriangle,
  ShoppingCart, Users, Rocket, ClipboardList, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Typen ────────────────────────────────────────────────────────────────────

interface Produkt {
  id: number;
  name: string;
  beschreibung: string | null;
  preis: string;
  kategorie: string;
  stripePaymentLink: string | null;
  aktiv: boolean | null;
  verkauft: string | null;
}

interface SetupSchritt {
  id: number;
  schluessel: string;
  name: string;
  erledigt: boolean | null;
  metadaten: string | null;
  erledigtAm: string | null;
}

interface ErstelleErgebnis {
  erstellt: number;
  produkte: Array<{ name: string; preis: string; paymentLink: string; kategorie: string }>;
  fehler: string[];
}

interface AffiliateTemplate {
  platform: string;
  vorlage: string;
  platzhalter: string;
}

// ─── Setup-Schritt-Karte ──────────────────────────────────────────────────────

function SetupSchrittKarte({
  schritt, index, produkte, onErledigt
}: {
  schritt: SetupSchritt;
  index: number;
  produkte: Produkt[];
  onErledigt: (schluessel: string) => void;
}) {
  const [offen, setOffen] = useState(false);

  const SCHRITT_DETAILS: Record<string, {
    zeitaufwand: string;
    icon: React.ElementType;
    farbe: string;
    schritte: string[];
    links: Array<{ label: string; url: string }>;
    hinweis?: string;
  }> = {
    stripe_produkte: {
      zeitaufwand: "automatisch",
      icon: Zap,
      farbe: "text-primary",
      schritte: [
        "Klicke auf '⚡ Jetzt erstellen' unten",
        "Das System erstellt automatisch alle 5 Produkte in deinem Stripe-Account",
        "Du erhältst sofort echte Payment-Links die du teilen kannst",
      ],
      links: [{ label: "Stripe Dashboard öffnen", url: "https://dashboard.stripe.com/payment-links" }],
    },
    gumroad: {
      zeitaufwand: "~10 Minuten",
      icon: ShoppingCart,
      farbe: "text-blue-400",
      schritte: [
        "1. Gumroad.com öffnen → Kostenloser Account (nur E-Mail nötig)",
        "2. 'New Product' → Typ: 'Digital Product'",
        "3. Produktname + Beschreibung eintragen (Vorlagen weiter unten)",
        "4. Preis eintragen (€19 / €49 / €97)",
        "5. Datei hochladen: erstelle ein einfaches PDF mit deinen Prompts",
        "6. Publish → Link kopieren → in Protokolle eintragen",
      ],
      links: [
        { label: "Gumroad kostenlos anmelden", url: "https://app.gumroad.com/signup" },
        { label: "Gumroad Product erstellen", url: "https://app.gumroad.com/products/new" },
      ],
      hinweis: "Gumroad-Auszahlungen: du brauchst PayPal oder Bankverbindung. Tipp: erstelle erst ein kostenloses Produkt zum Testen.",
    },
    digistore24: {
      zeitaufwand: "~10 Minuten",
      icon: Users,
      farbe: "text-yellow-400",
      schritte: [
        "1. Digistore24.com → 'Jetzt registrieren' (kostenlos)",
        "2. Als 'Affiliate' anmelden (nicht als Vendor)",
        "3. Marketplace → nach KI, ChatGPT, Online Business suchen",
        "4. Top-Produkte auswählen (Provision 30-70%)",
        "5. Affiliate-Link kopieren",
        "6. Link hier eintragen → System fügt ihn automatisch in Content ein",
      ],
      links: [
        { label: "Digistore24 kostenlos anmelden", url: "https://www.digistore24.com/vendor/register" },
        { label: "Marketplace durchsuchen", url: "https://www.digistore24.com/marketplace" },
      ],
      hinweis: "Dein Affiliate-Link funktioniert sofort nach Registrierung — keine Wartezeit, keine Genehmigung nötig.",
    },
    coaching_buchung: {
      zeitaufwand: "automatisch",
      icon: Rocket,
      farbe: "text-green-400",
      schritte: [
        "Stripe Payment Link für '1:1 KI-Business Coaching (60min) — €197' wird automatisch erstellt",
        "Link im Content Agent für alle Coaching-Posts verwenden",
        "Nach Zahlung: Kunden-E-Mail kommt über Stripe → du buchst manuell einen Termin",
        "Optional: Calendly.com (kostenlos bis 1 Meeting-Typ) für automatische Terminbuchung",
      ],
      links: [
        { label: "Stripe Payment Links ansehen", url: "https://dashboard.stripe.com/payment-links" },
        { label: "Calendly kostenlos (optional)", url: "https://calendly.com/signup" },
      ],
      hinweis: "Mit Stripe kannst du sofort Coaching verkaufen — du brauchst kein Calendly. Nach Zahlung schickst du einen Zoom-Link.",
    },
  };

  const details = SCHRITT_DETAILS[schritt.schluessel];
  if (!details) return null;

  const Icon = details.icon;
  const istErledigt = schritt.erledigt ?? false;

  const stripeProdukte = produkte.filter(p => p.kategorie === "prompt_paket" && p.stripePaymentLink);

  return (
    <Card className={cn("border transition-all", istErledigt ? "border-green-500/20 bg-green-500/5" : "border-border bg-card")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setOffen(!offen)}>
          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 border",
            istErledigt ? "bg-green-500/20 border-green-500/30" : "bg-background/60 border-border"
          )}>
            {istErledigt
              ? <CheckCircle className="h-4 w-4 text-green-400" />
              : <span className="text-xs font-bold text-muted-foreground">{index + 1}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-semibold", istErledigt && "line-through text-muted-foreground")}>{schritt.name}</span>
              <Badge variant="outline" className={cn("text-[9px]",
                schritt.schluessel === "stripe_produkte" || schritt.schluessel === "coaching_buchung"
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-blue-500/10 border-blue-500/20 text-blue-400"
              )}>
                {schritt.schluessel === "stripe_produkte" || schritt.schluessel === "coaching_buchung" ? "AUTOMATISCH" : details.zeitaufwand}
              </Badge>
            </div>
          </div>
          {offen ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>

        {offen && (
          <div className="mt-4 space-y-3 pl-10">
            <div className="space-y-1">
              {details.schritte.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <Icon className={cn("h-3 w-3 shrink-0 mt-0.5", details.farbe)} />
                  <span className="text-muted-foreground">{s}</span>
                </div>
              ))}
            </div>

            {details.hinweis && (
              <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded p-2 text-[10px] text-yellow-400">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{details.hinweis}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {details.links.map((link) => (
                <Button key={link.url} size="sm" variant="outline" className="h-7 text-[10px] gap-1"
                  onClick={() => window.open(link.url, "_blank")}>
                  <ExternalLink className="h-3 w-3" />
                  {link.label}
                </Button>
              ))}
              {!istErledigt && (schritt.schluessel === "gumroad" || schritt.schluessel === "digistore24") && (
                <Button size="sm" variant="default" className="h-7 text-[10px] bg-primary text-black gap-1 ml-auto"
                  onClick={() => onErledigt(schritt.schluessel)}>
                  <CheckCircle className="h-3 w-3" />
                  Als erledigt markieren
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Produkt-Karte ────────────────────────────────────────────────────────────

function ProduktKarte({ produkt }: { produkt: Produkt }) {
  const { toast } = useToast();

  const kopieren = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "✅ Link kopiert!", description: "Payment-Link in Zwischenablage" });
  };

  const kategorieLabel: Record<string, string> = {
    prompt_paket: "Digitales Produkt",
    coaching: "1:1 Coaching",
    kurs: "Online-Kurs",
  };

  return (
    <Card className={cn("bg-card border transition-all",
      produkt.stripePaymentLink ? "border-primary/30 shadow-[0_0_10px_hsl(var(--primary)/0.08)]" : "border-border opacity-60"
    )}>
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-xs font-bold">{produkt.name}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{kategorieLabel[produkt.kategorie] ?? produkt.kategorie}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-primary">€{parseFloat(produkt.preis).toFixed(0)}</div>
            {produkt.stripePaymentLink && <div className="text-[9px] text-green-400">✅ LIVE</div>}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mb-3 line-clamp-2">{produkt.beschreibung}</p>

        {produkt.stripePaymentLink ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1 bg-background/60 rounded px-2 py-1.5 text-[9px] font-mono text-muted-foreground border border-border">
              <span className="truncate flex-1">{produkt.stripePaymentLink}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-[10px] bg-primary text-black hover:bg-primary/90"
                onClick={() => kopieren(produkt.stripePaymentLink!)}>
                <Copy className="h-3 w-3 mr-1" />Link kopieren
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2"
                onClick={() => window.open(produkt.stripePaymentLink!, "_blank")}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground text-center py-2">
            Warte auf Erstellung...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Affiliate-Template Karte ─────────────────────────────────────────────────

function AffiliateTemplateKarte({ template }: { template: AffiliateTemplate }) {
  const { toast } = useToast();
  const [offen, setOffen] = useState(false);

  const kopieren = () => {
    void navigator.clipboard.writeText(template.vorlage);
    toast({ title: "✅ Vorlage kopiert!", description: "Füge deinen Affiliate-Link ein: " + template.platzhalter });
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setOffen(!offen)}>
          <span className="text-xs font-semibold">{template.platform}</span>
          {offen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        {offen && (
          <div className="mt-3 space-y-2">
            <div className="bg-background/60 rounded p-2 text-[9px] font-mono text-muted-foreground whitespace-pre-wrap border border-border max-h-36 overflow-y-auto">
              {template.vorlage}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[9px] text-yellow-400 flex items-center gap-1 flex-1">
                <AlertTriangle className="h-3 w-3" />
                Ersetze: <code className="bg-background px-1 rounded">{template.platzhalter}</code>
              </div>
              <Button size="sm" variant="outline" className="h-6 text-[9px] px-2 shrink-0" onClick={kopieren}>
                <Copy className="h-2.5 w-2.5 mr-1" />Kopieren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function SofortStart() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: produkte, isLoading: produkteLoading } = useQuery<Produkt[]>({
    queryKey: ["sofort-produkte"],
    queryFn: async () => {
      const res = await apiFetch("/api/sofort-start/produkte");
      if (!res.ok) throw new Error("Fehler");
      return res.json() as Promise<Produkt[]>;
    },
    refetchInterval: 15_000,
  });

  const { data: setupSchritte } = useQuery<SetupSchritt[]>({
    queryKey: ["setup-schritte"],
    queryFn: async () => {
      const res = await apiFetch("/api/sofort-start/setup-status");
      if (!res.ok) throw new Error("Fehler");
      return res.json() as Promise<SetupSchritt[]>;
    },
    refetchInterval: 30_000,
  });

  const { data: affiliateTemplates } = useQuery<AffiliateTemplate[]>({
    queryKey: ["affiliate-templates"],
    queryFn: async () => {
      const res = await apiFetch("/api/sofort-start/affiliate-templates");
      if (!res.ok) throw new Error("Fehler");
      return res.json() as Promise<AffiliateTemplate[]>;
    },
  });

  const erstelleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/sofort-start/erstelle-produkte", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ErstelleErgebnis>;
    },
    onSuccess: (data) => {
      if (data.erstellt > 0) {
        toast({ title: `✅ ${data.erstellt} Produkte erstellt!`, description: "Stripe Payment-Links sind jetzt aktiv und einsatzbereit" });
      }
      if (data.fehler.length > 0) {
        toast({ title: "Teilerfolg", description: data.fehler[0] ?? "Unbekannter Fehler", variant: "destructive" });
      }
      void queryClient.invalidateQueries({ queryKey: ["sofort-produkte"] });
      void queryClient.invalidateQueries({ queryKey: ["setup-schritte"] });
    },
    onError: (err) => {
      toast({ title: "Fehler", description: err instanceof Error ? err.message : "Unbekannter Fehler", variant: "destructive" });
    },
  });

  const erledigtMutation = useMutation({
    mutationFn: async (schluessel: string) => {
      const res = await apiFetch(`/api/sofort-start/setup-schritt-erledigt/${schluessel}`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error("Fehler");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["setup-schritte"] });
      toast({ title: "✅ Schritt erledigt!", description: "Weiter zum nächsten Schritt" });
    },
  });

  const erledigteSchritte = setupSchritte?.filter(s => s.erledigt).length ?? 0;
  const gesamtSchritte = setupSchritte?.length ?? 4;
  const fortschritt = Math.round((erledigteSchritte / gesamtSchritte) * 100);
  const hatStripeProdukte = (produkte?.length ?? 0) > 0;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          Sofort-Start
        </h2>
        <p className="text-muted-foreground text-xs md:text-sm mt-0.5">
          Echte Produkte, echte Stripe-Links, echter Umsatz — jetzt sofort
        </p>
      </div>

      {/* Fortschritts-Banner */}
      <Card className={cn("border-2", fortschritt === 100 ? "border-green-500/40 bg-green-500/5" : "border-primary/30 bg-card")}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">Setup-Fortschritt</span>
                <span className="text-sm font-bold text-primary">{fortschritt}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${fortschritt}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{erledigteSchritte}/{gesamtSchritte} Schritte erledigt</div>
            </div>
            {!hatStripeProdukte && (
              <Button
                onClick={() => erstelleMutation.mutate()}
                disabled={erstelleMutation.isPending}
                className="bg-primary text-black hover:bg-primary/90 font-bold gap-2 shrink-0"
              >
                <Zap className={cn("h-4 w-4", erstelleMutation.isPending && "animate-pulse")} />
                {erstelleMutation.isPending ? "Erstelle Produkte..." : "⚡ Jetzt automatisch starten"}
              </Button>
            )}
            {hatStripeProdukte && fortschritt < 100 && (
              <div className="text-xs text-muted-foreground text-right">
                Stripe ✅ · Erledige die<br />manuellen Schritte (je ~10 Min)
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Setup-Schritte */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Einmalige Setup-Schritte
        </h3>
        <div className="space-y-2">
          {setupSchritte?.map((schritt, i) => (
            <SetupSchrittKarte
              key={schritt.id}
              schritt={schritt}
              index={i}
              produkte={produkte ?? []}
              onErledigt={(key) => erledigtMutation.mutate(key)}
            />
          )) ?? [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 bg-card" />)}
        </div>
      </div>

      {/* Stripe-Produkte mit Payment-Links */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          Deine Produkte & Payment-Links
          {hatStripeProdukte && <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20">LIVE</Badge>}
        </h3>
        {produkteLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-44 bg-card" />)}
          </div>
        ) : !hatStripeProdukte ? (
          <Card className="bg-card border-dashed border-border">
            <CardContent className="p-6 text-center">
              <Zap className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">Noch keine Produkte erstellt</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Klicke auf "⚡ Jetzt automatisch starten" — das System erstellt<br />
                5 echte Stripe-Produkte mit echten Payment-Links in 60 Sekunden
              </p>
              <Button onClick={() => erstelleMutation.mutate()} disabled={erstelleMutation.isPending}
                className="bg-primary text-black hover:bg-primary/90">
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {erstelleMutation.isPending ? "Erstelle..." : "Produkte erstellen"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {produkte?.map(p => <ProduktKarte key={p.id} produkt={p} />)}
          </div>
        )}
      </div>

      {/* Affiliate Content-Templates */}
      {affiliateTemplates && affiliateTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Content-Vorlagen für Affiliate-Links (Digistore24)
          </h3>
          <div className="space-y-2">
            {affiliateTemplates.map(t => <AffiliateTemplateKarte key={t.platform} template={t} />)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Nach Digistore24-Anmeldung: Deinen persönlichen Affiliate-Link in den Platzhalter eintragen — der Content-Agent befüllt dann automatisch alle Posts.
          </p>
        </div>
      )}
    </div>
  );
}
