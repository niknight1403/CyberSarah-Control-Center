import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellRing, Smartphone, Globe, Send, RefreshCw, Settings, TestTube, MessageCircle, DollarSign, AlertTriangle, Activity } from "lucide-react";

interface PushStatus {
  konfiguriert: boolean;
  firebase: boolean;
  webpush: boolean;
  aktiveDevices: number;
  devices: Array<{ platform: string; topics: string[]; createdAt: string }>;
  topics: string[];
}

function usePushStatus() {
  return useQuery<PushStatus>({
    queryKey: ["push-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/push/status");
      if (!(res instanceof Response)) return res as PushStatus;
      return res.json() as Promise<PushStatus>;
    },
  });
}

const TOPIC_LABELS: Record<string, string> = {
  umsatz: "💰 Umsatz",
  agent_aktiv: "✅ Agent-Aktiv",
  agent_fehler: "⚠️ Agent-Fehler",
  neue_chance: "🎯 Neue Chance",
  system: "🔧 System",
  warnung: "🚨 Warnung",
};

export default function PushNotifications() {
  const { data: status, isLoading, refetch } = usePushStatus();
  const { toast } = useToast();

  const [showSendDialog, setShowSendDialog] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushTopic, setPushTopic] = useState("");
  const [pushToken, setPushToken] = useState("");

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/push/senden", {
        method: "POST",
        body: JSON.stringify({ title: pushTitle, body: pushBody, topic: pushTopic || undefined, token: pushToken || undefined }),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "✅ Push gesendet", description: data.count > 0 ? `${data.count} Geräte erreicht` : "Keine Geräte" });
      setShowSendDialog(false);
    },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  const sendTestMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/push/test", { method: "POST" });
      if (!(res instanceof Response)) return res;
      return res.json();
    },
    onSuccess: () => toast({ title: "✅ Test-Push gesendet", description: "DEV-Modus: geloggt" }),
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔔 Push-Benachrichtigungen</h1>
          <p className="text-sm text-gray-500 mt-1">
            {status?.konfiguriert ? "Firebase Cloud Messaging aktiv" : "DEV-Modus: Nur Logging"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sendTestMut.mutate()}>
            <TestTube className="w-4 h-4 mr-2" /> Test-Push
          </Button>
          <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="w-4 h-4 mr-2" /> Push senden</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>📨 Push-Benachrichtigung senden</DialogTitle>
              <DialogDescription>An alle oder an spezifisches Device/Token</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-4">
                <div><Label>Titel *</Label>
                  <Input value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="Z.B. Neuer Umsatz!" /></div>
                <div><Label>Nachricht *</Label>
                  <Textarea value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Deine Nachricht..." /></div>
                <div><Label>Topic (optional)</Label>
                  <select className="w-full p-2 border rounded-md" value={pushTopic} onChange={e => setPushTopic(e.target.value)}>
                    <option value="">Alle Geräte</option>
                    {status?.topics.map(t => (
                      <option key={t} value={t}>{TOPIC_LABELS[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div><Label>Token (optional, für einzelnes Gerät)</Label>
                  <Input value={pushToken} onChange={e => setPushToken(e.target.value)} placeholder="Device-Token..." /></div>
                <Button className="w-full" onClick={() => sendMut.mutate()} disabled={!pushTitle || !pushBody}>
                  {sendMut.isPending ? "⏳ Sende..." : "📤 Push senden"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* Status-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <BellRing className="w-6 h-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{status?.aktiveDevices ?? 0}</p>
            <p className="text-xs text-gray-500">Aktive Devices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Smartphone className={`w-6 h-6 mx-auto mb-2 ${status?.firebase ? "text-green-500" : "text-gray-400"}`} />
            <p className={`font-semibold ${status?.firebase ? "text-green-600" : ""}`}>
              {status?.firebase ? "✅ Firebase" : "❌ Nicht verbunden"}
            </p>
            <p className="text-xs text-gray-500">FCM (Android/iOS)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Globe className={`w-6 h-6 mx-auto mb-2 ${status?.webpush ? "text-green-500" : "text-gray-400"}`} />
            <p className={`font-semibold ${status?.webpush ? "text-green-600" : ""}`}>
              {status?.webpush ? "✅ Web-Push" : "❌ Nicht verbunden"}
            </p>
            <p className="text-xs text-gray-500">VAPID (Browser)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className={`w-6 h-6 mx-auto mb-2 ${status?.konfiguriert ? "text-green-500" : "text-yellow-500"}`} />
            <p className={`font-semibold ${status?.konfiguriert ? "text-green-600" : "text-yellow-600"}`}>
              {status?.konfiguriert ? "🟢 Aktiv" : "🟡 DEV-Modus"}
            </p>
            <p className="text-xs text-gray-500">{status?.konfiguriert ? "Produktion" : "Nur Logging"}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="topics">
        <TabsList>
          <TabsTrigger value="topics">📋 Topics ({status?.topics.length ?? 0})</TabsTrigger>
          <TabsTrigger value="devices">📱 Devices ({status?.aktiveDevices ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="topics">
          <Card>
            <CardHeader><CardTitle>📋 Verfügbare Topics</CardTitle>
            <CardDescription>Topics, die Geräte abonnieren können</CardDescription></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {status?.topics.map(topic => (
                  <Card key={topic} className="bg-gray-50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="text-2xl">
                        {topic === "umsatz" ? "💰" : topic === "agent_aktiv" ? "✅" : topic === "agent_fehler" ? "⚠️" : topic === "neue_chance" ? "🎯" : topic === "system" ? "🔧" : "📨"}
                      </div>
                      <div>
                        <p className="font-semibold">{TOPIC_LABELS[topic] ?? topic}</p>
                        <p className="text-xs text-gray-500">/{topic}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <Card>
            <CardHeader><CardTitle>📱 Registrierte Devices</CardTitle>
            <CardDescription>{status?.aktiveDevices ?? 0} aktive Geräte</CardDescription></CardHeader>
            <CardContent>
              {!status?.devices.length ? (
                <div className="text-center py-8 text-gray-400">
                  <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Noch keine Geräte registriert</p>
                  <p className="text-xs mt-2">Geräte registrieren sich automatisch beim App-Start</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left">
                      <th className="p-3 font-medium">Plattform</th>
                      <th className="p-3 font-medium">Topics</th>
                      <th className="p-3 font-medium">Registriert</th>
                    </tr></thead>
                    <tbody>
                      {status.devices.map((d, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="p-3">
                            <Badge variant="outline">
                              {d.platform === "android" ? "📱 Android" : d.platform === "ios" ? "🍎 iOS" : "🌐 Web"}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {d.topics.map(t => (
                                <Badge key={t} variant="secondary" className="text-xs">{TOPIC_LABELS[t] ?? t}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-xs text-gray-500">
                            {new Date(d.createdAt).toLocaleDateString("de-DE")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Konfigurations-Hilfe */}
      <Card>
        <CardHeader><CardTitle className="text-sm">⚙️ Konfiguration</CardTitle></CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p><strong>Firebase Cloud Messaging (Android/iOS):</strong></p>
          <code className="block bg-gray-50 p-2 rounded text-xs">
            FIREBASE_PROJECT_ID=cybersarah-revenue-os<br />
            FIREBASE_CLIENT_EMAIL=firebase-adminsdk@xxx.iam.gserviceaccount.com<br />
            FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
          </code>
          <p className="mt-3"><strong>Web-Push (VAPID) Fallback:</strong></p>
          <code className="block bg-gray-50 p-2 rounded text-xs">
            VAPID_PUBLIC_KEY=...<br />
            VAPID_PRIVATE_KEY=...
          </code>
          <p className="mt-2 text-xs text-gray-400">Ohne Konfiguration läuft der DEV-Modus (Logging ohne echten Versand).</p>
        </CardContent>
      </Card>
    </div>
  );
}
