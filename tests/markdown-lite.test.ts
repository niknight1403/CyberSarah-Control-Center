import { describe, expect, it } from "vitest";

import {
  isTableSeparator,
  parseInlineSpans,
  parseMarkdownLite,
  stripLatex,
} from "../lib/markdown-lite";

describe("Sprint 138 — Markdown-Lite-Parser", () => {
  it("entfernt LaTeX-Delimiter und -Befehle", () => {
    expect(stripLatex("\\[29,99 \\times 0{,}15\\]")).toBe("29,99 · 0{,}15");
    expect(stripLatex("\\text{Rabatt}")).toBe("Rabatt");
    expect(stripLatex("\\frac{a}{b}")).toBe("(a)/(b)");
  });

  it("zerlegt Fett/Kursiv/Monospace in Spans", () => {
    const spans = parseInlineSpans("Normal **fett** und `mono`");
    expect(spans.map((s) => s.text)).toEqual(["Normal ", "fett", " und ", "mono"]);
    expect(spans[1].bold).toBe(true);
    expect(spans[3].mono).toBe(true);
  });

  it("erkennt Tabellen-Trennzeilen", () => {
    expect(isTableSeparator("|---|---|")).toBe(true);
    expect(isTableSeparator("| Schritt | Was tun |")).toBe(false);
  });

  it("parst Header, Bullets und Code-Bloecke", () => {
    const blocks = parseMarkdownLite("## Titel\n- Punkt **wichtig**\n```python\nprint(1)\n```");
    expect(blocks[0]).toMatchObject({ type: "header" });
    expect(blocks[1]).toMatchObject({ type: "bullet" });
    expect(blocks[2]).toMatchObject({ type: "code", code: "print(1)" });
  });

  it("parst Tabellenzeilen und laesst Trennzeilen weg", () => {
    const blocks = parseMarkdownLite("| Schritt | Ergebnis |\n|---|---|\n| 1 | OK |");
    expect(blocks.filter((b) => b.type === "tableRow")).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "tableRow", cells: ["Schritt", "Ergebnis"], header: true });
    expect(blocks[1]).toMatchObject({ type: "tableRow", cells: ["1", "OK"], header: false });
  });

  it("uebernimmt normalen FliessText als Paragraph", () => {
    expect(parseMarkdownLite("Einfacher Satz.")[0].type).toBe("paragraph");
  });
});
