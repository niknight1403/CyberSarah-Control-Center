#!/usr/bin/env node
/**
 * Prueft die Hetzner-Cloud-Firewall des Produktionsservers und oeffnet bei
 * Bedarf Port 80 und 443. Bestehende Regeln (inklusive SSH) bleiben erhalten,
 * weil die neuen Regeln an die vorhandene Liste angehaengt werden.
 * Aufruf: node scripts/ops/hetzner-fw.mjs [--apply]
 */
const token = process.env.HETZNER_API_TOKEN;
const apply = process.argv.includes("--apply");
const TARGET_IP = process.env.TARGET_IP || "167.233.196.20";

if (!token) {
  console.log("FEHLER: HETZNER_API_TOKEN fehlt in der Umgebung");
  process.exit(1);
}

const api = async (path, method = "GET", body) => {
  const res = await fetch(`https://api.hetzner.cloud/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json.error ?? json)}`);
  return json;
};

try {
  const servers = (await api("/servers")).servers ?? [];
  const server = servers.find((entry) => entry.public_net?.ipv4?.ip === TARGET_IP);
  if (!server) {
    console.log(`FEHLER: kein Server mit IP ${TARGET_IP} im Projekt`);
    process.exit(1);
  }
  console.log(`Server: ${server.name} (id ${server.id}), Status ${server.status}`);

  const firewalls = (await api("/firewalls")).firewalls ?? [];
  const relevant = firewalls.filter((fw) =>
    (fw.applied_to ?? []).some((a) => a.type === "server" && a.server?.id === server.id),
  );
  console.log(`Firewalls insgesamt: ${firewalls.length}, auf diesem Server: ${relevant.length}`);

  if (relevant.length === 0) {
    console.log("Keine Cloud-Firewall aktiv: der Block kommt dann vom Host (ufw/iptables) oder aus einem anderen Netzfilter.");
  }

  for (const fw of relevant) {
    const rules = fw.rules ?? [];
    console.log(`\nFirewall "${fw.name}" (id ${fw.id}) mit ${rules.length} Regeln:`);
    for (const rule of rules) {
      console.log(`  ${rule.direction} ${rule.protocol}/${rule.port ?? "-"} von ${(rule.source_ips ?? []).join(",") || "-"}`);
    }

    const missing = ["80", "443"].filter(
      (port) =>
        !rules.some(
          (rule) =>
            rule.direction === "in" &&
            rule.protocol === "tcp" &&
            String(rule.port) === port &&
            (rule.source_ips ?? []).includes("0.0.0.0/0"),
        ),
    );

    if (missing.length === 0) {
      console.log("  -> 80 und 443 sind bereits offen");
      continue;
    }

    console.log(`  -> fehlt: ${missing.join(", ")}`);
    const nextRules = [
      ...rules,
      ...missing.map((port) => ({
        direction: "in",
        protocol: "tcp",
        port,
        source_ips: ["0.0.0.0/0", "::/0"],
        description: `${port === "80" ? "HTTP" : "HTTPS"} (autonom geoeffnet)`,
      })),
    ];

    if (!apply) {
      console.log("  -> Trockenlauf, keine Aenderung");
      continue;
    }

    await api(`/firewalls/${fw.id}/actions/set_rules`, "POST", { rules: nextRules });
    const after = await api(`/firewalls/${fw.id}`);
    const summary = (after.firewall?.rules ?? []).map((rule) => `${rule.protocol}/${rule.port ?? "-"}`).join(" ");
    console.log(`  -> gesetzt, Regeln jetzt: ${summary}`);
  }
} catch (error) {
  console.log(`FEHLER: ${error.message}`);
  process.exit(1);
}
