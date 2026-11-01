#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — Komplett-Reparatur (ein Befehl!)
# ═══════════════════════════════════════════════════════════════
# In die Hetzner Konsole einfügen und Enter drücken.
# ═══════════════════════════════════════════════════════════════
set -e

echo "🔧 CyberSarah Server-Reparatur gestartet..."

# 1. In Verzeichnis wechseln
cd /opt/cybersarah

# 2. Neuesten Code holen
echo "📥 Git pull..."
git pull origin main

# 3. .env synchronisieren
echo "⚙️  .env synchronisieren..."
cp .env artifacts/api-server/.env

# 4. Dependencies prüfen
echo "📦 Dependencies prüfen..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 5. Dashboard bauen
echo "🏗️  Dashboard bauen..."
cd artifacts/dashboard && pnpm install 2>/dev/null && pnpm run build 2>/dev/null || true
cd /opt/cybersarah

# 6. Nginx konfigurieren
echo "🌐 Nginx konfigurieren..."
cat > /etc/nginx/sites-available/cybersarah << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/cybersarah /etc/nginx/sites-enabled/cybersarah
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 7. PM2 Server neustarten
echo "🚀 Server neustarten..."
cd artifacts/api-server
pm2 delete cybersarah 2>/dev/null || true
pm2 start "node --import tsx src/index.ts" --name cybersarah --max-memory-restart 512M --time
pm2 save

# 8. Warten und prüfen
echo "⏳ Warte 8 Sekunden..."
sleep 8

echo ""
echo "═══════════════════════════════════════════════"
if curl -s http://localhost:3000/ | grep -q "<!DOCTYPE\|<html\|<head"; then
  echo "✅ SERVER LÄUFT! App ist erreichbar."
  echo "🌐 Öffne: http://167.233.196.20"
else
  echo "⚠️  Server startet noch — warte 10 Sekunden und prüfe erneut:"
  echo "   pm2 logs cybersarah --lines 20"
  echo "   curl http://localhost:3000/"
fi
echo "═══════════════════════════════════════════════"
