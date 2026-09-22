import { useListCampaigns, useCreateCampaign, useUpdateCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, MousePointerClick, Target, DollarSign, Plus } from "lucide-react";

export default function Campaigns() {
  const { data: campaigns, isLoading } = useListCampaigns();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    marke: "CyberSarah" as "CyberSarah" | "GeldPilot AI" | "UnternehmerGPT",
    typ: "affiliate" as "affiliate" | "eigenesProdukt",
    netzwerk: "Digistore24" as any,
    affiliateLink: "",
    provision: ""
  });

  const formatCurrency = (val?: number | null, _s = Number.isFinite(Number(val)) ? Number(val) : 0) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(_s);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(
      { data: { ...formData, provision: Number(formData.provision) || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: "Kampagne erstellt", description: "Die Kampagne wurde erfolgreich angelegt." });
          setIsOpen(false);
          setFormData({ name: "", marke: "CyberSarah", typ: "affiliate", netzwerk: "Digistore24", affiliateLink: "", provision: "" });
        }
      }
    );
  };

  const handleStatusChange = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "aktiv" ? "pausiert" : "aktiv";
    updateCampaign.mutate(
      { id, data: { status: newStatus as "aktiv" | "pausiert" | "abgeschlossen" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: "Status aktualisiert" });
        }
      }
    );
  };

  if (isLoading || !campaigns) {
    return (
      <div className="space-y-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-40 w-full bg-card" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">Kampagnen</h2>
          <p className="text-muted-foreground text-xs md:text-sm">Übersicht aller laufenden Promotionen</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0" data-testid="btn-new-campaign">
              <Plus className="h-4 w-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Neue </span>Kampagne
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm mx-4 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Neue Kampagne anlegen</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  data-testid="input-campaign-name"
                  placeholder="Kampagnenname..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Marke</Label>
                  <Select value={formData.marke} onValueChange={v => setFormData({...formData, marke: v as typeof formData.marke})}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CyberSarah">CyberSarah</SelectItem>
                      <SelectItem value="GeldPilot AI">GeldPilot AI</SelectItem>
                      <SelectItem value="UnternehmerGPT">UnternehmerGPT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Typ</Label>
                  <Select value={formData.typ} onValueChange={v => setFormData({...formData, typ: v as typeof formData.typ})}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                      <SelectItem value="eigenesProdukt">Eigenes Produkt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="link">Affiliate Link</Label>
                <Input
                  id="link"
                  value={formData.affiliateLink}
                  onChange={e => setFormData({...formData, affiliateLink: e.target.value})}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provision">Provision (%)</Label>
                <Input
                  id="provision"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.provision}
                  onChange={e => setFormData({...formData, provision: e.target.value})}
                  placeholder="z.B. 30"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createCampaign.isPending}>
                {createCampaign.isPending ? "Speichern..." : "Kampagne speichern"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="bg-card border-border">
            <CardContent className="p-4 md:p-6">
              <div className="flex justify-between items-start mb-3 gap-3">
                <div className="min-w-0">
                  <h3 className="text-base md:text-lg font-bold truncate">{campaign.name}</h3>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Badge variant="outline" className="text-[10px]">{campaign.marke}</Badge>
                    <Badge variant="outline" className="text-[10px]">{campaign.typ}</Badge>
                    <Badge
                      variant={campaign.status === 'aktiv' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => handleStatusChange(campaign.id, campaign.status)}
                >
                  {campaign.status === 'aktiv' ? 'Pause' : 'Start'}
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
                    <MousePointerClick className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Klicks</p>
                    <p className="font-bold text-sm">{campaign.klicks}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
                    <Target className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Konversionen</p>
                    <p className="font-bold text-sm">{campaign.konversionen}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
                    <DollarSign className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Umsatz</p>
                    <p className="font-bold text-sm">{formatCurrency(campaign.umsatz)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded text-primary shrink-0">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Conv. Rate</p>
                    <p className="font-bold text-sm">
                      {campaign.klicks > 0
                        ? ((campaign.konversionen / campaign.klicks) * 100).toFixed(1)
                        : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {campaigns.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Noch keine Kampagnen — erstelle deine erste.
          </div>
        )}
      </div>
    </div>
  );
}
