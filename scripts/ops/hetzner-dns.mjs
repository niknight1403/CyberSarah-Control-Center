#!/usr/bin/env node
/**
 * Setzt A-Records der Zone cybersarah-ki.com auf den CCC-Server.
 * Nutzt die Hetzner-DNS-API (Auth-API-Token). Aendert nur die Namen, die
 * ausdruecklich uebergeben werden; andere Records bleiben unangetastet.
 * Aufruf: node scripts/ops/hetzner-dns.mjs [--apply]
 */
const token = process.env.HETZNER_DNS_API_TOKEN || process.env.HETZNER_API_TOKEN;
const apply = process.argv.includes("--apply");
const ZONE = process.env.DNS_ZONE || "cybersarah-ki.com";
const TARGET = process.env.DNS_TARGET || "167.233.196.20";
const NAMES = ["@", "www"]; // ollama bleibt absichtlich auf dem anderen Host

if (!token) {
  console.log("FEHLER: kein DNS-Token in der Umgebung");
  process.exit(1);
}

const api = async (path, method = "GET", body) => {
  const res = await fetch(`https://dns.hetzner.com/api/v1${path}`, {
    method,
    headers: { "Auth-API-Token": token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* Rohantwort unten */ }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return json;
};

try {
  const zones = await api(`/zones?name=${encodeURIComponent(ZONE)}`);
  const zone = (zones.zones ?? []).find((entry) => entry.name === ZONE);
  if (!zone) {
    console.log(`Zone ${ZONE} nicht in der Hetzner-DNS-API gefunden (verfuegbar: ${(zones.zones ?? []).map((z) => z.name).join(", ") || "keine"})`);
    console.log("Das deutet auf Hetzner-Robot-DNS: Records muessen dort oder im Hetzner-DNS-Console gepflegt werden.");
    process.exit(2);
  }
  console.log(`Zone gefunden: ${zone.name} (id ${zone.id})`);

  const existing = (await api(`/records?zone_id=${zone.id}`)).records ?? [];
  console.log(`Records in der Zone: ${existing.length}`);
  for (const record of existing) {
    if (["A", "CNAME", "AAAA"].includes(record.type)) {
      console.log(`  ${record.type} ${record.name || "@"} -> ${record.value} (ttl ${record.ttl})`);
    }
  }

  for (const name of NAMES) {
    const current = existing.find(
      (record) => record.type === "A" && (record.name === name || (name === "@" && (record.name === "" || record.name === ZONE))),
    );
    if (current && current.value === TARGET) {
      console.log(`  ${name}: zeigt bereits auf ${TARGET}`);
      continue;
    }
    if (!apply) {
      console.log(`  ${name}: wuerde auf ${TARGET} gesetzt (Trockenlauf)`);
      continue;
    }
    if (current) {
      await api(`/records/${current.id}`, "PUT", {
        value: TARGET,
        ttl: current.ttl ?? 60,
        type: "A",
        name: current.name,
        zone_id: zone.id,
      });
      console.log(`  ${name}: ${current.value} -> ${TARGET} aktualisiert`);
    } else {
      await api(`/records`, "POST", {
        value: TARGET,
        ttl: 60,
        type: "A",
        name: name === "@" ? "@" : name,
        zone_id: zone.id,
      });
      console.log(`  ${name}: neu auf ${TARGET} angelegt`);
    }
  }
} catch (error) {
  console.log(`FEHLER: ${error.message}`);
  if (String(error.message).includes("401") || String(error.message).includes("403")) {
    console.log("Der vorhandene Token hat keine DNS-Rechte. Dann braucht es einen Hetzner-DNS-API-Token oder Robot-Zugang.");
  }
  process.exit(1);
}
