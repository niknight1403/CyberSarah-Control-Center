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

describe("Villa-Fokus-Waechter: Hub-Ausfall vs. Konfigurationsfehler", () => {
  const workflow = readFileSync(".github/workflows/villa-focus-guard.yml", "utf8");

  it("wiederholt den Login bei voruebergehenden Stoerungen statt sofort rot zu werden", () => {
    expect(workflow).toContain('while [ "$attempt" -le 3 ]');
    expect(workflow).toContain("000|5??) ;;");
    expect(workflow).toContain('sleep $((attempt * 5))');
  });

  it("bricht bei 4xx sofort ab, damit Zugangsdatenfehler nicht untergehen", () => {
    expect(workflow).toContain("*) break ;;");
    expect(workflow).toContain("Hub-Login fehlgeschlagen (HTTP $LOGIN_CODE)");
  });

  it("beendet den Lauf bei nicht erreichbarem Hub mit Warnung statt mit Fehler", () => {
    // Netzwerkfehler (000) und Gateway-Fehler (5xx) sind eine Stoerung der
    // Hub-Instanz. VillaForge-Ops meldet die Erreichbarkeit; der Waechter
    // laeuft 15 Minuten spaeter wieder und darf nicht rot werden.
    expect(workflow).toContain('::warning::Hub nicht erreichbar (HTTP $LOGIN_CODE)');
    expect(workflow).toContain('if [ "$LOGIN_CODE" = "000" ] || [ "${LOGIN_CODE#5}" != "$LOGIN_CODE" ]; then');
    expect(workflow).toContain("raise SystemExit(0)");
  });

  it("unterscheidet auch beim Villen-Abruf Ausfall (Warnung) von echtem Fehler", () => {
    expect(workflow).toContain("if status == 0 or 500 <= status <= 599:");
    expect(workflow).toContain("Villenliste nicht lesbar ({status})");
  });

  it("erlaubt eine abweichende Hub-Basis-URL fuer Tests und Dry-Runs", () => {
    expect(workflow).toContain("base_url:");
    expect(workflow).toContain("HUB_BASE: ${{ inputs.base_url || 'https://hub.cybersarah-ki.com' }}");
    expect(workflow).toContain("BASE = os.environ.get('HUB_BASE'");
    expect(workflow).not.toContain("BASE = 'https://hub.cybersarah-ki.com'");
  });
});
