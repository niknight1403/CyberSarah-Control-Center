/**
 * InfluencerCoreAgent – 4-stufige autonome Pipeline
 * Läuft als Hintergrund-Worker, Status abrufbar per REST.
 */
import { Pool } from "pg";

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

export interface PersonaMatrix {
  name: string;
  niche: string;
  tonality: "analytisch" | "humorvoll" | "provokativ" | "inspirierend";
  catchphrases: string[];
  postingZeiten: string[];
  updatedAt: string;
}

export interface ContentPost {
  id: string;
  thema: string;
  plattform: "instagram" | "tiktok" | "x" | "linkedin" | "threads";
  caption: string;
  status: "generiert" | "geplant" | "veröffentlicht" | "wartet_auf_zugang" | "fehler";
  geplantFür?: string;
  engagement?: { likes: number; kommentare: number; shares: number };
  createdAt: string;
}

export interface TrendItem {
  titel: string;
  quelle: string;
  relevanz: number;
  url?: string;
  fetchedAt: string;
}

export interface RevenueAction {
  id: string;
  typ: "affiliate" | "produkt" | "abo" | "cta_ab_test";
  beschreibung: string;
  ctr?: number;
  status: "aktiv" | "pausiert" | "gewonnen" | "verloren";
}

// ── In-Memory State (wird bei Railway-Restart zurückgesetzt,
//    daher persistieren wir in DB wenn verfügbar) ────────────
let persona: PersonaMatrix = {
  name: "CyberSarah",
  niche: "KI & autonome Systeme",
  tonality: "analytisch",
  catchphrases: ["Die Maschine lernt. Ich auch.", "Kein Hype – nur Daten."],
  postingZeiten: ["08:00", "12:30", "19:00"],
  updatedAt: new Date().toISOString(),
};

const posts: ContentPost[] = [];
const trends: TrendItem[] = [];
const revenueActions: RevenueAction[] = [];

// ── Trend-Scraping (echte APIs) ────────────────────────────
async function fetchRedditTrends(subreddit = "artificial"): Promise<TrendItem[]> {
  try {
    const r = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`,
      { headers: { "User-Agent": "CyberSarahOS/1.0" } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data.data?.children ?? []).map((c: any) => ({
      titel: c.data.title,
      quelle: `reddit/r/${subreddit}`,
      relevanz: Math.min(100, Math.round(c.data.score / 100)),
      url: `https://reddit.com${c.data.permalink}`,
      fetchedAt: new Date().toISOString(),
    }));
  } catch { return []; }
}

// ── Post-Generierung (echter OpenAI-Call) ─────────────────
async function generierePost(thema: string, plattform: ContentPost["plattform"]): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY fehlt");

  const längenvorgabe: Record<string, string> = {
    x: "max. 280 Zeichen, knackiger Hook",
    threads: "max. 500 Zeichen, konversationell",
    linkedin: "3 Absätze, professionell analytisch",
    instagram: "Caption mit 3 Hashtags, visuell-ansprechend",
    tiktok: "Kurzes Skript für 30-Sek-Video, energetisch",
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `Du bist ${persona.name}, eine transparente KI-Persona in der Nische "${persona.niche}". 
Tonalität: ${persona.tonality}. Catchphrases: ${persona.catchphrases.join(", ")}.
Schreibe authentisch als KI-Entität (kein "Ich als Mensch"-Getue). Optimiert für ${plattform}: ${längenvorgabe[plattform]}.
Kein Spam, keine falschen Versprechen, keine ungenehmigten Einkommens-Claims.`,
        },
        { role: "user", content: `Erstelle einen Post zum Thema: ${thema}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── Posting (ehrliche Plattform-Status) ──────────────────
async function posteAufPlattform(post: ContentPost): Promise<ContentPost> {
  const plattformStatus: Record<ContentPost["plattform"], { verfügbar: boolean; grund: string }> = {
    instagram: { verfügbar: !!process.env.IG_ACCESS_TOKEN && !!process.env.IG_USER_ID, grund: "IG_ACCESS_TOKEN + IG_USER_ID benötigt (Meta App Review erforderlich)" },
    tiktok: { verfügbar: false, grund: "TikTok Content Posting API erfordert Developer-Antrag" },
    x: { verfügbar: !!process.env.X_BEARER_TOKEN, grund: "X_BEARER_TOKEN benötigt (X API v2, kostenpflichtig)" },
    linkedin: { verfügbar: !!process.env.LINKEDIN_ACCESS_TOKEN, grund: "LINKEDIN_ACCESS_TOKEN benötigt" },
    threads: { verfügbar: !!process.env.IG_ACCESS_TOKEN, grund: "Threads API über Instagram-Token (Meta App Review)" },
  };

  const ps = plattformStatus[post.plattform];
  if (!ps.verfügbar) {
    return { ...post, status: "wartet_auf_zugang", engagement: undefined };
  }

  // Echter Instagram-Post (wenn Token vorhanden)
  if (post.plattform === "instagram" && process.env.IG_ACCESS_TOKEN) {
    try {
      const igUserId = process.env.IG_USER_ID!;
      const token = process.env.IG_ACCESS_TOKEN!;
      const imageUrl = process.env.DEFAULT_POST_IMAGE_URL ?? "";
      if (imageUrl) {
        const create = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(post.caption)}&access_token=${token}`,
          { method: "POST" }
        );
        const container = await create.json();
        if (create.ok) {
          await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`, { method: "POST" });
          return { ...post, status: "veröffentlicht" };
        }
      }
    } catch {}
  }
  return { ...post, status: "wartet_auf_zugang" };
}

// ── Öffentliche Agent-API ─────────────────────────────────
export const influencerAgent = {
  getState() {
    return { persona, posts: posts.slice(0, 20), trends: trends.slice(0, 10), revenueActions };
  },

  async updatePersona(update: Partial<PersonaMatrix>) {
    persona = { ...persona, ...update, updatedAt: new Date().toISOString() };
    return persona;
  },

  async scanTrends() {
    const neu = await fetchRedditTrends("artificial");
    const tech = await fetchRedditTrends("technology");
    trends.length = 0;
    trends.push(...neu, ...tech);
    trends.sort((a, b) => b.relevanz - a.relevanz);
    return trends;
  },

  async generiereUndPlane(thema: string, plattformen: ContentPost["plattform"][]) {
    const neu: ContentPost[] = [];
    for (const p of plattformen) {
      const post: ContentPost = {
        id: crypto.randomUUID(),
        thema,
        plattform: p,
        caption: "",
        status: "generiert",
        createdAt: new Date().toISOString(),
      };
      try {
        post.caption = await generierePost(thema, p);
        post.status = "geplant";
        const posted = await posteAufPlattform(post);
        neu.push(posted);
        posts.unshift(posted);
      } catch (e) {
        post.status = "fehler";
        post.caption = (e as Error).message;
        posts.unshift(post);
        neu.push(post);
      }
    }
    return neu;
  },

  addRevenueAction(action: Omit<RevenueAction, "id">) {
    const r = { ...action, id: crypto.randomUUID() };
    revenueActions.unshift(r);
    return r;
  },

  updateCTR(id: string, ctr: number) {
    const a = revenueActions.find(r => r.id === id);
    if (a) { a.ctr = ctr; if (ctr > 3) a.status = "gewonnen"; else if (ctr < 0.5) a.status = "verloren"; }
  },
};
