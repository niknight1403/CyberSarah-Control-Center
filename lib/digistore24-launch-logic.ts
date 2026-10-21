/**
 * CyberSarah Control Center — Landingpage-Deployer & One-Click-Launch (Block 4
 * der SaaS-Transformer-Mission, 2026-10-21).
 *
 * Reine, testbare Logik:
 *   - validateFunnelForLaunch: eine Kampagne wird nur live, wenn Produkt,
 *     Headline, Nutzenversprechen und echter Affiliate-Ziel-Link vorliegen.
 *     Ehrlichkeit statt Optik: fehlt etwas, gibt es einen klaren Grund.
 *   - slugifyLanding: stabile, URL-sichere Slugs (Umlaute transliteriert).
 *   - renderLandingHtml: vollstaendige, responsive Verkaufsseite aus dem
 *     Funnel-Payload — inline CSS, keine externen Assets, mobile-first.
 *     Alles aus dem Payload wird HTML-escaped (kein XSS aus LLM-Texten).
 *     Keine erfundenen Zahlen, Countdowns oder Fake-Reviews.
 */

export type LandingFunnelPayload = {
  headline: string;
  subheadline?: string;
  benefits?: string[];
  ctaText?: string;
  audience?: string;
  keywords?: string[];
  emailSequence?: { subject: string; body: string }[];
};

export type LaunchCheck = { ok: true } | { ok: false; reason: string };

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escaped jeden Text fuer die HTML-Ausgabe (LLM-Texte sind untrusted). */
export function escapeHtml(input: string): string {
  return String(input ?? "").replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch);
}

/** Stabile Slugs: klein, ASCII, Bindestriche, max. 80 Zeichen. */
export function slugifyLanding(title: string): string {
  const map: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue", ß: "ss", á: "a", à: "a", é: "e", è: "e",
  };
  const base = String(title ?? "")
    .toLowerCase()
    .replace(/[äöüßáàéè]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "angebot";
}

/** Prueft, ob eine Kampagne ueberhaupt live gehen darf. */
export function validateFunnelForLaunch(input: {
  productTitle?: string | null;
  affiliateUrl?: string | null;
  funnel?: LandingFunnelPayload | null;
}): LaunchCheck {
  const title = (input.productTitle ?? "").trim();
  if (!title) return { ok: false, reason: "Produktname fehlt." };

  const url = (input.affiliateUrl ?? "").trim();
  if (!url) return { ok: false, reason: "Affiliate-Ziel-Link fehlt — ohne echten Link kein Launch." };
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: "Affiliate-Link muss eine https-URL sein." };

  const funnel = input.funnel;
  if (!funnel || !(funnel.headline ?? "").trim()) {
    return { ok: false, reason: "Funnel ohne Headline — Sales-Copy unvollstaendig." };
  }
  const benefits = (funnel.benefits ?? []).filter((b) => (b ?? "").trim().length > 0);
  if (benefits.length === 0) {
    return { ok: false, reason: "Kein Nutzenversprechen (Benefits) im Funnel." };
  }
  return { ok: true };
}

function benefitList(items: string[]): string {
  return items
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("\n        ");
}

/**
 * Rendert die vollstaendige Landingpage. Eigenstaendig, responsiv, schnell
 * (kein externes CSS/JS/Assets) und mit Affiliate-Kennzeichnung im Footer.
 */
export function renderLandingHtml(input: {
  campaignName: string;
  productTitle: string;
  affiliateUrl: string;
  funnel: LandingFunnelPayload;
}): string {
  const headline = escapeHtml(input.funnel.headline);
  const sub = escapeHtml(input.funnel.subheadline ?? "");
  const benefits = (input.funnel.benefits ?? []).filter((b) => (b ?? "").trim());
  const ctaText = escapeHtml((input.funnel.ctaText ?? "").trim() || "Jetzt Zugang sichern");
  const audience = escapeHtml(input.funnel.audience ?? "");
  const url = escapeHtml(input.affiliateUrl);
  const title = escapeHtml(input.productTitle);

  const cta = `<a class="cta" href="${url}" rel="nofollow sponsored noopener" target="_blank">${ctaText}</a>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow">
<title>${headline}</title>
<meta name="description" content="${sub || headline}">
<style>
:root{--ink:#080c16;--card:#111827;--line:#26304a;--txt:#e8ecf7;--mut:#9aa6c2;--acc:#6ee7d7;--acc2:#a996ff}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:radial-gradient(1200px 600px at 15% -10%,#1b1440 0%,transparent 60%),radial-gradient(900px 500px at 95% 40%,#0b3b3a 0%,transparent 55%),var(--ink);color:var(--txt);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:720px;margin:0 auto;padding:28px 20px 64px}
.badge{display:inline-block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc);border:1px solid var(--line);border-radius:999px;padding:6px 12px;margin-bottom:18px}
h1{font-size:clamp(28px,6vw,44px);line-height:1.15;letter-spacing:-.02em;margin-bottom:14px}
.sub{color:var(--mut);font-size:clamp(16px,3.6vw,19px);margin-bottom:22px}
.cta{display:block;text-align:center;background:linear-gradient(135deg,var(--acc2),var(--acc));color:#06121a;font-weight:800;font-size:18px;padding:18px 22px;border-radius:14px;text-decoration:none;margin:26px 0;box-shadow:0 12px 30px -12px rgba(110,231,215,.55)}
.cta:active{transform:translateY(1px)}
.card{background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));border:1px solid var(--line);border-radius:16px;padding:20px 18px;margin:18px 0}
ul{list-style:none}
li{padding:10px 0 10px 30px;position:relative;border-bottom:1px dashed rgba(255,255,255,.07)}
li:last-child{border-bottom:none}
li:before{content:"✓";position:absolute;left:0;color:var(--acc);font-weight:800}
.kicker{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:26px 0 8px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);color:var(--mut);font-size:13px}
footer a{color:var(--mut)}
</style>
</head>
<body>
<main class="wrap">
  <span class="badge">${escapeHtml(input.campaignName)}</span>
  <h1>${headline}</h1>
  ${sub ? `<p class="sub">${sub}</p>` : ""}
  ${cta}
  ${benefits.length ? `<div class="card"><ul>
        ${benefitList(benefits)}
      </ul></div>` : ""}
  ${audience ? `<p class="kicker">Für wen</p><p>${audience}</p>` : ""}
  ${cta}
  <footer>
    <p>${title} — Affiliate-Empfehlung. Beim Kauf über diesen Link erhalten wir eine Provision; der Preis für dich bleibt unverändert.</p>
    <p style="margin-top:8px">Betrieben von CyberSarah Control Center. Keine Erfolgsgarantie — Ergebnisse hängen vom individuellen Einsatz ab.</p>
  </footer>
</main>
</body>
</html>`;
}
