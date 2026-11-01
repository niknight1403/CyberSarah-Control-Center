#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Firebase Setup Script — CyberSarah Revenue OS
# ═══════════════════════════════════════════════════════════════════════════════
# Führt aus:
#   1. google-services.json aus .env generieren (FALLBACK für Entwicklung)
#   2. Firebase Admin SDK für Backend konfigurieren
#   3. Prüft ob Firebase-Projekt korrekt verbunden ist
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "=== CyberSarah Firebase Setup ==="
echo ""

# Prüfe ob Firebase-Projekt-ID gesetzt ist
PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
if [ -z "$PROJECT_ID" ]; then
    echo "⚠️  FIREBASE_PROJECT_ID nicht gesetzt."
    echo ""
    echo "Um Firebase Push Notifications zu aktivieren:"
    echo "  1. Gehe zu https://console.firebase.google.com"
    echo "  2. Erstelle ein neues Projekt oder wähle bestehendes"
    echo "  3. Füge Android-App hinzu (Paketname: com.cybersarah.app)"
    echo "  4. Lade google-services.json herunter"
    echo "  5. Kopiere nach: android/app/google-services.json"
    echo "  6. Setze Umgebungsvariablen:"
    echo "     FIREBASE_PROJECT_ID=dein-project-id"
    echo "     FIREBASE_CLIENT_EMAIL=firebase-adminsdk@dein-project.iam.gserviceaccount.com"
    echo "     FIREBASE_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----...'"
    echo ""
    echo "⚠️  Ohne Firebase-Konfiguration läuft die App im Offline-Modus."
    echo "   Push-Benachrichtigungen bleiben deaktiviert."
    echo ""
    
    # Erstelle Platzhalter für Entwicklung
    if [ ! -f "android/app/google-services.json" ]; then
        cat > android/app/google-services.json << 'JSONEOF'
{
  "project_info": {
    "project_number": "000000000000",
    "project_id": "PLATZHALTER-FIREBASE-PROJEKT",
    "storage_bucket": "PLATZHALTER.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:000000000000:android:0000000000000000",
        "android_client_info": {
          "package_name": "com.cybersarah.app"
        }
      },
      "oauth_client": [],
      "api_key": [
        {
          "current_key": "PLATZHALTER-FIREBASE-API-KEY"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": []
        }
      }
    }
  ],
  "configuration_version": "1"
}
JSONEOF
        echo "✅ Platzhalter google-services.json erstellt"
        echo "⚠️  Ersetze durch echte Firebase-Datei für Produktion!"
    fi
    exit 0
fi

# Firebase Admin SDK Service Account prüfen
CLIENT_EMAIL="${FIREBASE_CLIENT_EMAIL:-}"
PRIVATE_KEY="${FIREBASE_PRIVATE_KEY:-}"

if [ -n "$CLIENT_EMAIL" ] && [ -n "$PRIVATE_KEY" ]; then
    echo "✅ Firebase Admin SDK konfiguriert"
    echo "   Project ID: $PROJECT_ID"
    echo "   Client Email: $CLIENT_EMAIL"
else
    echo "⚠️  Firebase Admin SDK unvollständig konfiguriert"
    echo "   Setze FIREBASE_CLIENT_EMAIL und FIREBASE_PRIVATE_KEY"
fi

# google-services.json existiert?
if [ -f "android/app/google-services.json" ]; then
    if grep -q "PLATZHALTER" android/app/google-services.json; then
        echo "⚠️  google-services.json ist noch ein Platzhalter!"
        echo "   Ersetze durch echte Firebase-Konfiguration"
    else
        echo "✅ google-services.json vorhanden"
    fi
else
    echo "⚠️  google-services.json fehlt!"
    echo "   Lade von Firebase Console herunter"
fi

echo ""
echo "=== Firebase Setup abgeschlossen ==="
