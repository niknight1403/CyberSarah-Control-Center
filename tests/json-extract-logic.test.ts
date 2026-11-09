import { describe, expect, it } from "vitest";

import { extractJsonObject } from "../lib/json-extract-logic";

describe("extractJsonObject – Grundformen", () => {
  it("parst ein plaines JSON-Objekt", () => {
    expect(extractJsonObject('{"ziel": "test", "schritt": 3}')).toEqual({
      ziel: "test",
      schritt: 3,
    });
  });

  it("findet das Objekt in umgebendem Text (z. B. LLM-Antwort)", () => {
    const raw = 'Hier ist das Ergebnis: {"ok": true, "wert": 42} Hoffe das hilft.';
    expect(extractJsonObject(raw)).toEqual({ ok: true, wert: 42 });
  });

  it("gibt null zurueck, wenn kein Objekt im Text steckt", () => {
    expect(extractJsonObject("kein json hier")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("   ")).toBeNull();
    expect(extractJsonObject("[1, 2, 3]")).toBeNull();
  });
});

describe("extractJsonObject – Strings und Verschachtelung", () => {
  it("beachtet Klammern in Strings nicht als Objektende", () => {
    expect(extractJsonObject('{"msg": "} { noch offen"}')).toEqual({
      msg: "} { noch offen",
    });
  });

  it("beachtet escapte Anfuehrungszeichen in Strings", () => {
    expect(extractJsonObject('{"msg": "er sagte \\"hi\\""}')).toEqual({
      msg: 'er sagte "hi"',
    });
  });

  it("parst verschachtelte Objekte und Arrays", () => {
    const raw = '{"a": {"b": [1, 2, {"c": null}]}, "d": false}';
    expect(extractJsonObject(raw)).toEqual({
      a: { b: [1, 2, { c: null }] },
      d: false,
    });
  });
});

describe("extractJsonObject – Fehlerfaelle", () => {
  it("gibt null zurueck bei ungueltigem JSON trotz ausbalancierter Klammern", () => {
    expect(extractJsonObject("{a: 1}")).toBeNull();
  });

  it("gibt null zurueck bei nicht geschlossenem Objekt", () => {
    expect(extractJsonObject('{"a": 1')).toBeNull();
    expect(extractJsonObject('{"a": {"b": 2}')).toBeNull();
  });
});
