# Agenten einbauen – Schritt für Schritt (Termux)

## 1. Dateien ins Projekt kopieren
```bash
cd ~/cybersarah-revenue-os
mkdir -p artifacts/api-server/src/agents
# Die 4 Server-Dateien nach artifacts/api-server/src/agents/ kopieren:
#   keyAgent.ts, socialAgent.ts, financeAgent.ts, masterAgent.ts
# Die Tab-Datei ins Dashboard:
#   MasterAgentTab.tsx -> artifacts/dashboard/src/ (bei den anderen Tabs/Pages)
```

## 2. Server-Routen registrieren
In der Haupt-Serverdatei des api-servers (z. B. `src/index.ts`):
```ts
import { masterAgent } from "./agents/masterAgent";

masterAgent.start();
app.get("/api/master-agent", (_req, res) => res.json(masterAgent.getState()));
app.post("/api/master-agent/run/:agent", async (req, res) =>
  res.json(await masterAgent.runNow(req.params.agent as any)));
```

## 3. Tab im Dashboard registrieren
Dort, wo die Sidebar-Einträge definiert sind (Dashboard, Agenten, …):
Eintrag „🧠 Master" ergänzen und auf `MasterAgentTab` routen.

## 4. .env füllen (das ist der Schalter von Test auf ECHT)
```
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...        # sk_test_ = Testgeld, sk_live_ = echter Umsatz
DATABASE_URL=postgres://...
PRODUCT_NAME=CyberSarah Service
PRODUCT_PRICE_CENTS=4900
SOCIAL_TOPICS=Thema 1,Thema 2
# Optional, sobald Plattform-Zugänge genehmigt sind:
IG_ACCESS_TOKEN=...
IG_USER_ID=...
DEFAULT_POST_IMAGE_URL=https://...
TIKTOK_ACCESS_TOKEN=...
```

## 5. Bauen & pushen
```bash
cd artifacts/dashboard && PATH=~/bin:$PATH pnpm build && cd ~/cybersarah-revenue-os
PATH=~/bin:$PATH pnpm exec cap sync android
git add . && git commit -m "Master-Agent + autonome Agenten" && git push
```
Neue APK wie gehabt aus GitHub Actions laden.

## Was ehrlich zu erwarten ist
- **FinanceAgent** meldet ausschließlich real in Stripe verbuchte Zahlungen und
  legt automatisch einen echten Payment-Link an. Umsatz entsteht, wenn Menschen
  über diesen Link kaufen – dafür braucht es ein echtes Angebot und Reichweite.
- **SocialAgent** erzeugt Content mit echten OpenAI-Calls. Automatisches Posten
  geht erst, wenn Meta/TikTok deinen Entwickler-Zugang genehmigt haben
  (manueller Antrag, dauert i. d. R. Tage bis Wochen).
- **KeyAgent** kann Keys prüfen und überwachen, aber nicht erstellen –
  Registrierung bei den Anbietern bleibt ein menschlicher Schritt.
- Rechtliches nicht vergessen: Gewerbe/Steuern, Impressum, und keine
  Einkommensversprechen in Social-Posts (Abmahnrisiko).
