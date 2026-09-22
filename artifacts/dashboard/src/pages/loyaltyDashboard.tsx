import { Fragment } from "react";
import { useState, useEffect } from "react";

interface Card {
  id: number; kundenEmail: string | null; kundenTelefon: string | null;
  punkte: number; umsatzGesamt: string; transaktionsAnzahl: number;
  stufe: string; geburtsdatum: string | null;
  letzteTransaktion: string | null; createdAt: string;
}

interface Referral {
  id: number; code: string; werberEmail: string | null;
  geworbenerEmail: string | null; geworbenerName: string | null;
  status: string; praemieGewaehrt: boolean; createdAt: string;
}

const STUFEN_META: Record<string, { badge: string; farbe: string; nextPoints: number }> = {
  bronze: { badge: "🟤", farbe: "#cd7f32", nextPoints: 500 },
  silber: { badge: "⚪", farbe: "#c0c0c0", nextPoints: 1500 },
  gold: { badge: "🟡", farbe: "#ffd700", nextPoints: 4000 },
  platin: { badge: "🔵", farbe: "#e5e4e2", nextPoints: 10000 },
  diamant: { badge: "💎", farbe: "#b9f2ff", nextPoints: 999999 },
};

export function LoyaltyDashboard() {
  const [cards, setCards] = useState<Card[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [tab, setTab] = useState<"cards" | "referrals">("cards");
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, rRes, sRes] = await Promise.all([
        fetch("/api/loyalty/cards?limit=100").then(r => r.json()),
        fetch("/api/loyalty/referrals").then(r => r.json()),
        fetch("/api/loyalty/stats").then(r => r.json()),
      ]);
      setCards(cRes.cards ?? []);
      setReferrals(rRes.referrals ?? []);
      setStats(sRes);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function createCard() {
    if (!newEmail) return;
    await fetch("/api/loyalty/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    setNewEmail("");
    loadData();
  }

  async function createReferral() {
    await fetch("/api/loyalty/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    loadData();
  }

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <TabBtn active={tab === "cards"} onClick={() => setTab("cards")}>⭐ Treuekarten</TabBtn>
        <TabBtn active={tab === "referrals"} onClick={() => setTab("referrals")}>👥 Empfehlungen</TabBtn>
        <button onClick={loadData} style={{
          padding: "10px 20px", borderRadius: 12, border: "1px solid #333",
          background: "transparent", color: "#ccc", cursor: "pointer",
        }}>🔄 Neu laden</button>
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#666"}}>Lade...</div> :
        tab === "cards" ? (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatsCard label="Karten gesamt" value={stats?.kartenGesamt ?? 0} />
              <StatsCard label="Neue Karten (30d)" value={stats?.neueKarten ?? 0} color="#22c55e" />
              <StatsCard label="Aktive Punkte" value={formatNum(stats?.aktivePunkte ?? 0)} color="#f59e0b" />
              <StatsCard label="Empfehlungs-Prämien" value={stats?.praemienGewaehrt ?? 0} color="#7c3aed" />
            </div>

            {/* Stufen-Verteilung */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {Object.entries(stats?.stufenVerteilung ?? {}).map(([stufe, count]) => (
                <div key={stufe} style={{
                  padding: "6px 16px", borderRadius: 20,
                  background: `${(STUFEN_META[stufe]?.farbe ?? "#666")}22`,
                  border: `1px solid ${STUFEN_META[stufe]?.farbe ?? "#666"}44`,
                  color: STUFEN_META[stufe]?.farbe ?? "#fff",
                  fontSize: 13, fontWeight: 600,
                }}>
                  {STUFEN_META[stufe]?.badge ?? "•"} {stufe}: {count as number}
                </div>
              ))}
            </div>

            {/* Neue Karte */}
            <div style={{ background: "#1e1b4b", borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
              <input placeholder="Kunden-Email" value={newEmail} onInput={e => setNewEmail((e.target as any).value)}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #333", background: "#0f0d2e", color: "#fff" }} />
              <button onClick={createCard} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer",
              }}>➕ Karte erstellen</button>
            </div>

            {/* Karten-Liste */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cards.map(c => {
                const meta = STUFEN_META[c.stufe] ?? STUFEN_META.bronze;
                const progress = Math.min(c.punkte / meta.nextPoints * 100, 100);
                return (
                  <div key={c.id} style={{
                    background: "#1a1a2e", borderRadius: 12, padding: "12px 16px",
                    borderLeft: `4px solid ${meta.farbe}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>{meta.badge}</span>
                          <strong style={{ color: "#fff" }}>{c.kundenEmail || c.kundenTelefon || "Unbekannt"}</strong>
                          <span style={{
                            background: `${meta.farbe}22`, color: meta.farbe,
                            padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase"
                          }}>{c.stufe}</span>
                        </div>
                        <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                          {c.transaktionsAnzahl} Käufe · {parseFloat(c.umsatzGesamt).toFixed(2)}€ Umsatz
                          {c.letzteTransaktion && ` · Letzter Kauf: ${new Date(c.letzteTransaktion).toLocaleDateString()}`}
                        </div>
                        {/* Punkte-Progression */}
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "#aaa", fontSize: 12, marginBottom: 2 }}>
                            <span>{c.punkte} Punkte</span>
                            {c.stufe !== "diamant" && <span>Nächste Stufe: {meta.nextPoints} Punkte</span>}
                          </div>
                          {c.stufe !== "diamant" && (
                            <div style={{ background: "#111", borderRadius: 10, height: 6, overflow: "hidden" }}>
                              <div style={{ width: `${progress}%`, height: "100%", background: meta.farbe, borderRadius: 10 }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: 120 }}>
                        <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 22 }}>{c.punkte}</div>
                        <div style={{ color: "#666", fontSize: 12 }}>Punkte</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {cards.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Noch keine Treuekarten</div>}
            </div>
          </div>
        ) : (
          <div>
            {/* Referral Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatsCard label="Empfehlungen gesamt" value={stats?.referralsGesamt ?? 0} />
              <StatsCard label="Prämien gewährt" value={stats?.praemienGewaehrt ?? 0} color="#22c55e" />
            </div>

            {/* Neuen Referral-Code erstellen */}
            <div style={{ background: "#1e1b4b", borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ color: "#fff", fontWeight: 600 }}>Neuen Empfehlungs-Code generieren:</span>
              <button onClick={createReferral} style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer",
              }}>🔗 Code erstellen</button>
            </div>

            {/* Referral-Liste */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {referrals.map(r => (
                <div key={r.id} style={{
                  background: "#1a1a2e", borderRadius: 12, padding: "12px 16px",
                  opacity: r.status === "abgelaufen" ? 0.5 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ color: "#fff", fontFamily: "monospace", fontSize: 16 }}>{r.code}</strong>
                        <ReferralStatusBadge status={r.status} />
                        {r.praemieGewaehrt && <span style={{ color: "#22c55e", fontSize: 12 }}>✅ Prämie gewährt</span>}
                      </div>
                      <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                        {r.werberEmail && <>Werber: {r.werberEmail}</>}
                        {r.geworbenerEmail && <> · Geworben: {r.geworbenerEmail}</>}
                        <span style={{ marginLeft: 8 }}>· {new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {referrals.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Noch keine Empfehlungen</div>}
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

function StatsCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
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

function ReferralStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    offen: "#3b82f6", registriert: "#f59e0b",
    erster_kauf: "#22c55e", praemie_gewaehrt: "#7c3aed", abgelaufen: "#ef4444",
  };
  const labels: Record<string, string> = {
    offen: "Offen", registriert: "Registriert",
    erster_kauf: "✅ Kauf", praemie_gewaehrt: "🎉 Prämie", abgelaufen: "Abgelaufen",
  };
  return (
    <span style={{
      background: `${colors[status] ?? "#666"}22`, color: colors[status] ?? "#666",
      padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
    }}>{labels[status] ?? status}</span>
  );
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
