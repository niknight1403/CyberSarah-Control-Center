import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Users, List, Settings, RefreshCw, Plus, Play, CheckCircle, XCircle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailStatus {
  konfiguriert: boolean; provider: string;
  resendKey: boolean; mailgunKey: boolean;
  smtpKonfiguriert: boolean; defaultFrom: string;
}

interface Sequenz {
  id: number; marke: string; name: string; leadMagnet: string;
  emailAnzahl: number; aktiv: boolean; klicks: number;
  produktId?: number; createdAt?: string;
}

interface Lead {
  id: number; email: string; marke: string; quelle?: string;
  status: string; aktuellerSchritt: number;
  letzteEmailAm?: string; createdAt?: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useEmailStatus() {
  return useQuery<EmailStatus>({
    queryKey: ["email-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/email/status");
      if (!(res instanceof Response)) return res as EmailStatus;
      return res.json() as Promise<EmailStatus>;
    },
  });
}

function useSequenzen() {
  return useQuery<Sequenz[]>({
    queryKey: ["email-sequenzen"],
    queryFn: async () => {
      const res = await apiFetch("/api/email/sequenzen");
      if (!(res instanceof Response)) return res as Sequenz[];
      return res.json() as Promise<Sequenz[]>;
    },
    refetchInterval: 30_000,
  });
}

function useLeads() {
  return useQuery<{ leads: Lead[]; gesamt: number; aktiv: number }>({
    queryKey: ["email-leads"],
    queryFn: async () => {
      const res = await apiFetch("/api/email/leads");
      if (!(res instanceof Response)) return res as any;
      return res.json() as Promise<{ leads: Lead[]; gesamt: number; aktiv: number }>;
    },
    refetchInterval: 30_000,
  });
}

