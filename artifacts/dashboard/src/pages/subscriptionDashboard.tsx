// preact import removed - using automatic JSX
import { useState, useEffect } from "react";

export function SubscriptionDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "subs" | "plans">("overview");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [sRes, subRes] = await Promise.all([
        fetch("/api/subscriptions/stats").then(r => r.json()),
        fetch("/api/subscriptions").then(r => r.json()),
      ]);
      setStats(sRes);
      setSubscriptions(subRes.subscriptions ?? []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const STATUS_COLORS: Record<string, string> = {
    aktiv: "#22c55e", pausiert: "#f59e0b", ausstehend: "#3b82f6",
    fehlgeschlagen: "#ef4444", gekuendigt: "#666", abgelaufen: "#444"
  };

  const INTERVALL_LABELS: Record<string, string> = {
    month: "/Monat", year: "/Jahr", week: "/Woche"
  };

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>📊 Übersicht</TabBtn>
        <TabBtn active={tab === "subs"} onClick={() => setTab("subs")}>👥 Abos ({subscriptions.length})</TabBtn>
        <TabBtn active={tab === "plans"} onClick={() => setTab("plans")}>📋 Pläne</TabBtn>
        <button onClick={loadData} style={{
          padding: "8px 18px", borderRadius: 10, border: "1px solid #333",
          background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 14,
        }}>🔄 Neu laden</button>
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#666"}}>Lade...</div> :
        tab === "overview" ? (
          <div>
            {/* MRR-Karten */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
              <BigStatCard label="Monatlich (MRR)" value={`€${stats?.totalMRR ?? "0"}`} sub={`${stats?.monatlichSubs ?? 0} monatlich + ${stats?.jaehrlichSubs ?? 0} jährlich`} color="#22c55e" />
              <BigStatCard label="Jährlich (ARR)" value={`€${stats?.totalARR ?? "0"}`} sub="Projected annual revenue" color="#7c3aed" />
              <BigStatCard label="Abos gesamt" value={stats?.abosGesamt ?? 0} sub={`${stats?.bezahlteRechnungen ?? 0} Rechnungen bezahlt`} color="#f59e0b" />
            </div>

            {/* Status-Verteilung */}
            {stats?.statusVerteilung && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {Object.entries(stats.statusVerteilung).map(([status, count]) => (
                  <div key={status} style={{
                    padding: "6px 14px", borderRadius: 20,
                    background: `${STATUS_COLORS[status] ?? "#666"}22`,
                    border: `1px solid ${STATUS_COLORS[status] ?? "#666"}44`,
                    color: STATUS_COLORS[status] ?? "#fff",
                    fontSize: 13, fontWeight: 600,
                  }}>{status}: {count as number}</div>
                ))}
              </div>
            )}

            {/* Pläne */}
            <h3 style={{ color: "#fff", margin: "20px 0 12px", fontSize: 16 }}>📋 Abo-Pläne</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {(stats?.plans ?? []).map((p: any) => (
                <div key={p.id} style={{
                  background: p.populär ? "linear-gradient(135deg, #1e1b4b, #2e1065)" : "#1a1a2e",
                  borderRadius: 16, padding: 20,
                  border: p.populär ? "2px solid #7c3aed" : "1px solid #222",
                  position: "relative",
                }}>
                  {p.populär && <div style={{
                    position: "absolute", top: -10, right: 16,
                    background: "#7c3aed", color: "#fff", padding: "2px 12px",
                    borderRadius: 10, fontSize: 11, fontWeight: 700,
                  }}>POPULÄR</div>}
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                  <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ color: "#fff", fontSize: 32, fontWeight: 700 }}>€{p.preis}</span>
                    <span style={{ color: "#888", fontSize: 14 }}>{INTERVALL_LABELS[p.intervall] ?? `/${p.intervall}`}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "subs" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {subscriptions.map((s: any) => (
              <div key={s.id} style={{
                background: "#1a1a2e", borderRadius: 12, padding: "12px 16px",
                borderLeft: `4px solid ${STATUS_COLORS[s.status] ?? "#666"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ color: "#fff" }}>{s.kundenEmail}</strong>
                      <SubStatusBadge status={s.status} />
                    </div>
                    <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                      {s.plan?.name ?? "Unbekannter Plan"} · €{s.plan?.preis ?? "?"}{INTERVALL_LABELS[s.plan?.intervall ?? ""] ?? ""}
                      {s.aktuellerPeriodEnde && <> · Nächste Zahlung: {new Date(s.aktuellerPeriodEnde).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 13, color: "#666" }}>
                    {s.stripeSubscriptionId ? "✅ Stripe" : "📝 Manuell"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              {(stats?.plans ?? []).map((p: any) => (
                <div key={p.id} style={{
                  background: p.populär ? "linear-gradient(135deg, #1e1b4b, #2e1065)" : "#1a1a2e",
                  borderRadius: 16, padding: 24,
                  border: p.populär ? "2px solid #7c3aed" : "1px solid #222",
                }}>
                  {p.populär && <div style={{ color: "#7c3aed", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>📌 Empfohlen</div>}
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 20 }}>{p.name}</div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ color: "#fff", fontSize: 36, fontWeight: 700 }}>€{p.preis}</span>
                    <span style={{ color: "#888", fontSize: 16 }}>{INTERVALL_LABELS[p.intervall] ?? `/${p.intervall}`}</span>
                  </div>
                  <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>Stripe Preis-ID: {(p.stripePreisId ?? "—").slice(0, 20)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 24px", borderRadius: 12, border: "none",
      background: active ? "#7c3aed" : "#1e1b4b",
      color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 15,
    }}>{children}</button>
  );
}

function BigStatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "#1e1b4b", borderRadius: 16, padding: "20px 24px",
      border: "1px solid rgba(124,58,237,0.2)",
    }}>
      <div style={{ color: "#888", fontSize: 14, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? "#fff", fontSize: 36, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SubStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    aktiv: "#22c55e", pausiert: "#f59e0b", ausstehend: "#3b82f6",
    fehlgeschlagen: "#ef4444", gekuendigt: "#666", abgelaufen: "#444",
  };
  const labels: Record<string, string> = {
    aktiv: "✅ Aktiv", pausiert: "⏸ Pausiert", ausstehend: "⏳ Ausstehend",
    fehlgeschlagen: "❌ Fehlgeschlagen", gekuendigt: "🔴 Gekündigt", abgelaufen: "⚫ Abgelaufen",
  };
  return (
    <span style={{
      background: `${colors[status] ?? "#666"}22`, color: colors[status] ?? "#666",
      padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
    }}>{labels[status] ?? status}</span>
  );
}
