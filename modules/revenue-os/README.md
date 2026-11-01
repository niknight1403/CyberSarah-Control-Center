# 🚀 CyberSarah Revenue OS (AROS)

**Autonomous Revenue Operating System** — Ein Multi-Agent-System für autonomes Online-Umsatzgenerieren mit KI.

## 📐 Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                    CyberSarah Revenue OS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🧠 AGENTEN-HIERARCHIE                                          │
│  ├── Director Agent (Strategie, täglich 06:00)                  │
│  ├── Master Agent (Koordination, alle 30 Min)                   │
│  ├── Content Factory (4x/Tag → TikTok, Instagram, YouTube)      │
│  ├── Social Media Poster (4x/Tag → echte TikTok/Instagram API)  │
│  ├── SEO Blog Agent (alle 4h → cybersarah.app/blog)             │
│  ├── Trend Analyst (alle 6h → Markttrends)                      │
│  ├── Video Agent (2x/Tag → Video-Skripte)                       │
│  ├── Sales Agent (2x/Tag → Verkaufsoptimierung)                 │
│  ├── Funnel Agent (täglich → E-Mail-Sequenzen)                  │
│  ├── Community Agent (3x/Tag → DMs, Kommentare)                 │
│  ├── Revenue Analyst (alle 2h → Umsatzchancen)                  │
│  ├── Monetization Agent → Upsell, Affiliate                     │
│  ├── Influencer Agent → Content-Generierung                     │
│  ├── HARA Agent (alle 4h → Revenue-Pakete)                      │
│  ├── Expansion Scanner (alle 6h → neue Quellen)                 │
│  ├── Finance Team → Steuer, Buchhaltung                         │
│  └── ⏸️ Micro-Trading (PAUSIERT)                                │
│                                                                  │
│  💰 MONETARISIERUNG                                             │
│  ├── Stripe Payment Links (Digitalprodukte)                     │
│  ├── Affiliate-Links (automatisch in Content)                   │
│  ├── SEO Blog → organischer Traffic → Conversions               │
│  ├── Social Media → Reichweite → Traffic → Sales                │
│  └── E-Mail-Funnels → Nurturing → Upsells                       │
│                                                                  │
│  🛡️ SICHERHEIT                                                  │
│  ├── Human-in-the-Loop (Finanztransaktionen)                    │
│  ├── Watchdog Agent (Auto-Healing, Error-Recovery)              │
│  └── Audit-Logging (alle Agent-Aktionen)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ Tech Stack

| Komponente | Technologie |
|---|---|
| Backend | Express.js + TypeScript |
| Frontend | React + Vite + Tailwind CSS |
| Database | PostgreSQL + Drizzle ORM |
| Payments | Stripe |
| AI | OpenAI (GPT-4o-mini, DALL-E) |
| Social Media | TikTok Content Posting API v2, Meta Graph API v19.0 |
| SEO | Autonome Blog-Generierung mit XML-Sitemap |
| Deployment | Docker / PM2 auf Hetzner Cloud |
| Monitoring | Pino Logger + Agent-Logs |

## 🚀 Quick Start

### Voraussetzungen
- Node.js 18+
- PostgreSQL
- pnpm

### 1. Repository klonen
```bash
git clone https://github.com/niknight1403/cybersarah-revenue-os.git
cd cybersarah-revenue-os
```

### 2. Dependencies installieren
```bash
pnpm install
```

### 3. Umgebung konfigurieren
```bash
cp .env.example .env
# .env bearbeiten mit echten API-Keys
```

### 4. Server starten
```bash
pnpm run dev
```

### 5. Hetzner Deploy
```bash
bash deploy-hetzner.sh
```

## 📁 Projektstruktur