export default function EmailAutomation() {
  const { data: status } = useEmailStatus();
  const { data: sequenzen, isLoading: seqLoading, refetch: refetchSeq } = useSequenzen();
  const { data: leadsData, isLoading: leadsLoading, refetch: refetchLeads } = useLeads();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [neueLeadEmail, setNeueLeadEmail] = useState("");
  const [neueLeadMarke, setNeueLeadMarke] = useState("CyberSarah");
  const [showAddLead, setShowAddLead] = useState(false);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [testEmailAddr, setTestEmailAddr] = useState("");

  // Lead hinzufügen
  const addLeadMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/email/leads", {
        method: "POST",
        body: JSON.stringify({ email: neueLeadEmail, marke: neueLeadMarke }),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      setShowAddLead(false); setNeueLeadEmail("");
      toast({ title: "✅ Lead hinzugefügt", description: "Willkommens-E-Mail wird gesendet" });
    },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  // Nurture-Sequenz auslösen
  const triggerNurture = useMutation({
    mutationFn: async (seqId: number) => {
      const res = await apiFetch(`/api/email/sequenzen/${seqId}/nurture`, { method: "POST" });
      if (!(res instanceof Response)) return res;
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "✅ Nurture ausgelöst", description: `${data.gesendet} E-Mails gesendet, ${data.fehler} Fehler` });
      refetchSeq();
      refetchLeads();
    },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  // Test-E-Mail
  const sendTestMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/email/test", {
        method: "POST",
        body: JSON.stringify({ to: testEmailAddr }),
        headers: { "Content-Type": "application/json" },
      });
      if (!(res instanceof Response)) return res;
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "✅ Test-E-Mail gesendet", description: `An ${testEmailAddr}` });
      setShowTestEmail(false);
    },
    onError: (err: Error) => toast({ title: "❌ Fehler", description: err.message, variant: "destructive" }),
  });

  const marken = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📧 E-Mail Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            {status?.konfiguriert
              ? `Verbunden via ${status.provider.toUpperCase()} — ${status.defaultFrom}`
              : "Kein E-Mail-Provider konfiguriert (DEV-Modus: Logging)"}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showTestEmail} onOpenChange={setShowTestEmail}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Send className="w-4 h-4 mr-2" /> Test-E-Mail</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>🧪 Test-E-Mail senden</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Label>E-Mail-Adresse</Label>
                <Input value={testEmailAddr} onChange={e => setTestEmailAddr(e.target.value)} placeholder="test@example.com" />
                <Button className="w-full" onClick={() => sendTestMut.mutate()} disabled={!testEmailAddr}>
                  {sendTestMut.isPending ? "Wird gesendet..." : "📤 Test senden"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={() => { refetchSeq(); refetchLeads(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* Status-Badge */}
      <div className="flex flex-wrap gap-3">
        <Badge variant={status?.konfiguriert ? "default" : "secondary"}>
          {status?.konfiguriert ? `✅ ${status.provider.toUpperCase()}` : "⚠️ Nur Logging"}
        </Badge>
        <Badge variant="outline">Leads: {leadsData?.aktiv ?? 0} aktiv / {leadsData?.gesamt ?? 0} gesamt</Badge>
        <Badge variant="outline">Sequenzen: {sequenzen?.length ?? 0}</Badge>
      </div>

      <Tabs defaultValue="sequenzen">
        <TabsList>
          <TabsTrigger value="sequenzen">📋 Sequenzen ({sequenzen?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="leads">👥 Leads ({leadsData?.aktiv ?? 0})</TabsTrigger>
        </TabsList>

        {/* ─── TAB: SEQUENZEN ─────────────────────────────────── */}
        <TabsContent value="sequenzen" className="space-y-4">
          {seqLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : !sequenzen?.length ? (
            <Card className="p-8 text-center">
              <List className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Keine E-Mail-Sequenzen vorhanden.<br />Der E-Mail-Listen-Agent erstellt sie automatisch.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sequenzen.map(seq => (
                <Card key={seq.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">{seq.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">{seq.marke} · {seq.leadMagnet}</p>
                      </div>
                      <Badge variant={seq.aktiv ? "default" : "secondary"}>{seq.aktiv ? "Aktiv" : "Inaktiv"}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span>📧 {seq.emailAnzahl} E-Mails</span>
                      <span>👁️ {seq.klicks} Klicks</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1"
                        onClick={() => triggerNurture.mutate(seq.id)}
                        disabled={triggerNurture.isPending}>
                        <Play className="w-3 h-3 mr-1" /> Nurture auslösen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── TAB: LEADS ─────────────────────────────────────── */}
        <TabsContent value="leads" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{leadsData?.gesamt ?? 0} Leads insgesamt</p>
            <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Lead hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Neuen Lead anlegen</DialogTitle>
                <DialogDescription>E-Mail-Adresse + Marke wählen. Willkommens-E-Mail wird automatisch gesendet.</DialogDescription></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div><Label>E-Mail *</Label>
                    <Input value={neueLeadEmail} onChange={e => setNeueLeadEmail(e.target.value)} placeholder="max@example.com" /></div>
                  <div><Label>Marke</Label>
                    <Select value={neueLeadMarke} onValueChange={setNeueLeadMarke}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {marken.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={() => addLeadMut.mutate()} disabled={!neueLeadEmail}>
                    {addLeadMut.isPending ? "Wird angelegt..." : "🚀 Lead + Willkommens-Mail"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {leadsLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : !leadsData?.leads.length ? (
            <Card className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Noch keine Leads vorhanden</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left bg-gray-50">
                      <th className="p-3 font-medium">E-Mail</th>
                      <th className="p-3 font-medium">Marke</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Schritt</th>
                      <th className="p-3 font-medium">Letzte E-Mail</th>
                      <th className="p-3 font-medium">Erstellt</th>
                    </tr></thead>
                    <tbody>
                      {leadsData.leads.map(lead => (
                        <tr key={lead.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="p-3 font-medium">{lead.email}</td>
                          <td className="p-3">{lead.marke}</td>
                          <td className="p-3">
                            <Badge variant={lead.status === "aktiv" ? "default" : "secondary"} className="text-xs">
                              {lead.status === "aktiv" ? "✅ Aktiv" : "❌ Abgemeldet"}
                            </Badge>
                          </td>
                          <td className="p-3">{lead.aktuellerSchritt}</td>
                          <td className="p-3 text-xs text-gray-500">
                            {lead.letzteEmailAm ? new Date(lead.letzteEmailAm).toLocaleDateString("de-DE") : "–"}
                          </td>
                          <td className="p-3 text-xs text-gray-500">
                            {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString("de-DE") : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
