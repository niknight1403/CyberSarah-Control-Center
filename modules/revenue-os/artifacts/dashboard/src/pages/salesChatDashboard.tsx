// preact import removed - using automatic JSX
import { useState, useEffect } from "react";

export function SalesChatDashboard() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, lRes, sRes] = await Promise.all([
        fetch("/api/chat/conversations?limit=50").then(r => r.json()),
        fetch("/api/chat/leads").then(r => r.json()),
        fetch("/api/chat/stats").then(r => r.json()),
      ]);
      setConversations(cRes.conversations ?? []);
      setLeads(lRes.leads ?? []);
      setStats(sRes);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function loadConversation(sessionId: string) {
    const res = await fetch(`/api/chat/conversations/${sessionId}`).then(r => r.json());
    setSelectedConv(res.conversation);
    let msgs: any[] = [];
    try { msgs = typeof res.nachrichten === "string" ? JSON.parse(res.nachrichten) : (res.nachrichten ?? []); } catch { msgs = []; }
    setMessages(msgs);
  }

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 22 }}>🤖 AI Sales Chat</h2>
        <button onClick={loadData} style={{
          padding: "8px 18px", borderRadius: 10, border: "1px solid #333",
          background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 14,
        }}>🔄 Neu laden</button>
        <span style={{ color: "#666", fontSize: 13, marginLeft: "auto" }}>
          Widget-Code: <code style={{ color: "#7c3aed", background: "#1e1b4b", padding: "2px 8px", borderRadius: 4 }}>
            &lt;script src="/api/chat/widget.js"&gt;&lt;/script&gt;
          </code>
        </span>
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#666"}}>Lade...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Stats */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <StatCard label="Gespräche (30d)" value={stats?.gespraecheGesamt ?? 0} />
              <StatCard label="Heute" value={stats?.heute ?? 0} color="#3b82f6" />
              <StatCard label="Verkäufe" value={stats?.konvertiert ?? 0} color="#22c55e" />
              <StatCard label="Umsatz" value={`€${stats?.umsatz ?? "0"}`} color="#f59e0b" />
              <StatCard label="Conversion" value={stats?.konversionsRate ?? "0%"} color="#7c3aed" />
              <StatCard label="Leads" value={stats?.leads ?? 0} />
            </div>
            {/* Stimmungen */}
            {stats?.stimmungen && (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {Object.entries(stats.stimmungen).map(([s, c]) => (
                  <span key={s} style={{
                    padding: "4px 12px", borderRadius: 20, background: "#1e1b4b",
                    color: s === "positiv" ? "#22c55e" : s === "interessiert" ? "#3b82f6" : s === "negativ" ? "#ef4444" : "#888",
                    fontSize: 13, fontWeight: 600,
                  }}>{s}: {c as number}</span>
                ))}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, maxHeight: 500, overflowY: "auto" }}>
            <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 16 }}>💬 Gespräche ({conversations.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {conversations.map(c => (
                <div key={c.id} onClick={() => loadConversation(c.sessionId)} style={{
                  padding: "10px 14px", borderRadius: 10, background: selectedConv?.id === c.id ? "#7c3aed22" : "#0f0d2e",
                  border: "1px solid", borderColor: selectedConv?.id === c.id ? "#7c3aed44" : "transparent",
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>
                      {c.kundenEmail || c.kundenName || c.sessionId.slice(0, 16)}
                    </span>
                    <span style={{ color: c.konvertiert ? "#22c55e" : "#666", fontSize: 12 }}>
                      {c.konvertiert ? "✅" : new Date(c.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <StimmungsBadge stimmung={c.stimmung} />
                    {c.empfohlenesProdukt && <span style={{ color: "#888", fontSize: 11 }}>{c.empfohlenesProdukt}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Conversation */}
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, maxHeight: 500, overflowY: "auto" }}>
            <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 16 }}>
              {selectedConv ? `💬 ${selectedConv.kundenEmail || selectedConv.sessionId.slice(0, 16)}` : "Wähle ein Gespräch"}
            </h3>
            {selectedConv ? (
              <div>
                {/* Checkout-Link */}
                {selectedConv.checkoutLink && (
                  <div style={{ background: "#22c55e11", borderRadius: 10, padding: "8px 12px", marginBottom: 12, border: "1px solid #22c55e33" }}>
                    <a href={selectedConv.checkoutLink} target="_blank" style={{ color: "#22c55e", fontWeight: 600, textDecoration: "none" }}>
                      🛒 Checkout-Link ↗
                    </a>
                    {selectedConv.couponCode && <span style={{ color: "#f59e0b", marginLeft: 12, fontSize: 13 }}>Coupon: {selectedConv.couponCode}</span>}
                  </div>
                )}
                {/* Messages */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      padding: "8px 12px", borderRadius: 10,
                      background: m.rolle === "customer" ? "#7c3aed" : "#0f0d2e",
                      color: "#ddd", fontSize: 14,
                      alignSelf: m.rolle === "customer" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                    }}>{m.inhalt}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "#444", textAlign: "center", padding: 40 }}>Klicke links auf ein Gespräch</div>
            )}
          </div>

          {/* Leads */}
          <div style={{ gridColumn: "1 / -1" }}>
            <h3 style={{ color: "#fff", margin: "12px 0", fontSize: 16 }}>👤 Qualifizierte Leads ({leads.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leads.map(l => (
                <div key={l.id} style={{ background: "#1a1a2e", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{l.email || "Keine Email"}</span>
                    {l.interesse && <span style={{ color: "#888", marginLeft: 8, fontSize: 13 }}>Interesse: {l.interesse}</span>}
                  </div>
                  <LeadStatusBadge status={l.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: any) {
  return (
    <div style={{ background: "#1e1b4b", borderRadius: 16, padding: "14px 18px", border: "1px solid rgba(124,58,237,0.2)" }}>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? "#fff", fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function StimmungsBadge({ stimmung }: { stimmung: string | null }) {
  const colors: Record<string, string> = { positiv: "#22c55e", interessiert: "#3b82f6", neutral: "#888", negativ: "#ef4444" };
  if (!stimmung) return null;
  return (
    <span style={{ background: `${colors[stimmung] ?? "#666"}22`, color: colors[stimmung] ?? "#666", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
      {stimmung}
    </span>
  );
}

function LeadStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { neu: "#3b82f6", kontaktiert: "#f59e0b", qualifiziert: "#22c55e", abgeschlossen: "#7c3aed" };
  return (
    <span style={{ background: `${colors[status] ?? "#666"}22`, color: colors[status] ?? "#666", padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
      {status}
    </span>
  );
}
