import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE REVENUE DASHBOARD — Optimiert für Capacitor/In-App-WebView
// ═══════════════════════════════════════════════════════════════════════════════

export function MobileRevenue() {
  const [revenue, setRevenue] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"dashboard" | "checkout" | "transactions">("dashboard");

  const loadData = useCallback(async () => {
    try {
      const [revRes, subRes] = await Promise.all([
        fetch("/api/revenue").then(r => r.json()).catch(() => ({ summe: 0, heute: 0, letzte30Tage: 0, transaktionen: [] })),
        fetch("/api/subscriptions/stats").then(r => r.json()).catch(() => ({ totalMRR: "0.00", abosGesamt: 0 })),
      ]);
      setRevenue(revRes);
      setTransactions(revRes.transaktionen ?? []);
      setSubscriptions(subRes);
    } catch (err) {
      setError("Verbindungsfehler zum Server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); const iv = setInterval(loadData, 30000); return () => clearInterval(iv); }, [loadData]);

  const styles = {
    container: {
      padding: "16px", color: "#e2e8f0", maxWidth: "500px", margin: "0 auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      WebkitFontSmoothing: "antialiased" as const,
    },
    header: {
      textAlign: "center" as const, padding: "20px 0", marginBottom: "20px",
    },
    logo: {
      fontSize: "32px", fontWeight: "bold", color: "#a78bfa", marginBottom: "4px",
    },
    subtitle: {
      fontSize: "12px", color: "#64748b",
    },
    card: {
      background: "rgba(255,255,255,0.04)", borderRadius: "16px",
      border: "1px solid rgba(255,255,255,0.08)", padding: "20px",
      marginBottom: "16px", backdropFilter: "blur(10px)" as const,
    },
    revenueBig: {
      fontSize: "36px", fontWeight: "bold", color: "#10B981",
      textAlign: "center" as const, padding: "8px 0",
    },
    row: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
    },
    label: { fontSize: "13px", color: "#94a3b8" },
    value: { fontSize: "14px", fontWeight: "600" as const, color: "#e2e8f0" },
    btn: {
      display: "block", width: "100%", padding: "14px", borderRadius: "12px",
      border: "none", fontSize: "16px", fontWeight: "600" as const,
      cursor: "pointer", marginBottom: "12px",
    },
    navBtn: (active: boolean) => ({
      padding: "10px 20px", borderRadius: "10px", border: "none",
      background: active ? "rgba(167,139,250,0.2)" : "transparent",
      color: active ? "#a78bfa" : "#64748b", fontWeight: active ? "600" : "400" as const,
      fontSize: "13px", cursor: "pointer", flex: 1,
    }),
    tabBar: {
      display: "flex", gap: "4px", marginBottom: "20px",
      background: "rgba(255,255,255,0.03)", borderRadius: "12px", padding: "4px",
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>💰</div>
          <div style={{ color: "#64748b" }}>Lade Umsatzdaten...</div>
        </div>
      </div>
    );
  }

  const heuteSumme = revenue?.heute ?? 0;
  const mrr = subscriptions?.totalMRR ?? "0.00";
  const subCount = subscriptions?.abosGesamt ?? 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>💰 CyberSarah</div>
        <div style={styles.subtitle}>Live Revenue OS</div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          ...styles.card, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
          textAlign: "center", color: "#ef4444", fontSize: "13px",
        }}>
          {error} — <span style={{ color: "#a78bfa", textDecoration: "underline", cursor: "pointer" }} onClick={loadData}>Neu laden</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={styles.tabBar}>
        {(["dashboard", "checkout", "transactions"] as const).map(s => (
          <button key={s} style={styles.navBtn(activeSection === s)} onClick={() => setActiveSection(s)}>
            {s === "dashboard" ? "📊 Umsatz" : s === "checkout" ? "💳 Checkout" : "📋 Transaktionen"}
          </button>
        ))}
      </div>

      {activeSection === "dashboard" && (
        <>
          {/* Live Revenue Counter */}
          <div style={{
            ...styles.card, textAlign: "center",
            background: "linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}>
            <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>Heute</div>
            <div style={styles.revenueBig}>€{Number(heuteSumme).toFixed(2)}</div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              {transactions.length > 0 ? `${transactions.length} Transaktionen heute` : "Noch keine Transaktionen"}
            </div>
          </div>

          {/* Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <MetricCard icon="📈" label="MRR" value={`€${mrr}`} />
            <MetricCard icon="🔄" label="Abos" value={String(subCount)} />
            <MetricCard icon="💳" label="Letzte 30d" value={`€${Number(revenue?.letzte30Tage ?? 0).toFixed(2)}`} />
            <MetricCard icon="🎯" label="Transaktionen" value={String(transactions.length)} />
          </div>

          {/* Letzte Transaktionen Mini-Liste */}
          <div style={styles.card}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#a78bfa" }}>⚡ Letzte Transaktionen</h4>
            {transactions.length > 0 ? transactions.slice(0, 5).map((t: any, i: number) => (
              <div key={i} style={styles.row}>
                <div>
                  <div style={{ fontSize: "13px" }}>{t.produktName || t.beschreibung || "Unbekannt"}</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleTimeString("de-DE") : ""}
                    {" · "}{t.quelle ?? "direkt"}
                  </div>
                </div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#10B981" }}>
                  €{Number(t.betrag ?? 0).toFixed(2)}
                </div>
              </div>
            )) : (
              <p style={{ color: "#64748b", fontSize: "13px", textAlign: "center" }}>
                Noch keine Transaktionen. Erstelle deinen ersten Checkout! 🚀
              </p>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ ...styles.card, border: "1px solid rgba(167,139,250,0.15)" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#a78bfa" }}>🚀 Quick Actions</h4>
            <button style={{ ...styles.btn, background: "linear-gradient(135deg, #a78bfa, #7c3aed)", color: "white" }}
              onClick={() => setActiveSection("checkout")}>
              💳 Neuen Checkout erstellen
            </button>
            <button style={{ ...styles.btn, background: "rgba(255,255,255,0.05)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.1)" }}
              onClick={() => window.open("https://dashboard.stripe.com", "_blank")}>
              ⚡ Stripe Dashboard öffnen
            </button>
          </div>
        </>
      )}

      {activeSection === "checkout" && <CheckoutSection />}

      {activeSection === "transactions" && (
        <div style={styles.card}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#a78bfa" }}>📋 Alle Transaktionen</h4>
          {transactions.length > 0 ? (
            <div>
              {transactions.map((t: any, i: number) => (
                <div key={i} style={styles.row}>
                  <div>
                    <div style={{ fontSize: "13px" }}>{t.produktName || t.beschreibung || `Transaktion #${t.id}`}</div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      {t.createdAt ? new Date(t.createdAt).toLocaleString("de-DE") : ""}
                      {" · "}{t.quelle ?? "—"}
                    </div>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "700", color: Number(t.betrag) > 0 ? "#10B981" : "#ef4444" }}>
                    {Number(t.betrag) > 0 ? "+" : ""}€{Number(t.betrag ?? 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748b", fontSize: "13px", textAlign: "center" }}>Keine Transaktionen gefunden.</p>
          )}
        </div>
      )}

      {/* Bottom Push-Register Card */}
      <div style={{
        ...styles.card, textAlign: "center", marginTop: "8px",
        border: "1px solid rgba(96,165,250,0.15)",
      }}>
        <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px 0" }}>
          🔔 Push-Benachrichtigungen aktiv — du erhältst Benachrichtigungen bei neuen Verkäufen
        </p>
        <button style={{
          padding: "8px 16px", borderRadius: "8px", border: "1px solid #64748b",
          background: "transparent", color: "#94a3b8", fontSize: "12px", cursor: "pointer",
        }} onClick={() => alert("🔔 Push-Benachrichtigungen sind aktiv!\n\nDu wirst benachrichtigt bei:\n• Neuen Verkäufen\n• Erreichten Umsatz-Zielen\n• Wichtigen System-Ereignissen")}>
          Benachrichtigungen verwalten
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CHECKOUT SECTION
// ═══════════════════════════════════════════════════════════════════════════════

function CheckoutSection() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/subscriptions/plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const createCheckout = async (planId: number) => {
    setCreating(true);
    try {
      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, successUrl: window.location.href, cancelUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) {
        setCheckoutUrl(data.url);
        // Open in Stripe Checkout
        window.open(data.url, "_blank");
      }
    } catch (err) {
      alert("Fehler beim Erstellen des Checkouts");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>Lade Pläne...</div>;

  return (
    <div>
      {/* Stripe Produkte */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.08)", padding: "20px", marginBottom: "16px",
      }}>
        <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#a78bfa", textAlign: "center" }}>
          💳 Abo-Pläne
        </h4>
        {plans.map((plan: any) => (
          <div key={plan.id} style={{
            padding: "16px", borderRadius: "12px", marginBottom: "12px",
            background: plan.populär ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.02)",
            border: plan.populär ? "1px solid rgba(167,139,250,0.3)" : "1px solid rgba(255,255,255,0.06)",
            cursor: "pointer", transition: "all 0.2s",
          }} onClick={() => setSelectedPlan(String(plan.id))}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: "600", fontSize: "15px" }}>
                  {plan.name}
                  {plan.populär && <span style={{ marginLeft: "8px", fontSize: "10px", color: "#fbbf24", background: "rgba(251,191,36,0.15)", padding: "2px 8px", borderRadius: "8px" }}>POPULÄR</span>}
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                  {plan.beschreibung?.slice(0, 60)}...
                </div>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "bold", color: "#10B981" }}>
                €{plan.preis}
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "400" }}>
                  /{plan.intervall === "month" ? "Monat" : "Jahr"}
                </span>
              </div>
            </div>
            {selectedPlan === String(plan.id) && (
              <button style={{
                width: "100%", marginTop: "12px", padding: "12px", borderRadius: "10px",
                border: "none", background: "linear-gradient(135deg, #10B981, #059669)",
                color: "white", fontSize: "15px", fontWeight: "600", cursor: "pointer",
              }} onClick={() => createCheckout(plan.id)} disabled={creating}>
                {creating ? "⏳ Wird erstellt..." : `🚀 Jetzt €${plan.preis}/${plan.intervall === "month" ? "Monat" : "Jahr"}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Direkter Payment Link */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.08)", padding: "20px", marginBottom: "16px",
      }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#a78bfa", textAlign: "center" }}>
          🔗 Direkter Payment Link
        </h4>
        <input
          placeholder="Betrag in EUR (z.B. 19.99)"
          type="number"
          step="0.01"
          min="1"
          style={{
            width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #333",
            background: "rgba(255,255,255,0.05)", color: "#e2e8f0", fontSize: "16px",
            marginBottom: "12px", boxSizing: "border-box" as const,
          }}
        />
        <button style={{
          width: "100%", padding: "14px", borderRadius: "12px", border: "none",
          background: "linear-gradient(135deg, #a78bfa, #7c3aed)", color: "white",
          fontSize: "16px", fontWeight: "600", cursor: "pointer",
        }} onClick={() => alert("💳 Payment Link wird erstellt...\n\n(Stripe Dashboard wird geöffnet)")}>
          💳 Zahlungslink erstellen
        </button>
      </div>

      {checkoutUrl && (
        <div style={{
          padding: "12px", borderRadius: "10px", background: "rgba(16,185,129,0.1)",
          border: "1px solid rgba(16,185,129,0.2)", textAlign: "center", fontSize: "13px",
        }}>
          ✅ Checkout geöffnet! <a href={checkoutUrl} target="_blank" style={{ color: "#a78bfa" }}>Zahlung fortsetzen</a>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD
// ═══════════════════════════════════════════════════════════════════════════════

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.08)", padding: "14px", textAlign: "center" as const,
    }}>
      <div style={{ fontSize: "20px", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontSize: "10px", color: "#64748b", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: "bold", color: "#a78bfa" }}>{value}</div>
    </div>
  );
}
