import requests
import json
import logging

logger = logging.getLogger("ScriptAgent")

class ScriptAgent:
    def __init__(self):
        # Nutzt standardmäßig den lokalen Ollama Server (Zero-Cost / Privat)
        self.ollama_url = "http://localhost:11434/api/generate"
        self.model = "llama3"

    def generate_script(self, product_name, niche):
        logger.info(f"Generiere echtes KI-Skript für Produkt: {product_name} in Nische: {niche}")
        
        prompt = (
            f"Erstelle ein virales 15-Sekunden Short-Skript auf Deutsch für das Produkt '{product_name}' "
            f"in der Nische '{niche}'. "
            "Antwortet NUR im folgenden JSON-Format ohne zusätzlichen Text: "
            "{\"hook\": \"Starker Hook hier\", \"body\": \"Hauptteil mit Mehrwert\", \"cta\": \"Call to Action\"}"
        )
        
        try:
            response = requests.post(self.ollama_url, json={
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }, timeout=10)
            
            if response.status_code == 200:
                result_text = response.json().get("response", "{}")
                # Bereinigen von Markdown-Codeblöcken falls vorhanden
                clean_json = result_text.replace("```json", "").replace("```", "").strip()
                return json.loads(clean_json)
        except Exception as e:
            logger.warning(f"Ollama lokal nicht erreichbar ({e}), nutze High-Converting Fallback-Template.")
            
        # Fallback, falls Ollama gerade lädt
        return {
            "hook": f"Das hat mir kein Arzt gesagt über {product_name}...",
            "body": "Nach nur 15 Tagen hat sich mein kompletter Energiestoffwechsel optimiert.",
            "cta": "Sichere dir das Original über den Link in der Beschreibung!"
        }
