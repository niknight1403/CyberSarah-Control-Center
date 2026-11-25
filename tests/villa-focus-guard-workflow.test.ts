import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Villa-Fokus-Waechter workflow", () => {
  const workflow = readFileSync(".github/workflows/villa-focus-guard.yml", "utf8");

  it("liest die Hub-Login-Antwort defensiv statt mit einem JSON-Parser auf stdin", () => {
    // Ein Gateway-Fehler liefert HTML oder eine leere Antwort. Der fruehere
    // Einzeiler `json.load(sys.stdin)` brach dann mit einem Traceback ab und
    // verdeckte den eigentlichen HTTP-Fehler im Actions-Log.
    expect(workflow).not.toContain("json.load(sys.stdin)");
    expect(workflow).toContain('LOGIN_BODY="$(mktemp)"');
    expect(workflow).toContain("jq -r '.token // \"\"'");
  });

  it("meldet HTTP-Status und Antwortauszug, wenn der Login scheitert", () => {
    expect(workflow).toContain("-w '%{http_code}'");
    expect(workflow).toContain("Hub-Login fehlgeschlagen (HTTP $LOGIN_CODE)");
  });

  it("greift weiterhin nur ueber die oeffentliche Hub-API ein", () => {
    expect(workflow).toContain("FOCUS_IDS: '34,3'");
    expect(workflow).toContain("/orchestrate");
    expect(workflow).toContain("/stop");
    expect(workflow).not.toContain("render.com/deploy");
  });
});
