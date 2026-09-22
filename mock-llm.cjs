// Lokaler OpenAI-kompatibler Mock-LLM für Live-Tests (keine echten API-Calls).
// Szenarien: "LEGACY" im Prompt → alte JSON-Antwort; "ESCALIEREN" → Status-Marker;
// sonst klare deutsche Textantwort.
const http = require("http");

function completion(content) {
  return {
    id: "mock-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

const server = http.createServer((req, res) => {
  const url = req.url || "";
  if (req.method === "GET" && url.endsWith("/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model" }] }));
    return;
  }
  if (req.method === "POST" && url.endsWith("/chat/completions")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let prompt = "";
      try {
        const parsed = JSON.parse(body);
        prompt = (parsed.messages || []).map((m) => m.content || "").join(" ");
      } catch {}
      // Sprint 194 — Live-Faehigkeits-Check: echtes Tool-Szenario. Enthaelt
      // der Prompt ein uhr-app-Ziel UND Tools, wird zuerst autonom der
      // fs.writeWorkspaceFile-Tool-Call ausgegeben; nach dem Tool-Result
      // (role "tool" im Verlauf) folgt die strukturierte finale Antwort.
      let parsedTools = [];
      let toolResultCount = 0;
      try {
        const parsed = JSON.parse(body);
        parsedTools = parsed.tools || [];
        toolResultCount = (parsed.messages || []).filter((m) => m.role === "tool").length;
      } catch {}
      if (prompt.includes("uhr-app") && Array.isArray(parsedTools) && parsedTools.length > 0 && toolResultCount === 0) {
        const args = {
          path: "uhr-app.js",
          content:
            "// Kleine App: CLI-Uhr im deutschen Format (Sprint 194 Live-Test)\n" +
            "const DE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'medium' });\n" +
            "let ticks = 0;\n" +
            "const timer = setInterval(() => {\n" +
            "  console.log(DE.format(new Date()));\n" +
            "  if (++ticks >= 3) { clearInterval(timer); console.log('Uhr beendet.'); }\n" +
            "}, 1000);\n",
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "mock-" + Date.now(),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "mock-model",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call-uhr-1", type: "function", function: { name: "fs.writeWorkspaceFile", arguments: JSON.stringify(args) } }],
            },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 40, completion_tokens: 60, total_tokens: 100 },
        }));
        return;
      }
      if (prompt.includes("uhr-app") && toolResultCount === 1) {
        // Verifikationsrunde: autonomes Nachpruefen mit fs.listWorkspace.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "mock-" + Date.now(),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "mock-model",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call-uhr-2", type: "function", function: { name: "fs.listWorkspace", arguments: JSON.stringify({}) } }],
            },
            finish_reason: "tool_calls",
          }],
          usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
        }));
        return;
      }
      if (prompt.includes("uhr-app") && toolResultCount >= 2) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(completion(
          "### Ergebnis\nDie kleine App uhr-app.js wurde erfolgreich im Workspace angelegt.\n\n" +
          "### Was ich getan habe\n- Datei uhr-app.js mit einer CLI-Uhr (deutsches Datums-/Zeitformat, 3 Sekunden-Ticker, sauberes Ende) erstellt\n- Anlage im Workspace per fs.writeWorkspaceFile verifiziert\n\n" +
          "### Naechste Schritte\n- Start mit: node uhr-app.js"
        )));
        return;
      }

      let content;
      if (prompt.includes("LEGACY-JSON")) {
        content = '{"status":"success","summary":"Ich habe den Repository-Status geprueft.","steps":["Repo geprueft","Branches gelesen"],"result":"main ist aktuell"}';
      } else if (prompt.includes("ESCALIEREN")) {
        content = "Ich konnte die Aufgabe nicht abschließen, weil der externe Dienst nicht erreichbar war. Ich habe zwei Versuche unternommen.\nSTATUS: escalated";
      } else {
        content = "Alles erledigt: Ich habe den Repository-Status geprüft und die offenen Pull Requests geladen. Der main-Branch ist aktuell, es gibt keine offenen PRs. Als nächster Schritt empfehle ich, die neueste Version zu deployen.";
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(completion(content)));
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(1234, "127.0.0.1", () => console.log("MOCK_LLM_READY on 1234"));
