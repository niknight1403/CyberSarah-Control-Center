# AI Influenza Team — Integrationsplan (Phase 7, Sprint 1)

Stand: 2026-11-01 · Branch: `feature/ai-influenza-phase7` · Status: **Plan zur Admin-Freigabe**

## 1. Audit-Ergebnis (bewiesen, nicht angenommen)

### Vorhanden und wiederverwendbar
| Baustein | Ort | Zustand |
|---|---|---|
| Influencer-Router (personas, generate, campaignPlan, analyzeMetrics) | `server/influencer-router.ts` | aktiv, protected procedures |
| Revenue-Autopilot (Queue, Advisory-Lock, 273 Opportunities) | `server/revenue-autopilot.ts` | aktiv |
| Revenue-Command (HARA, SaaS, Cross-Sell, Expansion, Subscriptions, Trading) | `server/revenue-command-router.ts` | aktiv |
| Stripe-Billing (Router, Service, Monetization) | `server/billing-router.ts`, `billing.ts`, `monetization.ts` | aktiv, Live-Key im Unit |
| Media-/Video-Pipeline | `server/media-pipeline.ts` | vorhanden |
| Agenten-Registry (43 agent-Typen, u.a. `live_problem_loeser`) | `revenue_os.agents` | aktiv |
| Kanal-Registry (Webhook-basiert: `influencer_plattformen` mit webhook_url, beste_zeiten) | `revenue_os` | Tabelle vorhanden, 0 Einträge |
| Abo-Indizes | `revenue_os.subscription_plans` | 10 Pläne, 19–1.990 € |
| Content-Bestand | 217 content, 82 campaigns, 57 coupons, 62 cross-sell-Regeln | aktiv |
| LLM-Routing | Ollama-VM (unlimited) + 3× Hetzner-CAX + Groq + OpenRouter | Hub 15/27 eligible |
| App-Oberfläche | `app/(tabs)`: revenue-os, media-studio, business, agent, quality, micro-trading, cyber-dashboard | vorhanden |
| Test-Suite | `tests/` | 325 Dateien, 2.419 Tests |

### Lücken (bewiesen leer)
- **Keine** AI-Influenza-Pakete (299/999/2.499 €) in `subscription_plans` oder Stripe.
- **Kein Lead-Intake**: `leads`, `lead_engagement`, `sales_chat_leads`, `sales_conversations` = 0 Zeilen.
- **Kein Geldfluss**: `customer_subscriptions` = 0, `transactions` = 0, `revenue_checkout_intakes` = 0 → MRR 0 €.
- **Keine Kunden-/Auftragsobjekte**: Angebote, Verträge, Auftragsstatus fehlen als Tabellen.
- **Keine Agenten der 8 Zielrollen** (CEO, Market Intelligence, Lead Discovery, Sales, Content, Video, Customer Success, Profit Optimizer).
- **Kein Social-Publishing**: Kanäle nur über `webhook_url` anbindbar; ohne Konto-Zugänge kein automatisches Posten (n8n/Make-Bridge wäre der Weg).
- Stripe enthält bestehende Produkte (AnfragePilot Starter/Pro/Business €49/99/199 + Promo-Produkte) — **nicht** die Influenza-Pakete.

## 2. Zielarchitektur (Wiederverwendung statt Doppelbau)

```
Lead-Intake (Landing/Webhook) ──► leads / lead_engagement
        │                              │
        ▼                              ▼
Angebots-Generator (LLM, Freigabe-Gate)  Lead-Scoring
        │                              │
        └────────► offers (neu) ◄──────┘
                       │ Freigabe (Assisted: externe Aktion)
                       ▼
              Stripe Checkout (bestehendes billing.ts)
                       │ Webhook (verifiziert)
                       ▼
        revenue_checkout_intakes ──► customer_subscriptions
                       │
                       ▼
        Auftrag (orders, neu) ──► Content Factory (media-pipeline + influencerRouter.generate)
                       │                    │ QA + Kundenfreigabe
                       ▼                    ▼
             Reporting (revenue_daily_stats) ──► Profit-Analytics (Kosten je Auftrag)
```

## 3. Sprint-Plan (Reihenfolge nach Prompt-Priorität)

| # | Inhalt | Hauptkomponenten | Abnahme |
|---|---|---|---|
| 1 | Audit + dieser Plan | — | ✅ dieses Dokument |
| 2 | Datenmodell: `offers`, `orders`, `customers`(Erweiterung), Paket-Pläne 299/999/2.499 | Drizzle-Migration | Migration grün, Tests |
| 3 | 8 Agenten + Task-Engine-Anbindung | `agents`-Typen, Orchestrierung | Agent läuft nachweislich eine Aufgabe |
| 4 | Stripe: 3 Produkte/Preise, Checkout, Webhook | `billing.ts`, `webhook` | Testzahlung im Stripe-Testmodus |
| 5 | CRM/Lead-Pipeline + DSGVO-Prozess (nur opt-in/öffentliche Kontakte, Freigabe vor Kontakt) | `leads`-Erweiterung | Lead → Angebot → Freigabe dokumentiert |
| 6 | Content Factory + Video-Pipeline | `media-pipeline`, `influencerRouter.generate` | 1 Kampagne mit Freigabe |
| 7 | UI-Tab „AI Influenza" (Cyber Neon + Aurora Flow, Dark, mobile-first) | `app/(tabs)/ai-influenza.tsx` | Alle 10 Ansichten erreichbar |
| 8 | Profit-Analytics (Umsatz vs. LLM-Kosten je Auftrag) | `revenue-command-service` | Deckungsbeitrag je Auftrag |
| 9 | E2E: Testkunde komplett, Stripe-Test, Sicherheits-Checks | Tests | Suite grün |
| 10 | Release (Version + Changelog + Android-Build prüfen) | — | Release-Tag |

**Explizit vertagt** (Prompt: erst buchbares Angebot, dann Skalierung): automatisches Social-Publishing, Video-Generierung in Produktion, Live-Trading.

## 4. Betriebsmodi (Standard: Assisted)
- **Manual**: jede Aktion mit Freigabe.
- **Assisted** (Standard): interne Schritte automatisch, externe (E-Mail, Veröffentlichung, Zahlung, Vertrag) mit Freigabe.
- **Autopilot**: nur vorab autorisierte, risikoarme Schritte innerhalb definierter Budgets.

## 5. Offene Entscheidungen (benötigen Admin-Freigabe)
1. **Stripe-Modus**: Test-Products zuerst (empfohlen) oder direkt Live-Produkte 299/999/2.499 €?
2. **Preise**: 299/999/2.499 € als Start bestätigen oder an bestehende AnfragePilot-Linie (49/99/199 €) anlehnen?
3. **Kontaktaufnahme**: ausschließlich Inbound (Landing + Formular) oder mit Freigabe-Gate auch vorbereitete Outbound-Entwürfe?
4. **Social-Publishing**: vorerst aus (nur Content-Deliverables) oder Konto-Zugänge/Webhook-Bridge bereitstellen?

## 6. Qualitätsregeln (verbindlich)
Keine erfundenen Testergebnisse · keine simulierten Live-Zahlungen als Umsatz · keine Secrets in Repo/Logs · keine Veröffentlichung ohne Freigabe · kostenpflichtige API-Aufrufe nur in genehmigten Budgets · Preisänderungen an Bestandskunden nur mit Freigabe.
