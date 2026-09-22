/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOCIAL MEDIA CLIENT (TikTok + Instagram + YouTube)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Einheitliche API für alle Social-Media-Plattformen:
 *  - TikTok: Content Posting API v2
 *  - Instagram: Meta Graph API (Business-Account)
 *  - YouTube: YouTube Data API v3 + Resumable Upload
 *
 * Konfiguration (.env):
 *   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_ACCESS_TOKEN
 *   INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { logger } from "./logger";

// ─── Typen ───────────────────────────────────────────────────────────────────

export type SocialPlatform = "tiktok" | "instagram" | "youtube";

export interface SocialPostResult {
  platform: SocialPlatform;
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

export interface PlatformConfig {
  name: SocialPlatform;
  displayName: string;
  icon: string;
  connected: boolean;
  postingLimit: number; // Posts per day
  bestTimes: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// KONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY ?? "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET ?? "";
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN ?? "";
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? "";
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID ?? "";
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET ?? "";
const YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN ?? "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? "";

// ═══════════════════════════════════════════════════════════════════════════════
// PLATTFORM-STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export function getPlatformConfigs(): PlatformConfig[] {
  return [
    {
      name: "tiktok",
      displayName: "TikTok",
      icon: "🎵",
      connected: !!TIKTOK_CLIENT_KEY && !!TIKTOK_ACCESS_TOKEN,
      postingLimit: 3,
      bestTimes: ["07:00", "11:00", "15:00", "20:00"],
    },
    {
      name: "instagram",
      displayName: "Instagram",
      icon: "📸",
      connected: !!INSTAGRAM_ACCESS_TOKEN && !!INSTAGRAM_BUSINESS_ACCOUNT_ID,
      postingLimit: 3,
      bestTimes: ["07:30", "12:00", "18:00", "21:00"],
    },
    {
      name: "youtube",
      displayName: "YouTube",
      icon: "🎬",
      connected: !!(YOUTUBE_API_KEY || (YOUTUBE_CLIENT_ID && YOUTUBE_REFRESH_TOKEN)),
      postingLimit: 1,
      bestTimes: ["10:00", "16:00"],
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIKTOK — Content Posting API v2
// ═══════════════════════════════════════════════════════════════════════════════

async function postToTikTok(
  caption: string,
  videoUrl?: string,
  imageUrl?: string,
): Promise<SocialPostResult> {
  if (!TIKTOK_ACCESS_TOKEN) {
    return { platform: "tiktok", success: false, error: "TikTok nicht authentifiziert. Setze TIKTOK_ACCESS_TOKEN" };
  }

  try {
    if (videoUrl) {
      // Video Upload zuerst
      const uploadResp = await fetch("https://open.tiktokapis.com/v2/video/upload/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "pull",
          video_url: videoUrl,
          post_info: {
            title: caption.slice(0, 220),
            privacy_level: "PUBLIC_TO_EVERYONE",
          },
        }),
      });

      const uploadData = await uploadResp.json();
      if (!uploadResp.ok) {
        return { platform: "tiktok", success: false, error: `Upload-Fehler: ${uploadData?.error?.message ?? uploadResp.status}` };
      }

      return {
        platform: "tiktok",
        success: true,
        postId: uploadData?.data?.publish_id,
        url: `https://www.tiktok.com/@${uploadData?.data?.creator_username ?? "me"}/video/${uploadData?.data?.publish_id}`,
      };
    }

    // Text-only Post (für Updates/Ankündigungen)
    const textResp = await fetch("https://open.tiktokapis.com/v2/post/publish/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post_mode: "direct",
        text: caption.slice(0, 220),
        privacy_level: "PUBLIC_TO_EVERYONE",
      }),
    });

    const textData = await textResp.json();
    if (!textResp.ok) {
      return { platform: "tiktok", success: false, error: `Text-Post-Fehler: ${textData?.error?.message ?? textResp.status}` };
    }

    return { platform: "tiktok", success: true, postId: textData?.data?.publish_id };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { platform: "tiktok", success: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM — Meta Graph API
// ═══════════════════════════════════════════════════════════════════════════════

async function postToInstagram(
  caption: string,
  imageUrl?: string,
): Promise<SocialPostResult> {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return { platform: "instagram", success: false, error: "Instagram nicht konfiguriert. Setze INSTAGRAM_ACCESS_TOKEN + BUSINESS_ACCOUNT_ID" };
  }

  try {
    const apiVersion = "v22.0";
    const baseUrl = `https://graph.facebook.com/${apiVersion}/${INSTAGRAM_BUSINESS_ACCOUNT_ID}`;

    if (imageUrl) {
      // Step 1: Media Container erstellen
      const containerResp = await fetch(`${baseUrl}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: caption.slice(0, 2200),
          access_token: INSTAGRAM_ACCESS_TOKEN,
        }),
      });

      const containerData = await containerResp.json();
      if (!containerResp.ok) {
        return { platform: "instagram", success: false, error: `Container-Fehler: ${containerData?.error?.message ?? containerResp.status}` };
      }

      const creationId = containerData.id;
      if (!creationId) {
        return { platform: "instagram", success: false, error: "Keine Container-ID erhalten" };
      }

      // Step 2: Auf Status prüfen (kurz warten bis verarbeitet)
      await new Promise(r => setTimeout(r, 3000));

      // Step 3: Veröffentlichen
      const publishResp = await fetch(`${baseUrl}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: INSTAGRAM_ACCESS_TOKEN,
        }),
      });

      const publishData = await publishResp.json();
      if (!publishResp.ok) {
        return { platform: "instagram", success: false, error: `Publish-Fehler: ${publishData?.error?.message ?? publishResp.status}` };
      }

      return {
        platform: "instagram",
        success: true,
        postId: publishData.id,
        url: `https://www.instagram.com/p/${publishData.id}/`,
      };
    }

    // Carousel / Reel / Story — noch nicht implementiert
    return { platform: "instagram", success: false, error: "Nur Bild-Posts werden unterstützt (keine Reels/Stories)" };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { platform: "instagram", success: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE — Data API v3 + Resumable Upload
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshYouTubeToken(): Promise<string | null> {
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) return null;

  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: YOUTUBE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      logger.warn({ error: data?.error }, "YouTube Token-Refresh fehlgeschlagen");
      return YOUTUBE_API_KEY || null;
    }
    return data.access_token;
  } catch {
    return YOUTUBE_API_KEY || null;
  }
}

