import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

// GET /api/store — Product showcase + Stripe checkout
router.get("/store", async (_req: Request, res: Response) => {
  try {
    const stripeUrl = "http://167.233.196.20:3000/api/stripe/products";
    const response = await fetch(stripeUrl);
    const data = await response.json();
    const products = data.products || [];

    const productCards = products.map((p: any) => {
      const price = (p.price?.unitAmount || 0) / 100;
      const buyUrl = p.url || "#";
      const img = p.images?.[0] || "";
      const name = p.name || "Produkt";
      const desc = (p.description || "").substring(0, 120);
      return `
<div class="product-card">
  ${img ? `<img src="${img}" alt="${name}" class="product-img"/>` : `<div class="product-placeholder">${name.charAt(0)}</div>`}
  <div class="product-info">
    <h3>${name}</h3>
    <p>${desc}</p>
    <div class="product-price">€${price.toFixed(2)}</div>
    <a href="${buyUrl}" class="buy-btn" target="_blank" rel="noopener">Jetzt kaufen →</a>
  </div>
</div>`;
    }).join("\n");

    res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>CyberSarah Store — KI-Produkte</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
body{background:#0a0a0f;color:#e0e0e0;min-height:100vh}
.header{background:linear-gradient(135deg,#1a0a2e,#0d0d1a);padding:2rem 1rem;text-align:center;border-bottom:1px solid #2a1a4e}
.header h1{font-size:1.8rem;background:linear-gradient(135deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header p{color:#6b7280;margin-top:8px;font-size:0.95rem}
.stats{display:flex;justify-content:center;gap:24px;padding:20px;flex-wrap:wrap}
.stat{text-align:center}
.stat-num{font-size:1.5rem;font-weight:700;color:#a855f7}
.stat-label{color:#6b7280;font-size:0.75rem;margin-top:4px}
.products{max-width:900px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.product-card{background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;transition:all 0.3s}
.product-card:hover{border-color:#a855f7;transform:translateY(-2px)}
.product-placeholder{height:140px;background:linear-gradient(135deg,#1a0a2e,#2a1a4e);display:flex;align-items:center;justify-content:center;font-size:3rem;color:#a855f7;font-weight:700}
.product-img{width:100%;height:140px;object-fit:cover}
.product-info{padding:16px}
.product-info h3{font-size:1rem;color:#f0f0f0;margin-bottom:6px}
.product-info p{font-size:0.8rem;color:#6b7280;margin-bottom:12px;line-height:1.4}
.product-price{font-size:1.4rem;font-weight:700;color:#a855f7;margin-bottom:12px}
.buy-btn{display:block;width:100%;padding:12px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;border:none;border-radius:10px;font-size:0.9rem;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;transition:all 0.2s}
.buy-btn:active{transform:scale(0.97)}
.footer{text-align:center;padding:24px;color:#6b7280;font-size:0.75rem}
.empty{text-align:center;padding:60px 20px;color:#6b7280}
.empty-icon{font-size:3rem;margin-bottom:16px}
@media(max-width:480px){.header h1{font-size:1.3rem}.products{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header">
  <h1>🛍️ CyberSarah Store</h1>
  <p>KI-generierte Premium-Produkte — sicher bezahlen mit Stripe</p>
</div>
<div class="stats">
  <div class="stat"><div class="stat-num">${products.length}</div><div class="stat-label">Produkte</div></div>
  <div class="stat"><div class="stat-num">🔒</div><div class="stat-label">Stripe Live</div></div>
  <div class="stat"><div class="stat-num">💳</div><div class="stat-label">Sofort-Kauf</div></div>
</div>
<div class="products">
  ${products.length > 0 ? productCards : '<div class="empty"><div class="empty-icon">📦</div><p>Noch keine Produkte verfügbar.</p><p style="margin-top:8px;font-size:0.85rem">Die KI-Agenten arbeiten daran...</p></div>'}
</div>
<div class="footer">
  <p>CyberSarah Revenue OS • Stripe Live-Modus • SSL-geschützt</p>
  <p style="margin-top:4px;font-size:0.7rem">Alle Preise inkl. MwSt. • Sofortiger Download nach Zahlung</p>
</div>
</body>
</html>`);
  } catch (err) {
    res.status(500).send("Fehler beim Laden der Produkte");
  }
});

export default router;