```
cybersarah-revenue-os/
├── artifacts/
│   ├── api-server/           # Backend API Server
│   │   └── src/
│   │       ├── agents/       # 23+ KI-Agenten
│   │       │   ├── orchestrator.ts      # Zentrale Cron-Steuerung
│   │       │   ├── socialMediaPoster.ts # TikTok/Instagram Auto-Post
│   │       │   ├── contentAgent.ts      # Content-Generierung
│   │       │   ├── seoContentAgent.ts   # SEO-Blog-Artikel
│   │       │   ├── directorAgent.ts     # Strategische Analyse
│   │       │   ├── masterAgent.ts       # System-Koordination
│   │       │   ├── microTradingAgent.ts # ⏸️ Pausiert
│   │       │   └── ...                  # Weitere Agenten
│   │       ├── lib/          # Utility-Libraries
│   │       ├── routes/       # API-Endpunkte
│   │       │   ├── seoBlogSitemap.ts    # /blog, /sitemap.xml
│   │       │   └── ...
│   │       ├── services/     # Auth, Rate-Limiting
│   │       ├── app.ts        # Express App Setup
│   │       └── index.ts      # Server-Entry-Point
│   └── dashboard/            # React Frontend
│       └── src/
│           ├── pages/        # Dashboard-Seiten
│           ├── components/   # UI-Komponenten
│           └── hooks/        # React Hooks
├── lib/
│   ├── db/                   # Drizzle ORM Schema
│   ├── api-client-react/     # API-Client
│   └── api-zod/              # Zod Validierung
├── .env.example              # Umgebungsvariablen
├── package.json              # Root Package
└── pnpm-workspace.yaml       # Monorepo-Setup
```

## 🔑 Umgebungsvariablen

```env
# Server
PORT=3000
PUBLIC_APP_URL=https://cybersarah.app

# Datenbank
DATABASE_URL=postgres://user:pass@host:5432/dbname

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI
OPENAI_API_KEY=sk-...

# TikTok API
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=

# Instagram Graph API
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
```

## 🤖 Agenten-Übersicht

| Agent | Typ | Cron | Funktion |
|---|---|---|---|
| Director | Strategie | 06:00 täglich | KPI-Analyse, Systemausrichtung |
| Master | Koordination | Alle 30 Min | Agenten-Steuerung, Prioritäten |
| Content Factory | Content | 08, 12, 18 Uhr | Blog, TikTok, Instagram, YouTube |
| **Social Media Poster** | **Auto-Post** | **07, 11, 15, 20 Uhr** | **Echte TikTok/Instagram API** |
| **SEO Blog** | **SEO** | **Alle 4h** | **Blog-Artikel auf cybersarah.app** |
| Trend Analyst | Trends | Alle 6h | Markttrends, Content-Ideen |
| Video Agent | Video | 10, 16 Uhr | Video-Skripte, Hooks |
| Sales Agent | Sales | 11, 17 Uhr | Verkaufstexte, CTAs |
| Funnel Agent | Funnel | 07:00 täglich | E-Mail-Sequenzen |
| Community | Community | 09, 13, 20 Uhr | DMs, Kommentare |
| Revenue Analyst | Umsatz | Alle 2h | Stripe-Links, Chancen |
| Monetization | Optimierung | Via Master | Upsell, Affiliate |
| HARA | Revenue | Alle 4h | Revenue-Pakete |
| Expansion | Scanning | Alle 6h | Neue Umsatzquellen |
| Finance Team | Finanzen | Via Master | Steuer, Buchhaltung |
| ⏸️ Micro-Trading | Trading | **PAUSIERT** | Krypto (zu riskant) |

## 📊 Revenue-Streams

1. **Digitalprodukte** — via Stripe Payment Links (automatisch generiert)
2. **Affiliate-Marketing** — automatisch in Content eingebettet
3. **SEO Blog** — organischer Google-Traffic → Conversions
4. **Social Media** — TikTok/Instagram Reichweite → Traffic
5. **E-Mail-Funnels** — Nurturing → Upsells
6. **Coaching/Consulting** — via Lead-Generierung

## 🛡️ Sicherheit

- **HITL (Human-in-the-Loop)**: Alle Finanztransaktionen erfordern Admin-Bestätigung
- **Watchdog Agent**: Auto-Healing bei Errors, OpenAI 401-Erkennung
- **Audit-Logging**: Jede Agent-Aktion wird protokolliert
- **Rate Limiting**: API-Schutz gegen Missbrauch
- **Secret Management**: API-Keys nur in .env (nicht im Code)

## 📝 Lizenz

MIT License — Niko (niknight1403)
