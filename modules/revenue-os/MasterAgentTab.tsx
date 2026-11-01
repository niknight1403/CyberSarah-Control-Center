/**
 * Master-Agent-Tab (Neon Cyber Design).
 */
import { useEffect, useState, useCallback } from "react";

type KeyStatus = "live" | "test" | "missing" | "invalid";
interface KeyReport { service: string; status: KeyStatus; detail: string }
interface LogEntry { at: string; agent: string; level: "info" | "warn" | "error"; msg: string }
interface Revenue { mode: "live" | "test"; last24hCents: number; last7dCents: number; currency: string; chargeCount7d: number; failed7d: number; note: string }
interface SocialPost { platform: string; caption: string; status: string; detail: string }
interface State { running: boolean; keys: KeyReport[]; revenue: Revenue | null; socialQueue: SocialPost[]; paymentLink: string | null; log: LogEntry[] }

const C = {
  bg: "#050510", card: "rgba(15, 10, 26, 0.7)", border: "rgba(168, 85, 247, 0.2)", text: "#e8e4f5", dim: "#9a92b8",
  purple: "#a855f7", cyan: "#06b6d4", pink: "#f472b6", green: "#34d399", amber: "#fbbf24", red: "#f87171",
};

const statusColor: Record<KeyStatus, string> = { live: C.green, test: C.amber, missing: C.amber, invalid: C.red };
const statusLabel: Record<KeyStatus, string> = { live: "LIVE", test: "TEST", missing: "Fehlt", invalid: "Ungültig" };

