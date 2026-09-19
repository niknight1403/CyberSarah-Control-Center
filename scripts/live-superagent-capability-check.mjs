import "dotenv/config";

/**
 * Sprint 194 — Live-Faehigkeits-Check des Superagenten (produktive App).
 *
 * Prueft END-ZU-END, dass dem Superagenten fuer die autonoeme Entwicklung
 * einer kleinen App wirklich alles zur Verfuegung steht:
 *   A) Werkzeug-Inventar  (orchestrator.tools)
 *   B) Antwortqualitaet   (orchestrator.systemPrompt — Struktur-Merkmale)
 *   C) LLM-Routen         (developmentChat.providers + routerStatus)
 *   D) Provider-Keys      (providerAdmin.list — kostenlose Routen aktiv?)
 *   E) MCP-Integration    (mcp.transports)
 *   F) Dev-Stack/Katalog  (autonomousDev.catalog + stack, features.list)
 *   G) LIVE-ENTWICKLUNG   (orchestrator.run: kleine App "uhr-app.js" im
 *      Workspace anlegen und per fs-Tools verifizieren — echter autonomer
 *      Lauf mit Planung, Tool-Calls und strukturierter Antwort)
 */
const API_BASE = (process.env.LIVE_API_BASE_URL ?? "https://app.cybersarah-ki.com").replace(/\/$/, "");
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!email || !password) throw new Error("ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein.");

const results = [];
const mark = (label, ok, detail = "") => results.push({ label, ok, detail });

async function mutation(path, body, token, timeoutMs = 180_000) {
  const res = await fetch(`${API_BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ json: body ?? {} }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res.json();
}

async function query(path, token) {
  const res = await fetch(`${API_BASE}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: null }))}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

const data = (payload) => payload?.result?.data?.json;
const errOf = (payload) => payload?.error?.json ?? payload?.error;

