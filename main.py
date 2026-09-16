"""CyberSarah Control Center — FastAPI-Backend (Render: uvicorn main:app).

Der alte Ollama-Demo-Client wurde durch die produktive Backend-App
ersetzt (Sprint: Backend-Implementierung). Konfiguration laeuft
vollstaendig ueber Umgebungsvariablen (siehe backend/config.py und
render.yaml).
"""

from backend.app import create_app

app = create_app()
