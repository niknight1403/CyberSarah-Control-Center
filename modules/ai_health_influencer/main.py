import os
import json
import logging
from script_agent import ScriptAgent
from video_renderer import VideoRenderer
from publisher import MultiChannelPublisher

logging.basicConfig(level=logging.INFO, format='%(asctime)s - [%(levelname)s] - %(message)s')
logger = logging.getLogger("AIInfluencerOrchestrator")

class AIHealthInfluencerOrchestrator:
    def __init__(self, config_path="modules/ai_health_influencer/config/products.json"):
        self.config_path = config_path
        self.script_agent = ScriptAgent()
        self.video_renderer = VideoRenderer()
        self.publisher = MultiChannelPublisher()
        self.load_configurations()

    def load_configurations(self):
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.products = json.load(f)
            else:
                self.products = []
            logger.info("Konfigurationen erfolgreich geladen.")
        except Exception as e:
            logger.error(f"Fehler beim Laden der Konfiguration: {e}")
            self.products = []

    def execute_autonomous_cycle(self):
        logger.info("=== Start des autonomen AI Influencer Voll-Zyklus ===")
        selected_product = self.products[0] if self.products else None
        if not selected_product:
            logger.error("Kein Produkt gefunden.")
            return

        # 1. KI-Skript generieren
        script_data = self.script_agent.generate_script(
            selected_product['product_name'], 
            selected_product.get('niche', 'Gesundheit')
        )
        logger.info(f"Skript generiert - Hook: {script_data.get('hook')}")

        # 2. Video rendern
        video_path = self.video_renderer.render_short(script_data, selected_product['product_name'])
        if not video_path:
            logger.error("Video-Rendering fehlgeschlagen. Abbruch des Publishing-Schritts.")
            return

        # 3. Multi-Channel Auto-Publishing ausführen
        pub_results = self.publisher.publish_video(
            video_path, 
            script_data, 
            selected_product['affiliate_link']
        )
        
        logger.info(f"Publishing Ergebnisse: {pub_results}")
        logger.info("=== Voll-Zyklus erfolgreich beendet (STATUS: GREEN) ===")

if __name__ == "__main__":
    orch = AIHealthInfluencerOrchestrator()
    orch.execute_autonomous_cycle()
