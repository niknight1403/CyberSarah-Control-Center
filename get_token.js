const fs = require('fs');
const https = require('https');

// TRAGE UNTEN IN DEN ANFÜHRUNGSZEICHEN DEINEN ECHTEN DASHBOARD-KEY EIN
const MASTER_KEY = "DEIN_ECHTER_API_KEY_AUS_DEM_DASHBOARD";

const data = JSON.stringify({
  name: "automatischer-token",
  description: "Generiert via Cybersarah Control Center"
});

const options = {
  hostname: 'api.koyeb.com',
  port: 443,
  path: '/v1/account/tokens',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${MASTER_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      if (json.token && json.token.value) {
        fs.writeFileSync('.env', `KOYEB_TOKEN="${json.token.value}"\n`, { flag: 'a' });
        console.log("✅ Erfolg! Der neue Token wurde in der .env gespeichert.");
      } else if (json.error) {
        console.log("❌ Fehler von Koyeb erhalten:", JSON.stringify(json.error));
      } else {
        console.log("❌ Unerwartete Antwort von Koyeb:", body.slice(0, 300));
      }
    } catch (e) {
      console.log("❌ Fehler beim Verarbeiten der Antwort:", body);
    }
  });
});

req.on('error', (error) => {
  console.error("❌ Netzwerkfehler:", error);
});

req.write(data);
req.end();