export default function MasterAgentTab() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/master-agent");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setS(await r.json()); setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);

  const runNow = async (agent: string) => {
    setBusy(agent);
    try {
      const r = await fetch(`/api/master-agent/run/${agent}`, { method: "POST" });
      if (r.ok) setS(await r.json());
    } finally { setBusy(null); }
  };

  const euro = (cents: number, cur: string) =>
    (cents / 100).toLocaleString("de-DE", { style: "currency", currency: cur.toUpperCase() });

  const card: React.CSSProperties = {
    background: C.card, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 16,
    boxShadow: "0 0 20px rgba(168, 85, 247, 0.1)",
  };
  const btn: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(6,182,212,0.2))",
    border: `1px solid ${C.purple}`, color: C.purple,
    borderRadius: 12, padding: "8px 16px", fontSize: 13, minHeight: 40,
    cursor: "pointer", transition: "all 0.3s ease",
  };

  if (err) return <div style={{ color: C.red, padding: 16, background: C.bg, minHeight: "100vh" }}>Master-Agent nicht erreichbar: {err}</div>;
  if (!s) return <div style={{ color: C.dim, padding: 16, background: C.bg, minHeight: "100vh" }}>Lade Agenten-Status…</div>;

  const liveReady = s.keys.some(k => k.service === "Stripe" && k.status === "live");

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: 16, fontSize: 15 }}>
      <h1 style={{ fontSize: 24, margin: "4px 0 16px", fontWeight: 700 }}>
        <span style={{ 
          background: "linear-gradient(135deg, #a855f7, #06b6d4, #f472b6)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textShadow: "0 0 30px rgba(168,85,247,0.5)"
        }}>
          🧠 Master-Agent
        </span>
      </h1>

      {/* Ehrlichkeits-Banner */}
      <div style={{ ...card, borderColor: liveReady ? C.green : C.amber, boxShadow: liveReady ? "0 0 30px rgba(52,211,153,0.2)" : "0 0 30px rgba(251,191,36,0.2)" }}>
        <strong style={{ color: liveReady ? C.green : C.amber, fontSize: 16 }}>
          {liveReady ? "✅ LIVE-Modus: echte Zahlungen aktiv" : "⚠️ Noch kein echter Umsatz möglich"}
        </strong>
        <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>
          {liveReady
            ? "Stripe ist live geschaltet. Alle Umsatzzahlen unten sind real verbucht."
            : "Es fehlen Live-Zugänge. Die Agenten arbeiten vor und schalten automatisch auf echt um."}
        </div>
      </div>

      {/* Umsatz */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>💰 Finanz-Agent</strong>
          <button style={btn} disabled={busy === "finance"} onClick={() => runNow("finance")}>
            {busy === "finance" ? "⏳ Läuft…" : "Jetzt prüfen"}
          </button>
        </div>
        {s.revenue ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.dim, fontSize: 12 }}>Letzte 24h</div>
                <div style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(135deg, #34d399, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {euro(s.revenue.last24hCents, s.revenue.currency)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.dim, fontSize: 12 }}>7 Tage ({s.revenue.chargeCount7d} Zahlungen)</div>
                <div style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(135deg, #a855f7, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {euro(s.revenue.last7dCents, s.revenue.currency)}
                </div>
              </div>
            </div>
            <div style={{ color: s.revenue.mode === "live" ? C.green : C.amber, fontSize: 12, marginTop: 8, padding: "4px 8px", background: s.revenue.mode === "live" ? "rgba(52,211,153,0.1)" : "rgba(251,191,36,0.1)", borderRadius: 8, display: "inline-block" }}>
              {s.revenue.note}
            </div>
          </div>
        ) : (
          <div style={{ color: C.dim, marginTop: 8 }}>Wartet auf Stripe-Key.</div>
        )}
        {s.paymentLink && (
          <a href={s.paymentLink} style={{ color: C.cyan, fontSize: 13, display: "block", marginTop: 8, wordBreak: "break-all", textDecoration: "underline" }}>
            🔗 Verkaufslink: {s.paymentLink}
          </a>
        )}
      </div>

      {/* Zugänge */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>🔑 Key-Agent</strong>
          <button style={btn} disabled={busy === "keys"} onClick={() => runNow("keys")}>
            {busy === "keys" ? "⏳ Läuft…" : "Jetzt prüfen"}
          </button>
        </div>
        {s.keys.map(k => (
          <div key={k.service} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 500 }}>{k.service}</span>
              <span style={{ color: statusColor[k.status], fontWeight: 600, fontSize: 13, padding: "2px 8px", background: `${statusColor[k.status]}15`, borderRadius: 8 }}>
                {statusLabel[k.status]}
              </span>
            </div>
            <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{k.detail}</div>
          </div>
        ))}
      </div>

      {/* Social */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 16 }}>📣 Social-Agent</strong>
          <button style={btn} disabled={busy === "social"} onClick={() => runNow("social")}>
            {busy === "social" ? "⏳ Läuft…" : "Content erzeugen"}
          </button>
        </div>
        {s.socialQueue.length === 0 && <div style={{ color: C.dim, marginTop: 8 }}>Noch keine Posts erzeugt.</div>}
        {s.socialQueue.slice(0, 5).map((p, i) => (
          <div key={i} style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, color: C.dim }}>{p.platform} · {p.status === "posted" ? "✅ veröffentlicht" : p.status === "failed" ? "❌ Fehler" : "⏳ Warteschlange"}</div>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{p.caption || p.detail}</div>
            {p.caption && <div style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>{p.detail}</div>}
          </div>
        ))}
      </div>

      {/* Log */}
      <div style={card}>
        <strong style={{ fontSize: 16 }}>📋 Protokoll</strong>
        {s.log.slice(0, 12).map((l, i) => (
          <div key={i} style={{ fontSize: 12, marginTop: 8, color: l.level === "error" ? C.red : l.level === "warn" ? C.amber : C.dim, padding: "4px 8px", background: l.level === "error" ? "rgba(248,113,113,0.1)" : l.level === "warn" ? "rgba(251,191,36,0.1)" : "transparent", borderRadius: 6 }}>
            {new Date(l.at).toLocaleTimeString("de-DE")} · {l.agent}: {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
