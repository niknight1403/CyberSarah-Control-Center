from flask import Flask, jsonify, request
import json
import os

app = Flask(__name__)
BASE_DIR = "/opt/cybersarah-control-center"

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "system": "CyberSarah Control Center - Revenue OS",
        "status": "GREEN",
        "active_routes": ["Ollama Local", "Groq Free", "Gemini Free", "OpenRouter Free"],
        "admin": "niko.oeben@gmail.com",
        "tier": "elite",
        "limits_bypassed": True
    })

@app.route('/api/products/staging', methods=['GET'])
def get_staging_products():
    staging_path = f"{BASE_DIR}/modules/ai_health_influencer/config/staging_products.json"
    if os.path.exists(staging_path):
        with open(staging_path, "r", encoding="utf-8") as f:
            try:
                products = json.load(f)
                return jsonify({"status": "success", "products": products})
            except Exception as e:
                return jsonify({"status": "error", "message": str(e)}), 500
    return jsonify({"status": "success", "products": []})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    
    # Admin-Authentifizierung für Niko
    if email == "niko.oeben@gmail.com" and password == "Niko6529!!!!!":
        return jsonify({
            "status": "success",
            "role": "admin",
            "subscription_tier": "elite",
            "api_limit_bypassed": True,
            "access_token": "cyber_sarah_elite_token_niko_secure_2026",
            "message": "Willkommen zurück, Administrator Niko!"
        })
    return jsonify({"status": "error", "message": "Ungültige Anmeldedaten"}), 401

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
