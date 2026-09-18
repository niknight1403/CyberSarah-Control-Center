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
