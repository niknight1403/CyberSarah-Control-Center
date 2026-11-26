import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verhaltens-Test fuer den Login-Block des Villa-Fokus-Waechters.
 *
 * Der Workflow unterscheidet seit dem 26.11.2026 zwischen einer voruebergehend
 * nicht erreichbaren Hub-Instanz (Netzwerk/5xx: Warnung, Lauf endet gruen) und
 * einem echten Konfigurations-/Zugangsdatenfehler (4xx: harter Fehler). Diese
 * Unterscheidung ist der eigentliche Zweck der Aenderung und wird hier gegen
 * den echten Shell-Block aus dem Workflow geprueft, nicht gegen eine Kopie.
 */

const workflow = readFileSync(".github/workflows/villa-focus-guard.yml", "utf8");

function extractLoginBlock(): string {
  const start = workflow.indexOf("          LOGIN_CODE=000");
  const end = workflow.indexOf("          export TOK");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return workflow
    .slice(start, end)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

const harness = (block: string) => `#!/usr/bin/env bash
set -u
SCENARIO="$1"
VF_HUB_EMAIL="ops@example.test"
VF_HUB_PASSWORD="secret"
HUB_BASE="https://hub.example.test"

curl() {
  local out="" prev=""
  for a in "$@"; do case "$prev" in -o) out="$a";; esac; prev="$a"; done
  case "$SCENARIO" in
    netfail) printf '000'; return 7;;
    gateway) [ -n "$out" ] && printf '<html>502 Bad Gateway</html>' > "$out"; printf '502'; return 0;;
    auth) [ -n "$out" ] && printf '{"error":"invalid credentials"}' > "$out"; printf '401'; return 0;;
    ok) [ -n "$out" ] && printf '{"token":"abc123"}' > "$out"; printf '200'; return 0;;
  esac
}
sleep() { :; }
jq() {
  local f="\${!#}" body=""
  body=$(cat "$f" 2>/dev/null || true)
  case "$body" in *'"token"'*) echo "abc123";; *) echo "";; esac
}

TOK=""
${block}
if [ -n "\${TOK}" ]; then echo "RESULT ok token=\${TOK}"; exit 0; fi
echo "RESULT hard-error"
exit 1
`;

function runScenario(scenario: string): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "villa-guard-"));
  const script = join(dir, "guard.sh");
  writeFileSync(script, harness(extractLoginBlock()), { mode: 0o755 });
  try {
    const out = execFileSync("bash", [script, scenario], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, out: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("Villa-Fokus-Waechter: Login-Verhalten bei Hub-Stoerungen", () => {
  it("gelingt bei erreichbarem Hub und liest das Token", () => {
    const result = runScenario("ok");
    expect(result.code).toBe(0);
    expect(result.out).toContain("RESULT ok token=abc123");
  });

  it("beendet den Lauf bei Netzwerkausfall gruen mit Warnung statt rot", () => {
    const result = runScenario("netfail");
    expect(result.code).toBe(0);
    expect(result.out).toContain("::warning::Hub nicht erreichbar (HTTP 000)");
  });

  it("versucht es bei einem Gateway-Fehler dreimal und warnt danach statt zu scheitern", () => {
    const result = runScenario("gateway");
    expect(result.code).toBe(0);
    expect(result.out).toContain("Login-Versuch 1/3: HTTP 502");
    expect(result.out).toContain("Login-Versuch 2/3: HTTP 502");
    expect(result.out).toContain("::warning::Hub nicht erreichbar (HTTP 502)");
    expect(result.out).not.toContain("Login-Versuch 3/3");
  });

  it("scheitert bei falschen Zugangsdaten sofort und ohne Wiederholung", () => {
    const result = runScenario("auth");
    expect(result.code).toBe(1);
    expect(result.out).toContain("Hub-Login fehlgeschlagen (HTTP 401)");
    expect(result.out).not.toContain("Login-Versuch 2/3");
  });
});
