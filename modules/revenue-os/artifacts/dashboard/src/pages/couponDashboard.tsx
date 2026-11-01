import { Fragment } from "react";
import { useState, useEffect } from "react";

interface Coupon {
  id: number;
  code: string;
  typ: "prozent" | "fix";
  wert: string;
  mindestbestellwert: string;
  maxUses: number;
  uses: number;
  aktiv: boolean;
  kiGeneriert: boolean;
  kiBegruendung: string | null;
  startDatum: string;
  endDatum: string | null;
  erstelltVon: string;
  createdAt: string;
}

interface AbandonedCart {
  id: number;
  kundenEmail: string | null;
  kundenTelefon: string | null;
  kundenName: string | null;
  gesamtbetrag: string;
  status: string;
  quelle: string;
  produkte: string;
  createdAt: string;
}

export function CouponDashboard() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [cartStats, setCartStats] = useState<any>(null);
  const [newCode, setNewCode] = useState("");
  const [newTyp, setNewTyp] = useState<"prozent" | "fix">("prozent");
  const [newWert, setNewWert] = useState("10");
  const [newMax, setNewMax] = useState("100");
  const [newLaufzeit, setNewLaufzeit] = useState("72");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"coupons" | "carts">("coupons");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cRes, sRes, cartRes, csRes] = await Promise.all([
        fetch("/api/coupons/alle").then(r => r.json()),
        fetch("/api/coupons/statistik").then(r => r.json()),
        fetch("/api/cart-recovery?limit=20").then(r => r.json()),
        fetch("/api/cart-recovery/stats").then(r => r.json()),
      ]);
      setCoupons(cRes.coupons ?? []);
      setStats(sRes);
      setCarts(cartRes.carts ?? []);
      setCartStats(csRes);
    } catch (err) {
      console.error("Fehler beim Laden:", err);
    }
    setLoading(false);
  }

  async function createCoupon() {
    if (!newCode || !newWert) return;
    try {
      await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          typ: newTyp,
          wert: parseFloat(newWert),
          maxUses: parseInt(newMax) || 0,
          laufzeitStunden: parseInt(newLaufzeit) || 72,
        }),
      });
      setNewCode("");
      loadData();
    } catch (err) {
      console.error("Fehler:", err);
    }
  }

  async function deactivateCoupon(id: number) {
    await fetch(`/api/coupons/${id}`, { method: "DELETE" });
    loadData();
  }

  return (
    <div style={{ padding: "20px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => setTab("coupons")}
          style={{
            padding: "10px 24px", borderRadius: 12, border: "none",
            background: tab === "coupons" ? "#7c3aed" : "#1e1b4b",
            color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 15,
          }}
        >🎫 Coupons & Rabatte</button>
        <button
          onClick={() => setTab("carts")}
          style={{
            padding: "10px 24px", borderRadius: 12, border: "none",
            background: tab === "carts" ? "#7c3aed" : "#1e1b4b",
            color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 15,
          }}
        >🛒 Cart Recovery</button>
        <button onClick={loadData} style={{
          padding: "10px 20px", borderRadius: 12, border: "1px solid #333",
          background: "transparent", color: "#ccc", cursor: "pointer",
        }}>🔄 Neu laden</button>
      </div>

      {loading ? <div style={{textAlign:"center",padding:40,color:"#666"}}>Lade Daten...</div> :
        tab === "coupons" ? (
          <div>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Gesamt Coupons" value={stats?.gesamtCoupons ?? 0} />
              <StatCard label="Aktiv" value={stats?.aktiv ?? 0} color="#22c55e" />
              <StatCard label="Gesamt Nutzungen" value={stats?.gesamtNutzungen ?? 0} />
              <StatCard label="KI-generiert" value={stats?.kiCoupons ?? 0} color="#7c3aed" />
            </div>

            {/* Neuer Coupon */}
            <div style={{ background: "#1e1b4b", borderRadius: 16, padding: 20, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 16px", color: "#fff", fontSize: 16 }}>➕ Neuen Coupon erstellen</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Input placeholder="CODE" value={newCode} onChange={setNewCode} style={{width:120}} />
                <select value={newTyp} onChange={e => setNewTyp((e.target as any).value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #333", background: "#0f0d2e", color: "#fff" }}>
                  <option value="prozent">% Rabatt</option>
                  <option value="fix">€ Fix</option>
                </select>
                <Input placeholder="Wert" value={newWert} onChange={setNewWert} style={{width:80}} type="number" />
                <Input placeholder="Max Uses (0=unl.)" value={newMax} onChange={setNewMax} style={{width:100}} type="number" />
                <Input placeholder="Laufzeit (h)" value={newLaufzeit} onChange={setNewLaufzeit} style={{width:80}} type="number" />
                <button onClick={createCoupon} style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: "#7c3aed", color: "#fff", cursor: "pointer", fontWeight: 600,
                }}>Erstellen</button>
              </div>
            </div>

            {/* Coupon-Liste */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {coupons.map(c => (
                <div key={c.id} style={{
                  background: c.aktiv ? "#1a1a2e" : "#111",
                  borderRadius: 12, padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 16,
                  opacity: c.aktiv ? 1 : 0.5,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ color: "#fff", fontSize: 18, fontFamily: "monospace" }}>{c.code}</strong>
                      {c.kiGeneriert && <span style={{ background:"#7c3aed22", color:"#a78bfa", padding:"2px 8px", borderRadius:6, fontSize:11 }}>KI</span>}
                      {c.erstelltVon === "agent" && <span style={{ background:"#22c55e22", color:"#4ade80", padding:"2px 8px", borderRadius:6, fontSize:11 }}>🤖 AUTO</span>}
                    </div>
                    <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                      {c.typ === "prozent" ? `${c.wert}% Rabatt` : `${c.wert}€ Rabatt`}
                      {parseFloat(c.mindestbestellwert) > 0 && ` ab ${c.mindestbestellwert}€`}
                      {c.endDatum && ` · gültig bis ${new Date(c.endDatum).toLocaleDateString()}`}
                      {c.kiBegruendung && ` · ${c.kiBegruendung}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 80 }}>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{c.uses}/{c.maxUses || "∞"}</div>
                    <div style={{ color: "#666", fontSize: 12 }}>Nutzungen</div>
                  </div>
                  {c.aktiv && (
                    <button onClick={() => deactivateCoupon(c.id)} style={{
                      padding: "6px 12px", borderRadius: 8, border: "none",
                      background: "#dc262644", color: "#f87171", cursor: "pointer", fontSize: 12,
                    }}>Deaktivieren</button>
                  )}
                </div>
              ))}
              {coupons.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Keine Coupons vorhanden</div>}
            </div>
          </div>
        ) : (
          <div>
            {/* Cart Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <StatCard label="Abgebrochene Käufe" value={cartStats?.gesamt ?? 0} />
              <StatCard label="Wiederhergestellt" value={cartStats?.wiederhergestellt ?? 0} color="#22c55e" />
              <StatCard label="Recovery-Rate" value={cartStats?.recoveryRate ?? "0%"} />
              <StatCard label="Geretteter Umsatz" value={cartStats?.wiederhergestellterUmsatz ?? "0€"} color="#7c3aed" />
            </div>

            {/* Cart-Liste */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {carts.map(c => {
                let produkte: any[] = [];
                try { produkte = JSON.parse(c.produkte); } catch {}
                return (
                  <div key={c.id} style={{
                    background: "#1a1a2e", borderRadius: 12, padding: "12px 16px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 600 }}>
                          {c.kundenName || c.kundenEmail || c.kundenTelefon || "Unbekannt"}
                        </div>
                        <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                          {produkte.map(p => `${p.name} (${p.menge}x ${p.preis.toFixed(2)}€)`).join(", ")}
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <StatusBadge status={c.status} />
                          <span style={{ color: "#666", fontSize: 12 }}>{c.quelle} · {new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 18 }}>
                          {parseFloat(c.gesamtbetrag).toFixed(2)}€
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {carts.length === 0 && <div style={{textAlign:"center",padding:40,color:"#666"}}>Keine abgebrochenen Käufe</div>}
            </div>
          </div>
        )}
    </div>
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

function Input({ placeholder, value, onChange, style, type }: any) {
  return (
    <input
      type={type ?? "text"}
      placeholder={placeholder}
      value={value}
      onInput={e => onChange((e.target as any).value)}
      style={{
        padding: "8px 12px", borderRadius: 8, border: "1px solid #333",
        background: "#0f0d2e", color: "#fff", fontSize: 14, ...style,
      }}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "neu": "#3b82f6",
    "erinnert_1": "#f59e0b",
    "erinnert_2": "#f97316",
    "coupon_gesendet": "#7c3aed",
    "wiederhergestellt": "#22c55e",
    "verloren": "#ef4444",
  };
  const labels: Record<string, string> = {
    "neu": "Neu",
    "erinnert_1": "1. Erinnerung",
    "erinnert_2": "2. Erinnerung",
    "coupon_gesendet": "Coupon",
    "wiederhergestellt": "✅ Gerettet",
    "verloren": "Verloren",
  };
  return (
    <span style={{
      background: `${colors[status] ?? "#666"}22`,
      color: colors[status] ?? "#666",
      padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
    }}>{labels[status] ?? status}</span>
  );
}
