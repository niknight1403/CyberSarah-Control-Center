#!/bin/bash
set -euo pipefail
DOMAIN="${1:-cybersarah.app}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq git curl gnupg2 build-essential postgresql nginx certbot python3-certbot-nginx ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y -qq nodejs
corepack enable 2>/dev/null || npm i -g pnpm
npm i -g pm2
[ -d /opt/cybersarah/.git ] && (cd /opt/cybersarah && git pull) || git clone https://github.com/niknight1403/cybersarah-revenue-os.git /opt/cybersarah
cd /opt/cybersarah
sudo -u postgres psql -c "CREATE USER cybersarah WITH PASSWORD 'cs$(openssl rand -hex 8)';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE cybersarah OWNER cybersarah;" 2>/dev/null || true
DB_URL=$(sudo -u postgres psql -t -c "SELECT 'postgres://cybersarah:' || rolpassword || '@localhost/cybersarah' FROM pg_authid WHERE rolname='cybersarah'" 2>/dev/null | tr -d ' ' || echo "postgres://cybersarah:cybersarah@localhost/cybersarah")
[ ! -s .env ] && cat > .env << ENV
PORT=8080
PUBLIC_APP_URL=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN
DATABASE_URL=$DB_URL
STRIPE_SECRET_KEY=sk_live_HIER_EINTRAGEN
OPENAI_API_KEY=sk-HIER_EINTRAGEN
API_AUTH_TOKEN=$(openssl rand -hex 32)
ENV
pnpm install --no-frozen-lockfile 2>&1 | tail -3
pnpm run build 2>&1 | tail -5 || true
pnpm run db:push 2>&1 | tail -3 || true
pm2 delete cybersarah 2>/dev/null || true
pm2 start "node artifacts/api-server/dist/index.mjs" --name cybersarah --max-memory-restart 512M --env production
pm2 save && pm2 startup 2>&1 | tail -1
cat > /etc/nginx/sites-available/cybersarah << NG
server { listen 80; server_name $DOMAIN www.$DOMAIN;
location /.well-known/acme-challenge/ { root /var/www/html; }
location /api/stripe/webhook { proxy_pass http://127.0.0.1:8080; proxy_set_header Host \$host; }
location /api/ { proxy_pass http://127.0.0.1:8080; proxy_read_timeout 300s; }
location / { proxy_pass http://127.0.0.1:5173; } }
NG
ln -sf /etc/nginx/sites-available/cybersarah /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl reload nginx
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
echo "=== DONE === nano /opt/cybersarah/.env dann: pm2 restart cybersarah"
pm2 status
