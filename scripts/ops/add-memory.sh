#!/usr/bin/env bash
# Schafft Speicher (Disk + Swap) und zieht die App danach wieder hoch.
set -uo pipefail
cd /opt/cybersarah-control-center || exit 1

echo "== Ist-Zustand =="
free -m | head -3
df -h / | tail -1
swapon --show 2>/dev/null || echo "kein Swap"

echo "== Platz freigeben =="
npm cache clean --force > /dev/null 2>&1 && echo "npm-Cache geleert"
journalctl --vacuum-size=100M 2>&1 | tail -1
apt-get clean > /dev/null 2>&1 && echo "apt-Cache geleert"
pm2 flush > /dev/null 2>&1 && echo "PM2-Logs geleert"
docker builder prune -af 2>&1 | tail -1
find /tmp -maxdepth 1 -type f -mtime +3 -delete 2>/dev/null
echo "Platz jetzt: $(df -h / | tail -1 | awk '{print $4}') frei"

echo "== Swap erweitern =="
ensure_swap() {
  local file="$1" size="$2"
  if [ -f "$file" ] && swapon --show 2>/dev/null | grep -q "$file"; then
    echo "$file bereits aktiv"
    return 0
  fi
  if [ -f "$file" ]; then
    mkswap "$file" > /dev/null 2>&1 && swapon "$file" 2>/dev/null && { echo "$file aktiviert"; return 0; }
  fi
  local avail
  avail=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
  if [ "${avail:-0}" -lt 8 ]; then
    echo "zu wenig Platte fuer ${size} Swap (${avail} GB frei)"
    return 1
  fi
  fallocate -l "$size" "$file" 2>/dev/null || dd if=/dev/zero of="$file" bs=1M count=6144 status=none 2>/dev/null || return 1
  chmod 600 "$file"
  mkswap "$file" > /dev/null 2>&1 || return 1
  swapon "$file" 2>/dev/null || return 1
  grep -q "^$file" /etc/fstab 2>/dev/null || echo "$file none swap sw 0 0" >> /etc/fstab
  echo "$file (${size}) angelegt und aktiv"
}
ensure_swap /swapfile 4G
ensure_swap /swapfile2 6G
sysctl -w vm.swappiness=30 > /dev/null 2>&1
free -m | head -3

echo "== Groesste Verbraucher (nur Anzeige) =="
du -xh -d1 / 2>/dev/null | sort -h | tail -8

echo "== node_modules reparieren =="
NODE_OPTIONS=--max-old-space-size=2048 npm ci --include=dev --no-audit --no-fund > /tmp/ccc-npm.log 2>&1
NPM_STATUS=$?
echo "npm ci exit=$NPM_STATUS"
tail -4 /tmp/ccc-npm.log

if [ "$NPM_STATUS" -ne 0 ]; then
  echo "FEHLER: Installation weiterhin nicht moeglich"
  exit 1
fi

echo "== Build =="
npm run build > /tmp/ccc-build.log 2>&1
BUILD_STATUS=$?
echo "build exit=$BUILD_STATUS"
tail -5 /tmp/ccc-build.log

echo "== App starten =="
pm2 restart cybersarah-control-center --update-env > /dev/null 2>&1 || pm2 start ecosystem.config.cjs --update-env > /dev/null 2>&1
sleep 15
CODE=$(curl -s -o /tmp/ccc-health.json -w '%{http_code}' --max-time 10 http://localhost:3000/api/ready || echo 000)
echo "ready: $CODE"
head -c 300 /tmp/ccc-health.json 2>/dev/null; echo
tail -8 ~/.pm2/logs/cybersarah-control-center-error.log 2>/dev/null
echo "== Ende =="
free -m | head -3
df -h / | tail -1
