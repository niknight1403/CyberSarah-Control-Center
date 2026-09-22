import { useGetFinanceSummary, useListTransactions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, CreditCard, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Finance() {
  const { data: summary, isLoading: loadingSummary } = useGetFinanceSummary();
  const { data: transactions, isLoading: loadingTx } = useListTransactions({ limit: 50 });

  const formatCurrency = (val?: number | null, _s = Number.isFinite(Number(val)) ? Number(val) : 0) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(_s);

  if (loadingSummary || loadingTx || !summary || !transactions) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full bg-card" />)}
        </div>
        <Skeleton className="h-64 w-full bg-card" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">Finanzen & ROI</h2>
        <p className="text-muted-foreground text-xs md:text-sm">Finanzübersicht und Transaktionshistorie</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Gesamtumsatz</CardTitle>
            <DollarSign className="h-3 w-3 md:h-4 md:w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="finance-umsatz">
              {formatCurrency(summary.gesamtUmsatz)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">ROI</CardTitle>
            <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="finance-roi">
              {summary.roi}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">CAC</CardTitle>
            <Activity className="h-3 w-3 md:h-4 md:w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="finance-cac">
              {formatCurrency(summary.cac)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-1 p-3 md:p-6 md:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Transaktionen</CardTitle>
            <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-primary shrink-0" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-foreground" data-testid="finance-tx-count">
              {summary.transaktionenAnzahl}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Letzte Transaktionen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs pl-4">Datum</TableHead>
                  <TableHead className="text-xs">Quelle</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Typ</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Beschreibung</TableHead>
                  <TableHead className="text-xs text-right pr-4">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-[11px] pl-4 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString('de-DE')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap">{tx.quelle}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary" className="text-[10px]">{tx.typ}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs hidden md:table-cell max-w-[200px] truncate">
                      {tx.beschreibung || "-"}
                    </TableCell>
                    <TableCell className={`text-right font-bold text-sm pr-4 whitespace-nowrap ${tx.betrag > 0 ? 'text-primary' : 'text-destructive'}`}>
                      {tx.betrag > 0 ? '+' : ''}{formatCurrency(tx.betrag)}
                    </TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                      Keine Transaktionen gefunden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
