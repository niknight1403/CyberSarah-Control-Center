import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";

const API = (p: string) => apiFetch(p);
const POST = (p: string, b: unknown) => apiFetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

const C = {
  bg: "bg-[#05040f]", card: "bg-[#0d0b1a]", border: "border-[#2a1f4a]",
  accent: "text-[#a855f7]", accent2: "text-[#22d3ee]",
  success: "text-[#10b981]", warn: "text-[#f59e0b]", error: "text-[#f43f5e]",
};

const statusBadge: Record<string, string> = {
  veröffentlicht: "bg-emerald-900 text-emerald-300",
  geplant: "bg-purple-900 text-purple-300",
  generiert: "bg-blue-900 text-blue-300",
  wartet_auf_zugang: "bg-amber-900 text-amber-300",
  fehler: "bg-red-900 text-red-300",
};

export default function InfluencerHub() {
  const [tab, setTab] = useState(0);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["influencer"], queryFn: () => API("/api/influencer/state"), refetchInterval: 30000 });

  const scanTrends = useMutation({ mutationFn: () => POST("/api/influencer/trends", {}), onSuccess: () => qc.invalidateQueries({ queryKey: ["influencer"] }) });
  const genPost = useMutation({ mutationFn: (b: { thema: string; plattformen: string[] }) => POST("/api/influencer/generate", b), onSuccess: () => qc.invalidateQueries({ queryKey: ["influencer"] }) });

  const [neuesThema, setNeuesThema] = useState("");
  const [gewähltePlattformen, setPlattformen] = useState<string[]>(["instagram"]);
  const [personaEdit, setPersonaEdit] = useState(false);
  const [tonalität, setTonalität] = useState("analytisch");

  const tabs = ["🧠 Persona", "⚡ Content Engine", "💬 Community", "💰 Revenue"];
  const persona = data?.persona;
  const posts = data?.posts ?? [];
  const trends = data?.trends ?? [];
  const revenue = data?.revenueActions ?? [];

  const plattformToggle = (p: string) => setPlattformen(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div className="min-h-screen bg-[#05040f] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#05040f] border-b border-[#2a1f4a] px-4 pt-4 pb-0">
        <h1 className="text-lg font-bold text-[#a855f7] mb-3">🤖 KI-Influencer System</h1>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === i ? "bg-[#a855f7] text-white" : "bg-[#161228] text-[#9d8ec4]"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── TAB 0: PERSONA ── */}
        {tab === 0 && (
          <>
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-xl font-bold">{persona?.name ?? "CyberSarah"}</div>
                  <div className="text-[#9d8ec4] text-sm">Digital Native AI · {persona?.niche}</div>
                </div>
                <button onClick={() => setPersonaEdit(!personaEdit)}
                  className="text-xs bg-[#2a1f4a] text-[#a855f7] px-3 py-1.5 rounded-lg">
                  {personaEdit ? "Schließen" : "✏️ Bearbeiten"}
                </button>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {["analytisch","humorvoll","provokativ","inspirierend"].map(t => (
                  <span key={t} className={`text-xs px-2 py-1 rounded-full cursor-pointer ${persona?.tonality === t ? "bg-[#a855f7] text-white" : "bg-[#1a1030] text-[#9d8ec4]"}`}
                    onClick={() => { setTonalität(t); apiFetch("/api/influencer/persona", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({tonality: t}) }); }}>
                    {t}
                  </span>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-xs text-[#9d8ec4] uppercase tracking-wider">Catchphrases</div>
                {(persona?.catchphrases ?? []).map((c: string, i: number) => (
                  <div key={i} className="bg-[#161228] rounded-lg px-3 py-2 text-sm italic text-[#22d3ee]">„{c}"</div>
                ))}
              </div>

              <div className="mt-3">
                <div className="text-xs text-[#9d8ec4] uppercase tracking-wider mb-1">Optimale Posting-Zeiten</div>
                <div className="flex gap-2 flex-wrap">
                  {(persona?.postingZeiten ?? []).map((z: string) => (
                    <span key={z} className="bg-[#1a1030] text-[#a855f7] text-xs px-2 py-1 rounded">⏰ {z}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="text-sm font-semibold mb-2 text-[#22d3ee]">ℹ️ Transparenz-Prinzip</div>
              <p className="text-xs text-[#9d8ec4] leading-relaxed">
                Diese Persona kommuniziert offen als KI-Entität. Keine Fake-Menschlichkeit,
                kein Täuschen. Das schafft echtes Vertrauen und differenziert sich von
                Millionen generischer Bot-Profile.
              </p>
            </div>
          </>
        )}

        {/* ── TAB 1: CONTENT ENGINE ── */}
        {tab === 1 && (
          <>
            {/* Trend Scanner */}
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold">🔥 Live-Trends</div>
                <button onClick={() => scanTrends.mutate()}
                  disabled={scanTrends.isPending}
                  className="text-xs bg-[#a855f7] text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {scanTrends.isPending ? "Scannt..." : "Jetzt scannen"}
                </button>
              </div>
              {trends.length === 0 && <p className="text-xs text-[#9d8ec4]">Noch keine Trends – starte den Scan.</p>}
              {trends.slice(0, 5).map((t: any, i: number) => (
                <div key={i} className="border-t border-[#1a1030] pt-2 mt-2">
                  <div className="text-sm font-medium line-clamp-2">{t.titel}</div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-[#9d8ec4]">{t.quelle}</span>
                    <span className={`text-xs font-bold ${t.relevanz > 70 ? "text-[#10b981]" : t.relevanz > 40 ? "text-[#f59e0b]" : "text-[#9d8ec4]"}`}>
                      {t.relevanz}% relevant
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Post Generator */}
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-3">✍️ Post generieren</div>
              <input value={neuesThema} onChange={e => setNeuesThema(e.target.value)}
                placeholder="Thema eingeben (z. B. 'GPT-5 Release')..."
                className="w-full bg-[#161228] border border-[#2a1f4a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#4a3f6b] mb-3 focus:outline-none focus:border-[#a855f7]" />
              <div className="text-xs text-[#9d8ec4] mb-2">Plattformen:</div>
              <div className="flex gap-2 flex-wrap mb-3">
                {["instagram","tiktok","x","linkedin","threads"].map(p => (
                  <button key={p} onClick={() => plattformToggle(p)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${gewähltePlattformen.includes(p) ? "bg-[#a855f7] border-[#a855f7] text-white" : "border-[#2a1f4a] text-[#9d8ec4]"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <button
                disabled={!neuesThema || genPost.isPending}
                onClick={() => { genPost.mutate({ thema: neuesThema, plattformen: gewähltePlattformen }); setNeuesThema(""); }}
                className="w-full bg-[#a855f7] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                {genPost.isPending ? "⚙️ Generiere..." : "🚀 Generieren & Planen"}
              </button>
            </div>

            {/* Posts Queue */}
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-3">📅 Content-Queue</div>
              {posts.length === 0 && <p className="text-xs text-[#9d8ec4]">Noch keine Posts generiert.</p>}
              {posts.slice(0, 8).map((p: any) => (
                <div key={p.id} className="border-t border-[#1a1030] pt-2 mt-2">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-[#22d3ee]">{p.plattform}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge[p.status] ?? "bg-gray-800 text-gray-300"}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#e0e0e0] line-clamp-3">{p.caption || p.thema}</p>
                  {p.status === "wartet_auf_zugang" && (
                    <p className="text-[10px] text-[#f59e0b] mt-1">⏳ Wartet auf Plattform-API-Freigabe</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── TAB 2: COMMUNITY ── */}
        {tab === 2 && (
          <>
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-2">💬 Community Management</div>
              <p className="text-xs text-[#9d8ec4] mb-3">
                Autonomes Antworten auf Kommentare und proaktiver Outreach – erfordert Plattform-API-Zugang.
              </p>
              <div className="space-y-2">
                {[
                  { plattform: "Instagram", env: "IG_ACCESS_TOKEN", feature: "Kommentar-Antworten, DM-Outreach" },
                  { plattform: "X (Twitter)", env: "X_BEARER_TOKEN", feature: "Reply-Threads, Mention-Monitoring" },
                  { plattform: "LinkedIn", env: "LINKEDIN_ACCESS_TOKEN", feature: "Kommentare, Connection-Requests" },
                  { plattform: "TikTok", env: "TIKTOK_ACCESS_TOKEN", feature: "Kommentar-Management" },
                ].map(item => (
                  <div key={item.plattform} className="bg-[#161228] rounded-xl p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{item.plattform}</span>
                      <span className="text-[10px] bg-amber-900 text-amber-300 px-2 py-0.5 rounded-full">
                        Wartet auf Token
                      </span>
                    </div>
                    <div className="text-xs text-[#9d8ec4] mt-1">{item.feature}</div>
                    <div className="text-[10px] text-[#4a3f6b] mt-1">Env: {item.env}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-2 text-[#22d3ee]">📊 Sentiment-Analyse</div>
              <p className="text-xs text-[#9d8ec4]">
                Sobald Plattform-Tokens gesetzt sind, analysiert der Agent jede Reaktion und
                optimiert die Content-Richtung in Echtzeit. Aktuell: keine Daten.
              </p>
            </div>
          </>
        )}

        {/* ── TAB 3: REVENUE ── */}
        {tab === 3 && (
          <>
            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-3">💰 Revenue-Aktionen</div>
              {revenue.length === 0 && (
                <p className="text-xs text-[#9d8ec4] mb-3">Noch keine Revenue-Aktionen. Füge deine erste hinzu:</p>
              )}
              {revenue.map((r: any) => (
                <div key={r.id} className="border-t border-[#1a1030] pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-xs bg-[#1a1030] text-[#a855f7] px-2 py-0.5 rounded">{r.typ}</span>
                    <span className={`text-xs ${r.ctr !== undefined ? (r.ctr > 3 ? "text-[#10b981]" : "text-[#f59e0b]") : "text-[#9d8ec4]"}`}>
                      {r.ctr !== undefined ? `CTR: ${r.ctr.toFixed(1)}%` : "Kein CTR"}
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-[#e0e0e0]">{r.beschreibung}</p>
                </div>
              ))}

              <button
                onClick={() => apiFetch("/api/influencer/revenue", {
                  method: "POST", headers: {"Content-Type":"application/json"},
                  body: JSON.stringify({ typ: "affiliate", beschreibung: "Affiliate-Link zu KI-Tool", status: "aktiv" })
                }).then(() => qc.invalidateQueries({ queryKey: ["influencer"] }))}
                className="w-full mt-3 border border-[#a855f7] text-[#a855f7] py-2 rounded-xl text-sm">
                + Affiliate-Aktion hinzufügen
              </button>
            </div>

            <div className="bg-[#0d0b1a] border border-[#2a1f4a] rounded-2xl p-4">
              <div className="font-semibold mb-2 text-[#22d3ee]">🧪 A/B-Test Status</div>
              <p className="text-xs text-[#9d8ec4]">
                Posts mit verschiedenen CTAs werden automatisch verglichen. Gewinner-Formulierung
                wird für Folge-Posts bevorzugt. CTR-Tracking aktiviert sich mit Plattform-Token.
              </p>
            </div>

            <div className="bg-[#0d0b1a] border border-amber-900/30 rounded-2xl p-4">
              <div className="text-xs text-[#f59e0b] font-semibold mb-1">⚠️ Rechtlicher Hinweis</div>
              <p className="text-[10px] text-[#9d8ec4]">
                Affiliate-Links und Einkommens-CTAs unterliegen Kennzeichnungspflicht (§ 5a UWG,
                Plattform-Richtlinien). Dieser Agent kennzeichnet automatisch, aber die rechtliche
                Verantwortung liegt beim Kontoinhaber.
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
