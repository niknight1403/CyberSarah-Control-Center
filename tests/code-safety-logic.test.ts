import { describe, expect, it } from "vitest";

import { buildCodeIndex, findSymbolsForQuery, guardFileWrite } from "../lib/code-safety-logic";

describe("write guard (Sprint 270)", () => {
  it("lehnt kaputtes JSON mit behebbarem Fehler ab", () => {
    const result = guardFileWrite("data/settings.json", "{ kaputt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Ungültiges JSON");
      expect(result.fixHint).toContain("korrigieren");
    }
    expect(guardFileWrite("data/settings.json", '{"a":1}').ok).toBe(true);
  });

  it("lehnt unausgeglichene Klammern in Code ab, ignoriert Strings/Kommentare", () => {
    expect(guardFileWrite("src/a.ts", "function f( { return 1; }").ok).toBe(false);
    const ok = guardFileWrite("src/a.ts", '// klammer ( im Kommentar\nconst s = "}"; const t = `(`;\nfunction f() { return 1; }');
    expect(ok.ok).toBe(true);
  });

  it("verweigert offensichtliche Geheimnisse immer", () => {
    // Testwert wird zur Laufzeit zusammengesetzt: Im Quelltext steht absichtlich
    // kein vollstaendiger Stripe-Schluessel (GitHub Push Protection faelschlich sonst).
    const fakeStripeKey = "sk_live_" + "AbCdEfGh1234567890AbCdEf";
    expect(guardFileWrite("src/keys.ts", `const k = "${fakeStripeKey}";`).ok).toBe(false);
    expect(guardFileWrite("notes/key.txt", "-----BEGIN RSA PRIVATE KEY-----\nabc").ok).toBe(false);
    expect(guardFileWrite("src/ok.ts", 'const url = "https://api.example.com";').ok).toBe(true);
  });

  it("weigert Binär-, Riesen- und pfadlose Dateien ab", () => {
    expect(guardFileWrite("img.png", "a\0b").ok).toBe(false);
    expect(guardFileWrite("", "abc").ok).toBe(false);
    expect(guardFileWrite("big.ts", "x".repeat(1_000_001)).ok).toBe(false);
  });
});

describe("code index (Sprint 270)", () => {
  it("indiziert exportierte Symbole begrenzt", () => {
    const files = [{ path: "lib/a.ts", content: "export function alpha() {}\nexport const beta = 1;\nexport type Gamma = string;" }];
    const index = buildCodeIndex(files);
    expect(index.symbols.length).toBe(3);
    expect(index.fileCount).toBe(1);
    expect(index.truncated).toBe(false);
  });

  it("findet Symbole fuer Fragen (kontextstarke Suche)", () => {
    const index = buildCodeIndex([
      { path: "lib/billing.ts", content: "export function buildInvoice() {}" },
      { path: "lib/mail.ts", content: "export function sendInvoiceMail() {}" },
    ]);
    const hits = findSymbolsForQuery(index, "invoice");
    expect(hits.map((hit) => hit.name)).toEqual(["buildInvoice", "sendInvoiceMail"]);
    expect(findSymbolsForQuery(index, "ab")).toEqual([]);
  });
});
