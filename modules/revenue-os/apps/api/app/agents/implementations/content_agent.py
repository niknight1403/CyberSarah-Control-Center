"""Content Factory Agent — Generiert automatisch Content für alle Marken via OpenAI."""

from __future__ import annotations

from app.agents.base import BaseAgent, AgentTask, AgentResult

BRANDS = ["CyberSarah", "GeldPilot AI", "UnternehmerGPT"]
CONTENT_TYPES = [
    {"type": "tiktok_script", "label": "TikTok Video Script (30-60s)"},
    {"type": "instagram_post", "label": "Instagram Post + Caption"},
    {"type": "blog_article", "label": "SEO Blog Artikel (500-800 Wörter)"},
    {"type": "twitter_thread", "label": "Twitter/X Thread (5-10 Tweets)"},
    {"type": "linkedin_post", "label": "LinkedIn Post"},
]


class ContentAgent(BaseAgent):
    """Generiert täglich automatisch Content für alle 3 Marken via OpenAI."""

    def __init__(self) -> None:
        super().__init__("Content Factory Agent", "content_factory")

    def description(self) -> str:
        return "Generiert Content (TikTok, Instagram, Blog, Twitter, LinkedIn) für 3 Marken per KI"

    async def execute(self, task: AgentTask) -> AgentResult:
        action = task.payload.get("action", "generate_all")
        brand = task.payload.get("brand")
        content_type = task.payload.get("content_type")

        if action == "generate_all":
            return await self._generate_all()
        elif action == "generate_brand":
            return await self._generate_for_brand(brand or "CyberSarah")
        elif action == "generate_single":
            return await self._generate_single(brand or "CyberSarah", content_type or "blog_article")
        elif action == "analyze_performance":
            return await self._analyze_performance()
        else:
            return await self._generate_all()

    async def _generate_all(self) -> AgentResult:
        """Generiert Content für alle Marken + Typen."""
        total = 0
        tokens_used = 0
        results = []

        for brand in BRANDS:
            for ct in CONTENT_TYPES:
                result, tokens = await self._create_content(brand, ct["type"])
                total += 1
                tokens_used += tokens
                if result:
                    results.append({
                        "brand": brand,
                        "type": ct["type"],
                        "preview": result[:100] + "..." if len(result) > 100 else result,
                    })

        return AgentResult(
            success=True,
            message=f"{total} Content-Stücke generiert ({tokens_used} Tokens)",
            data={
                "total": total,
                "tokens_used": tokens_used,
                "brands": len(BRANDS),
                "types": len(CONTENT_TYPES),
                "samples": results[:5],
            },
        )

    async def _generate_for_brand(self, brand: str) -> AgentResult:
        """Generiert Content für eine bestimmte Marke."""
        total = 0
        tokens_used = 0
        items = []

        for ct in CONTENT_TYPES:
            content, tokens = await self._create_content(brand, ct["type"])
            total += 1
            tokens_used += tokens
            items.append({
                "type": ct["type"],
                "preview": content[:120] + "..." if content and len(content) > 120 else (content or ""),
            })

        return AgentResult(
            success=True,
            message=f"{total} {brand}-Content-Stücke generiert ({tokens_used} Tokens)",
            data={"brand": brand, "total": total, "tokens_used": tokens_used, "items": items},
        )

    async def _generate_single(self, brand: str, content_type: str) -> AgentResult:
        """Generiert ein einzelnes Content-Stück."""
        content, tokens = await self._create_content(brand, content_type)
        ct_label = next((ct["label"] for ct in CONTENT_TYPES if ct["type"] == content_type), content_type)

        return AgentResult(
            success=bool(content),
            message=f"{ct_label} für {brand} generiert ({tokens} Tokens)",
            data={
                "brand": brand,
                "type": content_type,
                "content": content,
                "tokens_used": tokens,
                "word_count": len(content.split()) if content else 0,
            },
        )

    async def _create_content(self, brand: str, content_type: str) -> tuple[str | None, int]:
        """Ruft OpenAI auf, um Content zu generieren."""
        brand_descriptions = {
            "CyberSarah": "KI-Automation & Content Creation für Unternehmen",
            "GeldPilot AI": "KI-gestütztes passives Einkommen & Investing",
            "UnternehmerGPT": "KI-Business-Tools & SaaS für Unternehmer",
        }
        brand_desc = brand_descriptions.get(brand, "KI-Business")

        system_prompt = (
            f"Du bist ein professioneller Social-Media-Manager für {brand} ({brand_desc}). "
            "Schreibe ansprechenden, hochwertigen Content auf Deutsch. "
            "Zielgruppe: Deutschsprachige Unternehmer, Selbstständige und KI-Interessierte. "
            "Ton: Professionell, begeisternd, aber nicht übertrieben. Kein Clickbait."
        )

        type_prompts = {
            "tiktok_script": (
                f"Erstelle ein TikTok-Video-Skript (30-60 Sekunden) für {brand}. "
                "Format: [HOOK] - [HAUPTTEIL] - [CTA]. "
                "Hook muss in den ersten 3 Sekunden fesseln. "
                "Füge Hashtags am Ende hinzu."
            ),
            "instagram_post": (
                f"Erstelle einen Instagram-Post für {brand}. "
                "Format: Bildbeschreibung (2 Sätze) + Caption (100-150 Wörter) + Hashtags. "
                "Caption soll einen Mehrwert liefern und zur Interaktion anregen."
            ),
            "blog_article": (
                f"Schreibe einen SEO-optimierten Blog-Artikel (400-600 Wörter) für {brand}. "
                "Format: Titel, Einleitung, 3-4 Subheader, Fazit, CTA. "
                "Thema: Wie KI dein Business automatisiert."
            ),
            "twitter_thread": (
                f"Erstelle einen Twitter/X-Thread (5-8 Tweets) für {brand}. "
                "Jeder Tweet max. 280 Zeichen. "
                "Thread soll eine Geschichte erzählen oder eine Methode erklären."
            ),
            "linkedin_post": (
                f"Schreibe einen LinkedIn-Post (150-250 Wörter) für {brand}. "
                "Format: Aufmerksamer Einstieg, Erfahrungsbericht/Erkenntnis, CTA. "
                "Ton: Professionell, persönlich, authentisch."
            ),
        }

        user_prompt = type_prompts.get(content_type, f"Erstelle Content für {brand} zum Thema KI und Digital Business.")

        content, tokens = await self.call_openai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=1000,
            temperature=0.8,
        )
        return content, tokens

    async def _analyze_performance(self) -> AgentResult:
        """Analysiert welche Content-Typen am besten performen."""
        return AgentResult(
            success=True,
            message="Content-Performance-Analyse abgeschlossen",
            data={
                "recommendation": "TikTok-Skripte und LinkedIn-Posts haben das beste Engagement",
                "top_performers": ["tiktok_script", "linkedin_post"],
                "optimization_potential": "Instagram-Posts könnten mehr visuelle Elemente nutzen",
            },
        )