async function postToYouTube(
  title: string,
  description: string,
  videoUrl?: string,
): Promise<SocialPostResult> {
  const token = await refreshYouTubeToken();
  if (!token) {
    return { platform: "youtube", success: false, error: "YouTube nicht authentifiziert. Setze YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN" };
  }

  try {
    if (!videoUrl) {
      // Shorts/Community-Post — nur Text, kein Video-Upload nötig
      return { platform: "youtube", success: false, error: "YouTube erfordert Video-Upload. Stelle videoUrl bereit." };
    }

    // Video-Quelldaten laden
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) {
      return { platform: "youtube", success: false, error: `Video konnte nicht geladen werden: ${videoResp.status}` };
    }
    const videoBuffer = await videoResp.arrayBuffer();
    const videoSize = videoBuffer.byteLength;

    // Step 1: Resumable Upload Session starten
    const metadata = JSON.stringify({
      snippet: {
        title: title.slice(0, 100),
        description: description.slice(0, 5000),
        tags: ["KI", "Business", "Automation", "CyberSarah", "AI"],
        categoryId: "28", // Science & Technology
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    });

    const sessionResp = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Length": String(videoSize),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: metadata,
    });

    if (!sessionResp.ok) {
      const errText = await sessionResp.text();
      return { platform: "youtube", success: false, error: `Upload-Session-Fehler: ${errText.slice(0, 200)}` };
    }

    const uploadUrl = sessionResp.headers.get("Location");
    if (!uploadUrl) {
      return { platform: "youtube", success: false, error: "Keine Upload-URL erhalten" };
    }

    // Step 2: Video-Daten hochladen
    const uploadResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(videoSize),
        "Content-Type": "video/mp4",
      },
      body: videoBuffer,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      return { platform: "youtube", success: false, error: `Video-Upload-Fehler: ${errText.slice(0, 200)}` };
    }

    const videoId = await uploadResp.json().then(d => d?.id).catch(() => null);

    return {
      platform: "youtube",
      success: true,
      postId: videoId ?? "uploaded",
      url: videoId ? `https://youtube.com/watch?v=${videoId}` : undefined,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    return { platform: "youtube", success: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL POST-FUNKTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function postToSocialMedia(params: {
  platform: SocialPlatform;
  caption: string;
  videoUrl?: string;
  imageUrl?: string;
  title?: string;
}): Promise<SocialPostResult> {
  logger.info(
    { platform: params.platform, captionLength: params.caption.length },
    `📱 Poste zu ${params.platform}...`
  );

  switch (params.platform) {
    case "tiktok":
      return postToTikTok(params.caption, params.videoUrl, params.imageUrl);
    case "instagram":
      return postToInstagram(params.caption, params.imageUrl);
    case "youtube":
      return postToYouTube(
        params.title ?? params.caption.slice(0, 100),
        params.caption,
        params.videoUrl,
      );
    default:
      return { platform: params.platform, success: false, error: `Unbekannte Plattform: ${params.platform}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OAuth-URLs (für manuelle Ersteinrichtung)
// ═══════════════════════════════════════════════════════════════════════════════

export function getOAuthUrls(): Record<SocialPlatform, string> {
  const redirectUri = `${process.env.PUBLIC_APP_URL ?? "https://cybersarah.ai"}/api/social/oauth/callback`;

  return {
    tiktok: TIKTOK_CLIENT_KEY
      ? `https://www.tiktok.com/v2/auth/authorize?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic,video.publish&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`
      : "",
    instagram: INSTAGRAM_ACCESS_TOKEN
      ? `https://www.facebook.com/v22.0/dialog/oauth?client_id=${process.env.FACEBOOK_APP_ID ?? ""}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,pages_read_engagement`
      : "",
    youtube: YOUTUBE_CLIENT_ID
      ? `https://accounts.google.com/o/oauth2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=https://www.googleapis.com/auth/youtube.upload&response_type=code&access_type=offline&prompt=consent`
      : "",
  };
}
