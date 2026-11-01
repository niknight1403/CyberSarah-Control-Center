import { useState } from "react";
import { useListContent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Video, Smartphone, Globe, Copy, Check, ExternalLink, Zap } from "lucide-react";

const platformIcon: Record<string, React.ReactNode> = {
  TikTok: <Smartphone className="h-4 w-4" />,
  Instagram: <Smartphone className="h-4 w-4" />,
  YouTube: <Video className="h-4 w-4" />,
  Blog: <Globe className="h-4 w-4" />,
  Google: <Globe className="h-4 w-4" />,
};

const PLATTFORM_LINKS: Record<string, { url: string; label: string }> = {
  TikTok: { url: "https://www.tiktok.com/upload", label: "TikTok Upload" },
  Instagram: { url: "https://www.instagram.com/create/style", label: "Instagram Erstellen" },
  YouTube: { url: "https://studio.youtube.com/", label: "YouTube Studio" },
  Blog: { url: "https://wordpress.com/post/new", label: "WordPress Beitrag" },
  Google: { url: "https://search.google.com/search-console", label: "Google Console" },
};

export default function Content() {
  const { data: contents, isLoading } = useListContent();
  const [kopiertId, setKopiertId] = useState<number | null>(null);
  const [erweiterteId, setErweiterteId] = useState<number | null>(null);

  const kopiereInhalt = async (id: number, inhalt: string) => {
    try {
      await navigator.clipboard.writeText(inhalt);
      setKopiertId(id);
      setTimeout(() => setKopiertId(null), 2500);
    } catch {
      const el = document.createElement("textarea");
      el.value = inhalt;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setKopiertId(id);
      setTimeout(() => setKopiertId(null), 2500);
    }
  };

  if (isLoading || !contents) {
    return <Skeleton className="h-96 w-full bg-card" />;
  }

  const bereit = contents.filter(c => c.inhalt && c.status !== "veröffentlicht");
  const veroeffentlicht = contents.filter(c => c.status === "veröffentlicht");

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Content-Maschine</h2>
          <p className="text-muted-foreground text-sm">
            {bereit.length} bereit zum Posten · {veroeffentlicht.length} veröffentlicht · {contents.length} gesamt
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary font-mono">
          <Zap className="h-3 w-3" />
          Affiliate-Links automatisch eingebettet
        </div>
      </div>

      {bereit.length > 0 && (
        <div>
          <div className="text-xs text-primary font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
            <Zap className="h-3 w-3" /> Bereit zum Posten — direkt kopieren &amp; veröffentlichen
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bereit.map((content) => {
              const plattformLink = PLATTFORM_LINKS[content.plattform];
              const istKopiert = kopiertId === content.id;
              const istErweitert = erweiterteId === content.id;

              return (
                <Card key={content.id} className="bg-card border-primary/20 flex flex-col ring-1 ring-primary/10 hover:ring-primary/30 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
                          {platformIcon[content.plattform] || <FileText className="h-4 w-4" />}
                        </div>
                        <CardTitle className="text-sm line-clamp-2 leading-snug">{content.titel}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-xs">{content.marke}</Badge>
                      <Badge variant="outline" className="text-xs">{content.typ}</Badge>
                      <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        {content.status}
                      </Badge>
                    </div>

                    <div
                      className={`text-xs text-muted-foreground bg-muted/50 p-2.5 rounded font-mono border border-border cursor-pointer transition-all ${istErweitert ? "" : "line-clamp-4"}`}
                      onClick={() => setErweiterteId(istErweitert ? null : content.id)}
                    >
                      {content.inhalt}
                    </div>
                    {!istErweitert && (
                      <button
                        className="text-xs text-muted-foreground hover:text-primary transition-colors text-left"
                        onClick={() => setErweiterteId(content.id)}
                      >
                        ▼ Volltext anzeigen
                      </button>
                    )}

                    <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant={istKopiert ? "default" : "outline"}
                        className="flex-1 text-xs h-8"
                        onClick={() => kopiereInhalt(content.id, content.inhalt ?? "")}
                      >
                        {istKopiert
                          ? <><Check className="h-3 w-3 mr-1" /> Kopiert!</>
                          : <><Copy className="h-3 w-3 mr-1" /> Kopieren</>}
                      </Button>
                      {plattformLink && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 border-primary/30 text-primary hover:bg-primary/10"
                          asChild
                        >
                          <a href={plattformLink.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            {content.plattform}
                          </a>
                        </Button>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground/60">
                      {new Date(content.createdAt).toLocaleString("de-DE")}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {veroeffentlicht.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-3">
            Veröffentlicht ({veroeffentlicht.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {veroeffentlicht.map((content) => (
              <Card key={content.id} className="bg-card/50 border-border opacity-70 flex flex-col">
                <CardContent className="pt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-primary/50">
                      {platformIcon[content.plattform] || <FileText className="h-4 w-4" />}
                    </div>
                    <span className="text-sm line-clamp-1">{content.titel}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-xs">{content.marke}</Badge>
                    <Badge className="text-xs bg-primary/20 text-primary">veröffentlicht</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground/60">
                    {content.veroeffentlichtAm
                      ? new Date(content.veroeffentlichtAm).toLocaleString("de-DE")
                      : new Date(content.createdAt).toLocaleString("de-DE")}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {contents.length === 0 && (
        <div className="text-center py-16 text-muted-foreground font-mono text-sm">
          Noch kein Content generiert — Content Factory Agent starten
        </div>
      )}
    </div>
  );
}
