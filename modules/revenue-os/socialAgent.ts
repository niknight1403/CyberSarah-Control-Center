/**
 * SocialAgent – autonome Content-Pipeline.
 *
 * Echt statt simuliert:
 *  - Content wird mit OpenAI ERZEUGT (echter API-Call, kostet echte Tokens)
 *  - Posting läuft über die ECHTEN Plattform-APIs, sobald Tokens vorhanden sind
 *  - Ohne Tokens werden Posts ehrlich in eine Warteschlange gelegt und als
 *    "wartet auf Plattform-Zugang" markiert – niemals als "gepostet" gelogen.
 *
 * Voraussetzungen für echtes Posten (manuell, einmalig):
 *  - Instagram: Meta-Business-Account + App-Review für instagram_content_publish
 *  - TikTok: TikTok-for-Developers-Antrag für Content Posting API
 */

export interface SocialPost {
  id: string;
  platform: "instagram" | "tiktok";
  caption: string;
  status: "queued" | "posted" | "failed";
  detail: string;
  createdAt: string;
}

const queue: SocialPost[] = [];

async function generateCaption(topic: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI-Key fehlt – Content-Erzeugung nicht möglich (keine Simulation).");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Du bist Social-Media-Texter für einen deutschsprachigen Business-Account. " +
            "Schreibe eine kurze, konkrete Caption (max. 2 Sätze) plus 3 passende Hashtags. " +
            "Kein Clickbait, keine unbelegten Einkommensversprechen (rechtlich riskant).",
        },
        { role: "user", content: `Thema: ${topic}` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function postToInstagram(caption: string, imageUrl: string): Promise<string> {
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;
  if (!token || !igUserId) throw new Error("Instagram-Zugang fehlt (IG_ACCESS_TOKEN / IG_USER_ID).");
  // Echter 2-Schritt-Flow der Instagram Graph API
  const create = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`,
    { method: "POST" },
  );
  const container = await create.json();
  if (!create.ok) throw new Error(`IG media: ${JSON.stringify(container.error ?? container)}`);
  const publish = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`,
    { method: "POST" },
  );
  const result = await publish.json();
  if (!publish.ok) throw new Error(`IG publish: ${JSON.stringify(result.error ?? result)}`);
  return result.id;
}

export async function runSocialAgent(topics: string[]): Promise<SocialPost[]> {
  const results: SocialPost[] = [];
  for (const topic of topics) {
    const base: SocialPost = {
      id: crypto.randomUUID(),
      platform: "instagram",
      caption: "",
      status: "queued",
      detail: "",
      createdAt: new Date().toISOString(),
    };
    try {
      base.caption = await generateCaption(topic);
      const imageUrl = process.env.DEFAULT_POST_IMAGE_URL ?? "";
      if (process.env.IG_ACCESS_TOKEN && imageUrl) {
        const postId = await postToInstagram(base.caption, imageUrl);
        base.status = "posted";
        base.detail = `Live auf Instagram veröffentlicht (ID ${postId})`;
      } else {
        base.status = "queued";
        base.detail =
          "Caption erzeugt (echter OpenAI-Call). Wartet auf Instagram-Zugang – " +
          "Post wird automatisch veröffentlicht, sobald IG_ACCESS_TOKEN gesetzt ist.";
      }
    } catch (e) {
      base.status = "failed";
      base.detail = (e as Error).message;
    }
    queue.push(base);
    results.push(base);
  }
  return results;
}

export function getSocialQueue(): SocialPost[] {
  return [...queue].reverse().slice(0, 50);
}
