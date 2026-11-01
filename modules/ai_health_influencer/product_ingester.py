import json
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
