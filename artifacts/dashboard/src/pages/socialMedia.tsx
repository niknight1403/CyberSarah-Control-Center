import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { Share2, RefreshCw, Globe, Send, History, BarChart3, ExternalLink, Play, CheckCircle, XCircle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlattformStatus {
  name: string; displayName: string; icon: string; connected: boolean;
  postingLimit: number; postingsHeute: number; postingsGesamt: number;
  letzterPost?: string; oauthUrl: string; dbId?: number;
}

interface ContentItem {
  id: number; titel: string; marke: string; inhalt?: string;
  kategorie?: string; typ?: string; bildUrl?: string; videoUrl?: string;
  status?: string; erstellt?: string;
}

interface PostHistory {
  id: number; plattform: string; status: string; inhaltKurz?: string;
  fehler?: string; gepostetAm?: string; createdAt?: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useSocialStatus() {
  return useQuery<{ plattformen: PlattformStatus[] }>({
    queryKey: ["social-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/social/status");
      if (!(res instanceof Response)) return res as any;
      return res.json() as Promise<{ plattformen: PlattformStatus[] }>;
    },
    refetchInterval: 30_000,
  });
}

function useSocialContent() {
  return useQuery<{ content: ContentItem[] }>({
    queryKey: ["social-content"],
    queryFn: async () => {
      const res = await apiFetch("/api/social/content?limit=30");
      if (!(res instanceof Response)) return res as any;
      return res.json() as Promise<{ content: ContentItem[] }>;
    },
    refetchInterval: 60_000,
  });
}

function useSocialPosts() {
  return useQuery<{ posts: PostHistory[]; statistik: any }>({
    queryKey: ["social-posts"],
    queryFn: async () => {
      const res = await apiFetch("/api/social/posts");
      if (!(res instanceof Response)) return res as any;
      return res.json() as Promise<{ posts: PostHistory[]; statistik: any }>;
    },
    refetchInterval: 30_000,
  });
}

export default function SocialMedia() {
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useSocialStatus();
  const { data: contentData, isLoading: contentLoading, refetch: refetchContent } = useSocialContent();
  const { data: postsData, isLoading: postsLoading, refetch: refetchPosts } = useSocialPosts();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Post-Form
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [postPlatform, setPostPlatform] = useState<string>("alle");
  const [postContentId, setPostContentId] = useState<string>("");
  const [postCaption, setPostCaption] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");

  const postMut = useMutation({
    mutationFn: async () => {
      const body: any = { platform: postPlatform, caption: postCaption };
      if (postContentId) body.contentId = parseInt(postContentId);
      if (postImageUrl) body.imageUrl = postImageUrl;

      const url = postPlatform === "alle" ? "/api/social/post/alle" : "/api/social/post";
      const res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["social-posts"] });
      queryClient.invalidateQueries({ queryKey: ["social-status"] });
      setShowPostDialog(false);
      const erfolge = data.ergebnisse
        ? data.ergebnisse.filter((r: any) => r.success).length
        : data.success ? 1 : 0;
      toast({ title: "✅ Post abgeschlossen", description: `${erfolge} erfolgreich` });
    },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  const plattformen = statusData?.plattformen ?? [];
  const content = contentData?.content ?? [];
  const posts = postsData?.posts ?? [];
  const statistik = postsData?.statistik ?? {};

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📱 Social Media Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            {plattformen.filter(p => p.connected).length}/{plattformen.length} Plattformen verbunden
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showPostDialog} onOpenChange={setShowPostDialog}>
            <DialogTrigger asChild>
              <Button><Send className="w-4 h-4 mr-2" /> Neuer Post</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>📤 Content posten</DialogTitle>
              <DialogDescription>Wähle Plattform und Content aus</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-4">
                <div><Label>Plattform</Label>
                  <Select value={postPlatform} onValueChange={setPostPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">🌐 Alle Plattformen</SelectItem>
                      {plattformen.map(p => (
                        <SelectItem key={p.name} value={p.name} disabled={!p.connected}>
                          {p.icon} {p.displayName} {!p.connected ? "(nicht verbunden)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Content aus DB (optional)</Label>
                  <Select value={postContentId} onValueChange={setPostContentId}>
                    <SelectTrigger><SelectValue placeholder="Kein Content ausgewählt" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Direkter Text (ohne Content-ID)</SelectItem>
                      {content.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          [{c.marke}] {c.titel.slice(0, 50)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Caption / Text</Label>
                  <Textarea value={postCaption} onChange={e => setPostCaption(e.target.value)}
                    placeholder="Dein Post-Text..." rows={4} />
                </div>
                <div><Label>Bild-URL (optional)</Label>
                  <Input value={postImageUrl} onChange={e => setPostImageUrl(e.target.value)}
                    placeholder="https://..." />
                </div>
                <Button className="w-full" onClick={() => postMut.mutate()} disabled={!postCaption && !postContentId}>
                  {postMut.isPending ? "⏳ Poste..." : "🚀 Jetzt posten!"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => { refetchStatus(); refetchContent(); refetchPosts(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* Plattform-Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plattformen.map(p => (
          <Card key={p.name} className={`${p.connected ? "border-green-200" : "border-gray-200"} hover:shadow-md transition-shadow`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.icon}</span>
                  <h3 className="font-semibold">{p.displayName}</h3>
                </div>
                <Badge variant={p.connected ? "default" : "secondary"}>
                  {p.connected ? "✅ Verbunden" : "❌ Nicht verbunden"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Heute: {p.postingsHeute}/{p.postingLimit}</span>
                <span>Gesamt: {p.postingsGesamt}</span>
              </div>
              {p.letzterPost && (
                <p className="text-xs text-gray-400 mt-2">
                  Letzter Post: {new Date(p.letzterPost).toLocaleDateString("de-DE")}
                </p>
              )}
              {!p.connected && p.oauthUrl && (
                <Button variant="outline" size="sm" className="w-full mt-3 text-xs" asChild>
                  <a href={p.oauthUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" /> OAuth einrichten
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="verlauf">
        <TabsList>
          <TabsTrigger value="verlauf">📋 Post-Verlauf ({posts.length})</TabsTrigger>
          <TabsTrigger value="content">📦 Content ({content.length})</TabsTrigger>
          <TabsTrigger value="statistiken">📊 Statistiken</TabsTrigger>
        </TabsList>

        <TabsContent value="verlauf" className="space-y-4">
          {postsLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : posts.length === 0 ? (
            <Card className="p-8 text-center">
              <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Noch keine Posts gesendet</p>
            </Card>
          ) : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left bg-gray-50">
                    <th className="p-3">Plattform</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Inhalt</th>
                    <th className="p-3">Datum</th>
                  </tr></thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {plattformen.find(p => p.name === post.plattform)?.icon ?? "📱"} {post.plattform}
                        </td>
                        <td className="p-3">
                          <Badge variant={post.status === "gepostet" ? "default" : "destructive"} className="text-xs">
                            {post.status === "gepostet" ? "✅ Gepostet" : "❌ Fehler"}
                          </Badge>
                        </td>
                        <td className="p-3 text-gray-600 max-w-xs truncate">{post.inhaltKurz ?? "–"}</td>
                        <td className="p-3 text-xs text-gray-500">
                          {post.gepostetAm ? new Date(post.gepostetAm).toLocaleDateString("de-DE") : new Date(post.createdAt!).toLocaleDateString("de-DE")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          {contentLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : content.length === 0 ? (
            <Card className="p-8 text-center">
              <Globe className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Noch kein Content vorhanden.<br />Die Content Factory erstellt automatisch Content.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {content.slice(0, 20).map(c => (
                <Card key={c.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{c.titel}</h3>
                        <p className="text-xs text-gray-500 mt-1">{c.marke} · {c.kategorie ?? c.typ}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 ml-2">{c.status}</Badge>
                    </div>
                    {c.inhalt && <p className="text-xs text-gray-600 mt-2 line-clamp-2">{c.inhalt}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="statistiken">
          <Card><CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{statistik.gesamt ?? 0}</p>
                <p className="text-sm text-gray-500">Posts gesamt</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{statistik.erfolgreich ?? 0}</p>
                <p className="text-sm text-gray-500">Erfolgreich</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{statistik.fehler ?? 0}</p>
                <p className="text-sm text-gray-500">Fehler</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{statistik.erfolgsrate ?? "0"}%</p>
                <p className="text-sm text-gray-500">Erfolgsrate</p>
              </div>
            </div>

            {/* Nach Plattform */}
            {postsData?.posts && (
              <div className="mt-6">
                <h3 className="font-semibold mb-3">Posts nach Plattform</h3>
                <div className="flex flex-wrap gap-3">
                  {["tiktok", "instagram", "youtube"].map(platform => {
                    const count = posts.filter(p => p.plattform === platform).length;
                    const success = posts.filter(p => p.plattform === platform && p.status === "gepostet").length;
                    const plattformName = plattformen.find(p => p.name === platform);
                    return (
                      <Card key={platform} className="flex-1 min-w-[150px]">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl mb-1">{plattformName?.icon ?? "📱"}</p>
                          <p className="font-semibold">{plattformName?.displayName ?? platform}</p>
                          <p className="text-sm text-gray-500">{success}/{count}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