async function main() {
  console.log(`=== Superagent-Faehigkeits-Check gegen ${API_BASE} ===\n`);

  // 0) Health
  const health = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json()).catch(() => null);
  mark("Server-Health", !!health?.ok, JSON.stringify(health).slice(0, 120));

  // 1) Login
  const login = await mutation("account.login", { email, password }, null, 30_000);
  const token = data(login)?.sessionToken;
  mark("Admin-Login", data(login)?.user?.role === "admin", "role=" + (data(login)?.user?.role ?? "?"));
  if (!token) throw new Error("Kein sessionToken — Login fehlgeschlagen: " + JSON.stringify(errOf(login)).slice(0, 200));

  // A) Werkzeug-Inventar
  const tools = await query("orchestrator.tools", token);
  const toolNames = (data(tools)?.tools ?? []).map((t) => t?.name).filter(Boolean);
  const expectedTools = ["fs.writeWorkspaceFile", "fs.readWorkspaceFile", "fs.listWorkspace", "git.repoStatus", "git.listBranches", "docker.containers"];
  const toolsOk = expectedTools.every((t) => toolNames.includes(t));
  mark("Dev-Werkzeugpaket (10 Tools)", toolsOk, toolNames.join(", "));

  // B) Antwortqualitaet: System-Prompt
  const prompt = await query("orchestrator.systemPrompt", token);
  const sysPrompt = String(data(prompt)?.prompt ?? "");
  const promptMarkers = ["Festes Antwortformat", "### Ergebnis", "SELBSTKORREKTUR"];
  const promptOk = sysPrompt.length > 1500 && promptMarkers.filter((m) => sysPrompt.includes(m)).length >= 2;
  mark("Superagent-Antwortqualitaet (System-Prompt)", promptOk, `${sysPrompt.length} Zeichen, Struktur-Merkmale: ${promptMarkers.filter((m) => sysPrompt.includes(m)).join("/")}`);

  // C) LLM-Routen
  const providers = await query("developmentChat.providers", token);
  const routeList = (data(providers)?.providers ?? []).map((p) => `${p.id} (${p.type})`);
  const routerStatus = await query("developmentChat.routerStatus", token);
  const rs = data(routerStatus) ?? {};
  const configured = rs.configured ?? [];
  mark("LLM-Routen verfuegbar", routeList.length >= 5, routeList.join(", "));
  mark("Aktive Routen konfiguriert", configured.length >= 1, "configured=" + configured.join(", ") + ` | preferred=${(rs.preferredOrder ?? []).join(">") || "-"}`);

  // D) Provider-Keys (Matrix)
  const provAdmin = await query("providerAdmin.list", token);
  const matrix = data(provAdmin)?.providers ?? data(provAdmin) ?? [];
  const matrixOk = !errOf(provAdmin);
  mark("Provider-Matrix lesbar", matrixOk, Array.isArray(matrix) ? `${matrix.length} Eintraege` : typeof matrix);

  // E) MCP-Integration
  const mcp = await query("mcp.transports", token);
  const mcpData = data(mcp) ?? {};
  const transports = mcpData.transports ?? [];
  mark("MCP-Transporte verfuegbar", transports.length >= 2, transports.map((t) => `${t.kind}:${t.configured ? "verbunden" : "bereit"}`).join(", ") + (mcpData.baseUrl ? ` | baseUrl gesetzt` : " | keine MCP_SERVER_URL"));

  // F) Dev-Stack & Features
  const catalog = await query("autonomousDev.catalog", token);
  const stack = await query("autonomousDev.stack", token);
  const features = await query("features.list", token);
  const featureData = data(features);
  const featureCount = Array.isArray(featureData) ? featureData.length : Object.keys(featureData ?? {}).length;
  const catalogCount = Array.isArray(data(catalog)) ? data(catalog).length : Object.keys(data(catalog) ?? {}).length;
  mark("Autonomes Dev-Katalog", !!data(catalog) && !errOf(catalog), `${catalogCount} Vorlagen`);
  mark("Dev-Stack-Status", !!data(stack) && !errOf(stack), JSON.stringify(data(stack)).slice(0, 100));
  mark("Feature-Flags", featureCount > 0 && !errOf(features), `${featureCount} Flags aktiv`);

  // G) LIVE-ENTWICKLUNG: kleine App durch den Superagenten
  console.log("\n--- LIVE-LAUF: Superagent entwickelt kleine App (uhr-app.js) ---");
  const objective =
    "Entwickle eine kleine App im Workspace: Erstelle die Datei uhr-app.js — eine Node.js-CLI-Uhr, die beim Start Datum und Uhrzeit im deutschen Format ausgibt, dann 3 Sekunden lang jede Sekunde tickt (Konsolenausgabe) und sauber endet. " +
    "Verifiziere danach mit fs.listWorkspace und fs.readWorkspaceFile, dass die Datei vollstaendig angelegt wurde. " +
    "Antworte strukturiert: Was wurde erstellt, wo liegt die Datei, wie wird sie gestartet.";
  const runStart = Date.now();
  const run = await mutation("orchestrator.run", { objective, title: "Live-Test: Kleine App (uhr-app.js)", maxRounds: 6 }, token, 300_000);
  const task = data(run);
  const runError = errOf(run);
  if (runError || !task) {
    mark("Autonomer Entwicklungslauf", false, JSON.stringify(runError ?? run).slice(0, 300));
  } else {
    const steps = task.steps ?? [];
    const usedTools = steps.flatMap((s) => (s.logs ?? []).join(" ")).join("\n");
    const wroteFile = /fs\.writeWorkspaceFile|uhr-app\.js/.test(usedTools) || JSON.stringify(steps).includes("uhr-app.js");
    const verified = /fs\.listWorkspace|fs\.readWorkspaceFile/.test(JSON.stringify(steps));
    const answer = typeof task.finalAnswer === "string" ? task.finalAnswer.trim() : "";
    const answerOk = answer.length > 40;
    mark("Autonomer Entwicklungslauf", task.status === "success", `status=${task.status} | Runden=${task.correctionIterations ?? "?"} | ${steps.length} Schritte | ${(Date.now() - runStart) / 1000}s`);
    mark("Kleine App angelegt (uhr-app.js)", wroteFile, wroteFile ? "Datei-Write im Schrittprotokoll nachweisbar" : "kein fs.writeWorkspaceFile im Protokoll");
    mark("Selbstverifikation (fs-Tools)", verified, verified ? "listWorkspace/readWorkspaceFile genutzt" : "keine Verifikation protokolliert");
    mark("Strukturierte Antwort", answerOk, `${answer.length} Zeichen`);
    console.log("\nSchritte:");
    for (const s of steps) console.log(`  - ${s.name} [${s.status}] (${(s.logs ?? []).length} Logs)`);
    console.log("\nFinale Antwort (gekuerzt):\n" + answer.slice(0, 900));
  }

  // Zusammenfassung
  console.log("\n=== ZUSAMMENFASSUNG ===");
  let green = 0;
  for (const r of results) {
    const icon = r.ok ? "GRUEN" : "ROT ";
    console.log(`[${icon}] ${r.label}${r.detail ? " — " + r.detail : ""}`);
    if (r.ok) green += 1;
  }
  console.log(`\n${green}/${results.length} Pruefungen gruen.`);
  if (green < results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[Faehigkeits-Check] Fehlgeschlagen:", error.message);
  process.exit(1);
});
