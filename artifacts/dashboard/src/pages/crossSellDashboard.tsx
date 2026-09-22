import { useState, useEffect } from "react";

export function CrossSellDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "rules" | "recommendations">("overview");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [statsRes, rulesRes, recRes] = await Promise.all([
        fetch("/api/cross-sell/stats").then(r => r.json()),
        fetch("/api/cross-sell/rules").then(r => r.json()),
        fetch("/api/cross-sell/recommendations").then(r => r.json()),
      ]);
      setStats(statsRes);
      setRules(rulesRes.regeln ?? []);
      setRecommendations(recRes.empfehlungen ?? []);
    } catch (err) {
      console.error("CrossSell: Fehler beim Laden", err);
    } finally {
      setLoading(false);
    }
  }

  function TabBtn({ active, onClick, children }: any) {
    return (
      <button
        onClick={onClick}
        style={{
          padding: "8px 20px",
          borderRadius: "8px",
          border: active ? "2px solid #a78bfa" : "1px solid #333",
          background: active ? "rgba(167,139,250,0.15)" : "transparent",
          color: active ? "#a78bfa" : "#94a3b8",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: active ? "600" : "400",
        }}
      >
        {children}
      </button>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>
        <div style={{ fontSize: "24px", marginBottom: "12px" }}>🔄</div>
        Lade Cross-Sell Engine...
      </div>
    );
  }

  const konversionsRate = stats?.konversionsRate ?? "0.0%";

  return (
    <div style={{ padding: "24px", color: "#e2e8f0", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            🎯 Multi-Channel Cross-Selling
          </h1>
          <p style={{ color: "#94a3b8", margin: "4px 0 0 0", fontSize: "14px" }}>
            KI-generierte personalisierte Produktempfehlungen via E-Mail, Push & In-App
          </p>
        </div>
        <button
          onClick={loadData}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "1px solid #a78bfa",
            background: "rgba(167,139,250,0.1)",
            color: "#a78bfa",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          🔄 Neu laden
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>📊 Übersicht</TabBtn>
        <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>📋 Regeln ({rules.length})</TabBtn>
        <TabBtn active={tab === "recommendations"} onClick={() => setTab("recommendations")}>📨 Empfehlungen ({recommendations.length})</TabBtn>
      </div>

      {tab === "overview" && (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <KPICard icon="📋" title="Aktive Regeln" value={String(stats?.regelnAktiv ?? 0)} subtitle="Cross-Sell Regeln" />
            <KPICard icon="📨" title="Empfehlungen gesendet" value={String(stats?.empfehlungenGesendet ?? 0)} subtitle="Gesamt" />
            <KPICard icon="💰" title="Konvertiert" value={String(stats?.empfehlungenKonvertiert ?? 0)} subtitle="Erfolgreiche Verkäufe" />
            <KPICard icon="📈" title="Konversionsrate" value={konversionsRate} subtitle="Empfehlung → Kauf" color="#10B981" />
          </div>

          {/* Top Regeln */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "20px",
            marginBottom: "24px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#a78bfa" }}>🏆 Top Cross-Sell Regeln</h3>
            {stats?.topRegeln?.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {stats.topRegeln.map((r: any, i: number) => (
                  <div key={r.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px",
                    background: `rgba(167,139,250,${0.05 + (1 - i * 0.15)})`,
                    borderRadius: "8px",
                    border: "1px solid rgba(167,139,250,0.15)",
                  }}>
                    <div>
                      <div style={{ fontWeight: "500" }}>{r.quellProdukt} → {r.zielProdukt}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {r.kategorie} | {r.anzahlEmpfohlen} Empfohlen | {r.anzahlKonvertiert} Konvertiert
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#10B981", fontWeight: "bold" }}>{(Number(r.konversionsRate) * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {r.rabattProzent > 0 ? `${r.rabattProzent}% Rabatt` : "Kein Rabatt"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>Noch keine Cross-Sell-Regeln vorhanden. Der Agent erstellt sie automatisch.</p>
            )}
          </div>

          {/* Status Verteilung */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "20px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#a78bfa" }}>📊 Empfehlungs-Status</h3>
            {stats?.statusVerteilung?.length > 0 ? (
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {stats.statusVerteilung.map((s: any) => (
                  <div key={s.status} style={{
                    padding: "12px 20px",
                    borderRadius: "8px",
                    background: getStatusColor(s.status),
                    minWidth: "120px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: "24px", fontWeight: "bold" }}>{String(s.count)}</div>
                    <div style={{ fontSize: "12px", opacity: 0.8 }}>{statusLabel(s.status)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>Noch keine Empfehlungen gesendet.</p>
            )}
          </div>
        </>
      )}

      {tab === "rules" && (
        <div style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#a78bfa" }}>📋 Alle Cross-Sell Regeln</h3>
          </div>
          {rules.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Quellprodukt</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Zielprodukt</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Kategorie</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Wahrscheinlichkeit</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>CR</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Rabatt</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Empfohlen</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px 12px" }}>{r.quellProdukt}</td>
                      <td style={{ padding: "8px 12px", color: "#a78bfa" }}>{r.zielProdukt}</td>
                      <td style={{ padding: "8px 12px" }}>{r.kategorie}</td>
                      <td style={{ padding: "8px 12px" }}>{(Number(r.wahrscheinlichkeit) * 100).toFixed(0)}%</td>
                      <td style={{ padding: "8px 12px", color: "#10B981" }}>{(Number(r.konversionsRate) * 100).toFixed(1)}%</td>
                      <td style={{ padding: "8px 12px" }}>{r.rabattProzent > 0 ? `${r.rabattProzent}%` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}>{r.anzahlEmpfohlen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Keine Regeln vorhanden. Starte den Cross-Sell Agent.</p>
          )}
        </div>
      )}

      {tab === "recommendations" && (
        <div style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)",
          padding: "20px",
        }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#a78bfa" }}>📨 Letzte Empfehlungen</h3>
          {recommendations.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {recommendations.map((r: any) => (
                <div key={r.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 16px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.05)",
                  fontSize: "13px",
                }}>
                  <div>
                    <span style={{ color: "#94a3b8" }}>{r.kundenEmail}</span>
                    <span style={{ margin: "0 8px", color: "#64748b" }}>→</span>
                    <span style={{ color: "#a78bfa" }}>{r.zielProdukt}</span>
                    <span style={{ marginLeft: "8px", fontSize: "11px", color: "#64748b" }}>
                      (nach {r.quellProdukt})
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={badgeStyle(r.status)}>{statusLabel(r.status)}</span>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>
                      {r.gesendetAm ? new Date(r.gesendetAm).toLocaleDateString("de-DE") : ""}
                      {r.kanal ? ` 📧` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Noch keine Empfehlungen generiert.</p>
          )}
        </div>
      )}
    </div>
  );
}

function KPICard({ icon, title, value, subtitle, color }: any) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.08)",
      padding: "20px",
    }}>
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "28px", fontWeight: "bold", color: color ?? "#a78bfa" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{subtitle}</div>
    </div>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ausstehend: "Ausstehend",
    gesendet: "Gesendet",
    geklickt: "Geklickt",
    konvertiert: "Konvertiert",
    abgelaufen: "Abgelaufen",
  };
  return labels[status] ?? status;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ausstehend: "rgba(251,191,36,0.15)",
    gesendet: "rgba(96,165,250,0.15)",
    geklickt: "rgba(167,139,250,0.15)",
    konvertiert: "rgba(16,185,129,0.15)",
    abgelaufen: "rgba(100,116,139,0.15)",
  };
  return colors[status] ?? "rgba(100,116,139,0.1)";
}

function badgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    ausstehend: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    gesendet: { bg: "rgba(96,165,250,0.15)", color: "#60a5fa" },
    geklickt: { bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
    konvertiert: { bg: "rgba(16,185,129,0.15)", color: "#10B981" },
    abgelaufen: { bg: "rgba(100,116,139,0.15)", color: "#64748b" },
  };
  const c = colors[status] ?? { bg: "rgba(100,116,139,0.1)", color: "#94a3b8" };
  return {
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    fontWeight: "500",
    background: c.bg,
    color: c.color,
  };
}
