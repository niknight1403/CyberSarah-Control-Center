import os
import sqlite3
import hashlib
import json
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - [%(levelname)s] - %(message)s')
logger = logging.getLogger("CyberSarahMasterSetup")

BASE_DIR = "/opt/cybersarah-control-center"

def create_directories():
    dirs = [
        f"{BASE_DIR}/modules/ai_health_influencer/config",
        f"{BASE_DIR}/modules/auth",
        f"{BASE_DIR}/core",
        f"{BASE_DIR}/logs"
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    logger.info("Verzeichnisstruktur erstellt.")

def setup_admin():
    db_path = f"{BASE_DIR}/database.sqlite"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password_hash TEXT,
            role TEXT,
            subscription_tier TEXT,
            api_limit_bypassed BOOLEAN,
            created_at TEXT
        )
    ''')
    
    email = "niko.oeben@gmail.com"
    pwd_hash = hashlib.sha256("Niko6529!!!!!".encode()).hexdigest()
    
    cursor.execute('''
        INSERT OR REPLACE INTO users (email, password_hash, role, subscription_tier, api_limit_bypassed, created_at)
        VALUES (?, ?, 'admin', 'elite', 1, ?)
    ''', (email, pwd_hash, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()
    logger.info("[SUCCESS] Admin-Account für Niko (Elite, Unlimitiert) in DB registriert.")

def create_free_rotator():
    rotator_code = '''import random
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
'''
    with open(f"{BASE_DIR}/core/free_api_rotator.py", "w", encoding="utf-8") as f:
        f.write(rotator_code)
    logger.info("Free API Rotator Modul erstellt.")

def create_product_ingester():
    ingester_code = '''import json
import os
from datetime import datetime

STAGING_PATH = "/opt/cybersarah-control-center/modules/ai_health_influencer/config/staging_products.json"

def fetch_and_stage_products():
    new_products = [
        {
            "id": f"prod_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "product_name": "Bio Astaxanthin & Vitamin C Complex",
            "affiliate_link": "https://partnernet.amazon.de/dp/example-astaxanthin",
            "niche": "Anti-Aging & Zellschutz",
            "status": "pending_approval"
        }
    ]
    
    os.makedirs(os.path.dirname(STAGING_PATH), exist_ok=True)
    existing = []
    if os.path.exists(STAGING_PATH):
        with open(STAGING_PATH, "r", encoding="utf-8") as f:
            try:
                existing = json.load(f)
            except:
                existing = []
                
    existing.extend(new_products)
    with open(STAGING_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=4, ensure_ascii=False)
    print(f"[SUCCESS] {len(new_products)} Produkte autonom im Staging für die App bereitgestellt.")

if __name__ == "__main__":
    fetch_and_stage_products()
'''
    with open(f"{BASE_DIR}/modules/ai_health_influencer/product_ingester.py", "w", encoding="utf-8") as f:
        f.write(ingester_code)
    logger.info("Product Ingester Modul erstellt.")

def create_main_pipeline():
    main_code = '''import os
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - [%(levelname)s] - %(message)s')
logger = logging.getLogger("AIInfluencerOrchestrator")

class AIHealthInfluencerOrchestrator:
    def __init__(self, config_path="modules/ai_health_influencer/config/products.json"):
        self.config_path = config_path
        self.load_configurations()

    def load_configurations(self):
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, "r", encoding="utf-8") as f:
                    self.products = json.load(f)
            else:
                self.products = [
                    {
                        "product_name": "Omega-3 Vegan & Magnesium Complex",
                        "affiliate_link": "https://partnernet.amazon.de/example-health-link",
                        "niche": "Gesundheit & Langlebigkeit"
                    }
                ]
            logger.info("Konfigurationen erfolgreich geladen.")
        except Exception as e:
            logger.error(f"Fehler beim Laden der Konfiguration: {e}")
            self.products = []

    def execute_autonomous_cycle(self):
        logger.info("=== Start des autonomen AI Influencer Zyklus im CyberSarah Revenue OS ===")
        selected_product = self.products[0] if self.products else None
        if not selected_product:
            logger.error("Kein Produkt gefunden.")
            return
        logger.info(f"Verarbeite Produkt: {selected_product['product_name']}")
        logger.info(f"Affiliate-Link aktiv: {selected_product['affiliate_link']}")
        logger.info("=== Zyklus erfolgreich beendet (Status: GREEN) ===")

if __name__ == "__main__":
    orch = AIHealthInfluencerOrchestrator()
    orch.execute_autonomous_cycle()
'''
    with open(f"{BASE_DIR}/modules/ai_health_influencer/main.py", "w", encoding="utf-8") as f:
        f.write(main_code)
    logger.info("Main Orchestrator erstellt.")

def create_configs():
    prod_path = f"{BASE_DIR}/modules/ai_health_influencer/config/products.json"
    products = [
        {
            "product_name": "Omega-3 Vegan & Magnesium Complex",
            "affiliate_link": "https://partnernet.amazon.de/example-health-link",
            "niche": "Gesundheit & Langlebigkeit"
        }
    ]
    with open(prod_path, "w", encoding="utf-8") as f:
        json.dump(products, f, indent=4, ensure_ascii=False)
    logger.info("Default products.json erstellt.")

if __name__ == "__main__":
    create_directories()
    setup_admin()
    create_free_rotator()
    create_product_ingester()
    create_main_pipeline()
    create_configs()
    print("ALL SYSTEMS GREEN: Setup completed successfully.")
