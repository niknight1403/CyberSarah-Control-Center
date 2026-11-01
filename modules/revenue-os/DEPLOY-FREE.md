# 🆓 CyberSarah Revenue OS — Kostenlos Live Schalten

## Übersicht: Kostenlose Hosting-Optionen

| Plattform | Backend | DB | Cron | Free Limit | Empfehlung |
|---|---|---|---|---|---|
| **Railway** | ✅ | ✅ PostgreSQL | ✅ | $5/Monat Credit | ⭐ **BESTE WAHL** |
| **Render** | ✅ | ✅ PostgreSQL | ✅ | 750h/Monat | Gute Alternative |
| **Fly.io** | ✅ | ⚠️ Nur SQLite | ❌ | 3 shared-cpu-1x | Für kleine Apps |
| **Koyeb** | ✅ | ✅ PostgreSQL | ✅ | Free Tier | Einfach |
| **Vercel** | ⚠️ Nur Frontend | ❌ | ❌ | Unlimited | Nur Dashboard |

---

## ⭐ EMPFEHLUNG: Railway (Kostenlos)

### Schritt 1: Railway Account erstellen
1. Gehe zu **https://railway.app**
2. Klicke **"Start Building"**
3. Logge dich mit **GitHub** ein
4. Du bekommst **$5/Monat gratis** (reicht für Backend + DB)

### Schritt 2: Repository verbinden
1. Klicke **"New Project"** → **"Deploy from GitHub repo"**
2. Wähle **`niknight1403/cybersarah-revenue-os`**
3. Railway erkennt automatisch das Dockerfile

### Schritt 3: PostgreSQL Datenbank hinzufügen
1. Im Projekt: **"New"** → **"Database"** → **"PostgreSQL"**
2. Railway erstellt automatisch eine PostgreSQL-Instanz
3. Kopiere die **`DATABASE_URL`** aus den Service-Einstellungen

### Schritt 4: Umgebungsvariablen setzen
Im Service → **"Variables"** → **"Raw Editor"**:

```env
PORT=3000
DATABASE_URL=postgres://... (aus PostgreSQL Service)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_APP_URL=https://dein-name.up.railway.app
ALLOWED_ORIGINS=https://dein-name.up.railway.app
```

### Schritt 5: Custom Domain (optional)
1. Service → **"Settings"** → **"Networking"** → **"Custom Domain"**
2. Trage z.B. `cybersarah.app` ein
3. Setze DNS bei deinem Domain-Anbieter:
   ```
   CNAME → cname.up.railway.app
   ```
4. Railway stellt automatisch **HTTPS** bereit

### Schritt 6: Start-Befehl anpassen
Falls der Build fehlschlägt, setze im Service → **"Settings"**:
- **Build Command**: `cd lib/db && pnpm install && cd ../../artifacts/api-server && pnpm install`
- **Start Command**: `cd artifacts/api-server && node --import tsx src/index.ts`

### Schritt 7: Datenbank initialisieren
Im Railway Terminal (Service → "Terminal"):
```bash
cd lib/db && pnpm run push
```

---

## 🥈 ALTERNATIVE: Render (Kostenlos)

### Schritt 1: Render Account
1. Gehe zu **https://render.com**
2. Registriere dich mit GitHub

### Schritt 2: Web Service erstellen
1. **"New"** → **"Web Service"**
2. GitHub Repo verbinden: `niknight1403/cybersarah-revenue-os`
3. Einstellungen:
   - **Runtime**: Node
   - **Build Command**: `cd lib/db && pnpm install && cd ../../artifacts/api-server && pnpm install && cd ../.. && pnpm install`
   - **Start Command**: `cd artifacts/api-server && node --import tsx src/index.ts`
   - **Port**: 3000

### Schritt 3: PostgreSQL hinzufügen
1. **"New"** → **"PostgreSQL"**
2. Kopiere die **Internal Database URL**

### Schritt 4: Env Vars setzen
```env
PORT=3000
DATABASE_URL=postgres://... (aus Render PostgreSQL)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_...
```

---

## 🥉 ALTERNATIVE: Koyeb (Kostenlos)

### Kurz-Deploy
1. Gehe zu **https://koyeb.com**
2. GitHub Repo verbinden
3. **"Create Service"** → **"Git"**
4. Repository: `niknight1403/cybersarah-revenue-os`
5. **Instance**: Free (Nano)
6. **Build**: `cd lib/db && pnpm install && cd ../../artifacts/api-server && pnpm install`
7. **Run**: `cd artifacts/api-server && node --import tsx src/index.ts`
8. PostgreSQL über Koyeb Database oder extern

---

## ⚡ Quick-Deploy Befehle (für Hetzner Terminal)

Falls du Railway CLI nutzen willst:

```bash
# Railway CLI installieren
curl -fsSL https://railway.app/install.sh | sh

# Login
railway login

# Projekt verknüpfen
cd /opt/cybersarah
railway link

# PostgreSQL hinzufügen
railway add --database postgresql

# Env Vars setzen
railway variables set OPENAI_API_KEY=sk-...
railway variables set STRIPE_SECRET_KEY=sk_...

# Deploy
railway up
```

---

## 📊 Kosten-Vergleich

| Plattform | Free Tier | RAM | CPU | Storage | Cron |
|---|---|---|---|---|---|
| **Railway** | $5/Monat | 512MB | Shared | 1GB | ✅ |
| **Render** | 750h/Monat | 512MB | Shared | — | ✅ |
| **Koyeb** | Free | 256MB | Nano | 1GB | ✅ |
| **Fly.io** | 3 shared-cpu | 256MB | Shared | 3GB | ⚠️ |
| **Vercel** | Unlimited | — | — | — | ❌ |

---

## 🔧 Troubleshooting

### "Build failed"
→ Stelle sicher, dass `pnpm-lock.yaml` im Repo ist
→ Falls nicht: `cd /opt/cybersarah && pnpm install && git add pnpm-lock.yaml && git commit -m "lock" && git push`

### "DATABASE_URL nicht gefunden"
→ PostgreSQL Service muss im selben Railway-Projekt sein
→ Verwende die interne URL (nicht die externe)

### "Port already in use"
→ Setze `PORT=3000` in den Env Vars

### "CORS Fehler"
→ Setze `ALLOWED_ORIGINS=https://deine-url.up.railway.app`

---

## 🎯 Nächste Schritte nach Deploy

1. **Google Search Console** verifizieren
2. **TikTok/Instagram API Keys** eintragen
3. **Stripe Webhook URL** aktualisieren: `https://deine-url.up.railway.app/api/stripe/webhook`
4. **SEO Blog** testen: `https://deine-url.up.railway.app/blog`
