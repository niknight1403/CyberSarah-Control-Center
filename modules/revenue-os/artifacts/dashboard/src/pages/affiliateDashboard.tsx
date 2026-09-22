import { Fragment } from "react";
import { useState, useEffect } from "react";

interface Partner {
  id: number; email: string; name: string | null;
  status: string; stufe: string; provisionProzentsatz: string;
  gesamtUmsatz: string; gesamtProvision: string;
  ausstehendProvision: string; ausgezahltProvision: string;
  klickAnzahl: number; konversionAnzahl: number;
  paypalEmail: string | null; createdAt: string;
}

interface AffiliateLink {
  id: number; code: string; name: string | null;
  zielUrl: string; klickAnzahl: number; konversionAnzahl: number;
  aktiv: boolean;
}

interface Payout {
  id: number; partnerId: number; betrag: string;
  status: string; methode: string | null; createdAt: string;
}

const STUFEN_META: Record<string, string> = {
  bronze: "#cd7f32", silber: "#c0c0c0", gold: "#ffd700", platin: "#e5e4e2"
};

export function AffiliateDashboard() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"partners" | "links" | "payouts">("partners");
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newProvision, setNewProvision] = useState("10");
  const [selectedPartner, setSelectedPartner] = useState<number | null>(null);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState("https://cybersarah.de/");
  const [payouts, setPayouts] = useState<Payout[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [pRes, sRes, payRes] = await Promise.all([
        fetch("/api/affiliates/partners").then(r => r.json()),
        fetch("/api/affiliates/stats").then(r => r.json()),
        fetch("/api/affiliates/payouts").then(r => r.json()),
      ]);
      setPartners(pRes.partners ?? []);
      setStats(sRes);
      setPayouts(payRes.payouts ?? []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function createPartner() {
    if (!newEmail) return;
    await fetch("/api/affiliates/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, name: newName, provisionProzentsatz: newProvision }),
    });
    setNewEmail(""); setNewName("");
    loadData();
  }

  async function loadLinks(partnerId: number) {
    setSelectedPartner(partnerId);
    const res = await fetch(`/api/affiliates/links/${partnerId}`).then(r => r.json());
    setLinks(res.links ?? []);
    setTab("links");
  }

  async function createLink() {
    if (!selectedPartner || !newLinkUrl) return;
    await fetch("/api/affiliates/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId: selectedPartner, zielUrl: newLinkUrl }),
    });
    loadLinks(selectedPartner);
  }

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
        <TabBtn active={tab === "partners"} onClick={() => setTab("partners")}>👥 Partner</TabBtn>
        <TabBtn active={tab === "links"} onClick={() => setTab("links")}>🔗 Tracking-Links</TabBtn>
        <TabBtn active={tab === "payouts"} onClick={() => setTab("payouts")}>💸 Auszahlungen</TabBtn>
        <button onClick={loadData} style={{
          padding: "10px 20px", borderRadius: 12, border: "1px solid #333",
          background: "transparent", color: "#ccc", cursor: "pointer",
        }}>🔄 Neu laden</button>
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#666"}}>Lade...</div> :
        tab === "partners" ? (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Aktive Partner" value={stats?.aktivePartner ?? 0} />
              <StatCard label="Gesamt-Umsatz" value={`€${stats?.gesamtUmsatz ?? "0"}`} color="#22c55e" />
              <StatCard label="Ausstehend" value={`€${stats?.ausstehendProvision ?? "0"}`} color="#f59e0b" />
              <StatCard label="Ausgezahlt" value={`€${stats?.ausgezahltProvision ?? "0"}`} color="#7c3aed" />
              <StatCard label="Conversion-Rate" value={stats?.konversionsRate ?? "0%"} />
            </div>

            {/* Stufen */}
            {stats?.stufenVerteilung && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {Object.entries(stats.stufenVerteilung).map(([stufe, count]) => (
                  <div key={stufe} style={{
                    padding: "4px 14px", borderRadius: 20,
                    background: `${STUFEN_META[stufe] ?? "#666"}22`,
                    border: `1px solid ${STUFEN_META[stufe] ?? "#666"}44`,
                    color: STUFEN_META[stufe] ?? "#fff",
                    fontSize: 13, fontWeight: 600,
                  }}>
                    {stufe}: {count as number}
                  </div>
                ))}
              </div>
            )}

            {/* Neuen Partner */}
            <div style={{ background: "#1e1b4b", borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder="Email" value={newEmail} onInput={e => setNewEmail((e.target as any).value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", background: "#0f0d2e", color: "#fff", width: 220 }} />
              <input placeholder="Name" value={newName} onInput={e => setNewName((e.target as any).value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", background: "#0f0d2e", color: "#fff", width: 180 }} />
              <input placeholder="Provision %" value={newProvision} onInput={e => setNewProvision((e.target as any).value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #333", background: "#0f0d2e", color: "#fff", width: 80 }} />
              <button onClick={createPartner} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer",
              }}>➕ Partner hinzufügen</button>
            </div>

            {/* Partner-Liste */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {partners.map(p => (
                <div key={p.id} style={{
                  background: "#1a1a2e", borderRadius: 12, padding: "12px 16px",
                  borderLeft: `4px solid ${STUFEN_META[p.stufe] ?? "#666"}`,
                  opacity: p.status === "aktiv" ? 1 : 0.5,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ color: "#fff" }}>{p.name || p.email}</strong>
                        <span style={{
                          background: `${STUFEN_META[p.stufe] ?? "#666"}22`,
                          color: STUFEN_META[p.stufe] ?? "#fff",
                          padding: "2px 10px", borderRadius: 10, fontSize: 11,
                          fontWeight: 700, textTransform: "uppercase"
                        }}>{p.stufe}</span>
                        {p.status !== "aktiv" && <span style={{ color: "#ef4444", fontSize: 12 }}>{p.status}</span>}
                      </div>
                      <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                        {p.provisionProzentsatz}% Provision · {p.klickAnzahl} Klicks · {p.konversionAnzahl} Konversionen
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 160 }}>
                      <div style={{ color: "#f59e0b", fontSize: 14 }}>
                        <span style={{ color: "#22c55e" }}>€{parseFloat(p.gesamtUmsatz).toFixed(2)}</span>
                      </div>
                      <div style={{ color: "#888", fontSize: 12 }}>
                        ausstehend: €{parseFloat(p.ausstehendProvision).toFixed(2)}
                      </div>
                      <button onClick={() => loadLinks(p.id)} style={{
                        marginTop: 6, padding: "4px 12px", borderRadius: 6,
                        border: "1px solid #333", background: "transparent",
                        color: "#7c3aed", cursor: "pointer", fontSize: 12,
                      }}>🔗 Links</button>
                    </div>
                  </div>
                </div>
              ))}
              {partners.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Noch keine Partner</div>}
            </div>
          </div>
        ) : tab === "links" ? (
          <div>
            <div style={{ background: "#1e1b4b", borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
              <input placeholder="Ziel-URL" value={newLinkUrl} onInput={e => setNewLinkUrl((e.target as any).value)}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #333", background: "#0f0d2e", color: "#fff" }} />
              <button onClick={createLink} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer",
              }}>🔗 Link erstellen</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {links.map(l => (
                <div key={l.id} style={{ background: "#1a1a2e", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <strong style={{ color: "#fff", fontFamily: "monospace" }}>{l.code}</strong>
                      {l.name && <span style={{ color: "#888", marginLeft: 8 }}>— {l.name}</span>}
                      <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>{l.zielUrl}</div>
                    </div>
                    <div style={{ textAlign: "right", color: "#888", fontSize: 13 }}>
                      {l.klickAnzahl} Klicks · {l.konversionAnzahl} Conv.
                    </div>
                  </div>
                </div>
              ))}
              {links.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Keine Links für diesen Partner</div>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Auszahlungen gesamt" value={stats?.auszahlungen ?? 0} />
              <StatCard label="Ausstehend" value={`€${stats?.ausstehendProvision ?? "0"}`} color="#f59e0b" />
              <StatCard label="Bereits ausgezahlt" value={`€${stats?.ausgezahltProvision ?? "0"}`} color="#22c55e" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {payouts.map(p => {
                const partner = partners.find(pr => pr.id === p.partnerId);
                return (
                  <div key={p.id} style={{ background: "#1a1a2e", borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 600 }}>{partner?.name || partner?.email || `Partner #${p.partnerId}`}</div>
                        <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                          {p.methode} · {new Date(p.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: p.status === "bezahlt" ? "#22c55e" : "#f59e0b", fontWeight: 700, fontSize: 18 }}>
                          €{parseFloat(p.betrag).toFixed(2)}
                        </div>
                        <PayoutBadge status={p.status} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {payouts.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Noch keine Auszahlungen</div>}
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

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      background: "#1e1b4b", borderRadius: 16, padding: "16px 20px",
      border: "1px solid rgba(124,58,237,0.2)",
    }}>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color ?? "#fff", fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function PayoutBadge({ status }: { status: string }) {
  const colors: Record<string, string> = { ausstehend: "#f59e0b", bezahlt: "#22c55e", storniert: "#ef4444" };
  const labels: Record<string, string> = { ausstehend: "Ausstehend", bezahlt: "✅ Bezahlt", storniert: "Storniert" };
  return (
    <span style={{
      background: `${colors[status] ?? "#666"}22`, color: colors[status] ?? "#666",
      padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
    }}>{labels[status] ?? status}</span>
  );
}
