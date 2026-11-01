import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FreeAPIRotator")

class FreeAPIRotator:
    def __init__(self):
        self.providers = [
            {"name": "Local Ollama (Llama 3 / Mistral)", "cost": 0.0, "status": "active"},
            {"name": "Groq Free Tier (Llama 3 70B)", "cost": 0.0, "status": "active"},
            {"name": "Google Gemini Free API", "cost": 0.0, "status": "active"},
            {"name": "OpenRouter Free Pool", "cost": 0.0, "status": "active"}
        ]

    def get_optimal_route(self):
        active_providers = [p for p in self.providers if p["status"] == "active"]
        selected = random.choice(active_providers)
        logger.info(f"Kostenfreie Route gewählt: {selected['name']} (0.0 USD)")
        return selected

if __name__ == "__main__":
    r = FreeAPIRotator()
    r.get_optimal_route()
