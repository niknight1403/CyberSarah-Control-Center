import { useState, useEffect } from "react";

export function ConversionDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [tests, setTests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "tests" | "suggestions">("overview");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [statsRes, testsRes, sugRes] = await Promise.all([
        fetch("/api/conversion/stats").then(r => r.json()),
        fetch("/api/conversion/tests").then(r => r.json()),
        fetch("/api/conversion/suggestions").then(r => r.json()),
      ]);
      setStats(statsRes);
      setTests(testsRes.tests ?? []);
      setSuggestions(sugRes.vorschlaege ?? []);
    } catch (err) {
      console.error("Conversion: Fehler beim Laden", err);
    } finally {
      setLoading(false);
    }
  }

  function TabBtn({ active, onClick, children }: any) {
    return (
      <button onClick={onClick} style={{
        padding: "8px 20px", borderRadius: "8px",
        border: active ? "2px solid #f59e0b" : "1px solid #333",
        background: active ? "rgba(245,158,11,0.15)" : "transparent",
        color: active ? "#f59e0b" : "#94a3b8",
        cursor: "pointer", fontSize: "14px", fontWeight: active ? "600" : "400",
      }}>
        {children}
      </button>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>
        <div style={{ fontSize: "24px", marginBottom: "12px" }}>🧪</div>
        Lade A/B-Testing Engine...
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", color: "#e2e8f0", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            🧪 AI Conversion Optimization
          </h1>
          <p style={{ color: "#94a3b8", margin: "4px 0 0 0", fontSize: "14px" }}>
            Automatische A/B-Tests + statistische Signifikanz + Auto-Apply
          </p>
        </div>
        <button onClick={loadData} style={{
          padding: "10px 20px", borderRadius: "8px",
          border: "1px solid #f59e0b", background: "rgba(245,158,11,0.1)",
          color: "#f59e0b", cursor: "pointer", fontSize: "14px",
        }}>
          🔄 Neu laden
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>📊 Übersicht</TabBtn>
        <TabBtn active={tab === "tests"} onClick={() => setTab("tests")}>🧪 Tests ({tests.length})</TabBtn>
        <TabBtn active={tab === "suggestions"} onClick={() => setTab("suggestions")}>💡 Vorschläge ({suggestions.length})</TabBtn>
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <KPI icon="🧪" title="Aktive Tests" value={String(stats?.aktiveTests ?? 0)} />
            <KPI icon="✅" title="Abgeschlossen" value={String(stats?.abgeschlosseneTests ?? 0)} />
            <KPI icon="📈" title="∅ Verbesserung" value={stats?.durchschnittlicheVerbesserung ?? "0%"} color="#10B981" />
            <KPI icon="🏆" title="Gewinner A/B" value={`${stats?.gewinnerA ?? 0} / ${stats?.gewinnerB ?? 0}`} />
            <KPI icon="💡" title="Offene Vorschläge" value={String(stats?.offeneVorschlaege ?? 0)} />
          </div>

          {/* Tests nach Typ */}
          <div style={{
            background: "rgba(255,255,255,0.03)", borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.08)", padding: "20px", marginBottom: "24px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#f59e0b" }}>📊 Tests nach Typ</h3>
            {stats?.testsNachTyp?.length > 0 ? (
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {stats.testsNachTyp.map((t: any) => (
                  <div key={t.typ} style={{
                    padding: "12px 24px", borderRadius: "8px",
                    background: "rgba(245,158,11,0.1)", textAlign: "center",
                    minWidth: "120px",
                  }}>
                    <div style={{ fontSize: "24px", fontWeight: "bold", color: "#f59e0b" }}>{String(t.count)}</div>
                    <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                      {testTypLabel(t.typ)}-Tests
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>Noch keine Tests vorhanden.</p>
            )}
          </div>

          {/* Aktive Tests Liste */}
          <div style={{
            background: "rgba(255,255,255,0.03)", borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.08)", padding: "20px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#f59e0b" }}>⚡ Aktive Tests</h3>
            {tests.filter((t: any) => t.status === "aktiv").length > 0 ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {tests.filter((t: any) => t.status === "aktiv").map((t: any) => (
                  <div key={t.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", background: "rgba(255,255,255,0.02)",
                    borderRadius: "8px", border: "1px solid rgba(245,158,11,0.2)",
                  }}>
                    <div>
                      <div style={{ fontWeight: "500" }}>{t.name}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {testTypLabel(t.testTyp)} | {t.kanal} | Auto-Apply: {t.autoApply ? "✅" : "❌"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={badgeStyle("aktiv")}>Aktiv</span>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        {t.gestartetAm ? new Date(t.gestartetAm).toLocaleDateString("de-DE") : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b" }}>Keine aktiven Tests. Der Agent erstellt automatisch neue.</p>
            )}
          </div>
        </>
      )}

      {tab === "tests" && (
        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)", padding: "20px",
        }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#f59e0b" }}>🧪 Alle A/B-Tests</h3>
          {tests.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Name</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Typ</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Kanal</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Status</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Gewinner</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Verbesserung</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Auto-Apply</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Variante A</th>
                    <th style={{ padding: "8px 12px", textAlign: "left" }}>Variante B</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: "500" }}>{t.name}</td>
                      <td style={{ padding: "8px 12px" }}>{testTypLabel(t.testTyp)}</td>
                      <td style={{ padding: "8px 12px" }}>{t.kanal}</td>
                      <td style={{ padding: "8px 12px" }}><span style={badgeStyle(t.status)}>{statusLabel(t.status)}</span></td>
                      <td style={{ padding: "8px 12px", color: t.gewinner === "a" ? "#a78bfa" : t.gewinner === "b" ? "#f59e0b" : "#64748b" }}>
                        {t.gewinner ? `Variante ${t.gewinner.toUpperCase()}` : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#10B981" }}>
                        {t.verbesserungProzent ? `+${t.verbesserungProzent}%` : "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{t.autoApply ? "✅" : "❌"}</td>
                      <td style={{ padding: "8px 12px", fontSize: "11px", color: "#94a3b8", maxWidth: "150px", overflow: "hidden" }}>
                        {t.varianteAInhalt ? JSON.stringify(t.varianteAInhalt).slice(0, 50) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: "11px", color: "#94a3b8", maxWidth: "150px", overflow: "hidden" }}>
                        {t.varianteBInhalt ? JSON.stringify(t.varianteBInhalt).slice(0, 50) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Keine Tests vorhanden.</p>
          )}
        </div>
      )}

      {tab === "suggestions" && (
        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.08)", padding: "20px",
        }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", color: "#f59e0b" }}>💡 KI-Optimierungsvorschläge</h3>
          {suggestions.length > 0 ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {suggestions.map((s: any) => (
                <div key={s.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px", background: "rgba(255,255,255,0.02)",
                  borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={priorityBadge(s.prioritaet)}>Prio {s.prioritaet}</span>
                      <span style={{ fontWeight: "500" }}>{s.ziel}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {s.aktuellerWert} → <span style={{ color: "#10B981" }}>{s.vorgeschlagenerWert}</span>
                      {" | "}Erwartet: {s.erwarteteVerbesserung}
                    </div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{s.begruendung}</div>
                  </div>
                  <span style={badgeStyle(s.status)}>{suggestionStatusLabel(s.status)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748b" }}>Keine Vorschläge vorhanden.</p>
          )}
        </div>
      )}
    </div>
  );
}

function KPI({ icon, title, value, color }: any) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.08)", padding: "20px",
    }}>
      <div style={{ fontSize: "28px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "28px", fontWeight: "bold", color: color ?? "#f59e0b" }}>{value}</div>
    </div>
  );
}

function testTypLabel(typ: string): string {
  const labels: Record<string, string> = {
    price: "Preis", headline: "Headline", cta: "CTA",
    content: "Content", landingpage: "Landingpage",
    email_subject: "E-Mail Betreff", email_body: "E-Mail Body",
    button_color: "Button Farbe",
  };
  return labels[typ] ?? typ;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    entwurf: "Entwurf", aktiv: "Aktiv", pausiert: "Pausiert",
    abgeschlossen: "Abgeschlossen", abgebrochen: "Abgebrochen",
  };
  return labels[status] ?? status;
}

function suggestionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    offen: "Offen", in_test: "Im Test", umgesetzt: "Umgesetzt", abgelehnt: "Abgelehnt",
  };
  return labels[status] ?? status;
}

function badgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    aktiv: { bg: "rgba(16,185,129,0.15)", color: "#10B981" },
    entwurf: { bg: "rgba(100,116,139,0.15)", color: "#64748b" },
    pausiert: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    abgeschlossen: { bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
    abgebrochen: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
    offen: { bg: "rgba(96,165,250,0.15)", color: "#60a5fa" },
    in_test: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
    umgesetzt: { bg: "rgba(16,185,129,0.15)", color: "#10B981" },
    abgelehnt: { bg: "rgba(100,116,139,0.15)", color: "#64748b" },
  };
  const c = colors[status] ?? { bg: "rgba(100,116,139,0.1)", color: "#94a3b8" };
  return { padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "500", background: c.bg, color: c.color };
}

function priorityBadge(prio: number): React.CSSProperties {
  const color = prio >= 8 ? "#ef4444" : prio >= 5 ? "#f59e0b" : "#64748b";
  const bg = prio >= 8 ? "rgba(239,68,68,0.15)" : prio >= 5 ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)";
  return { padding: "2px 8px", borderRadius: "8px", fontSize: "10px", fontWeight: "600", background: bg, color };
}
