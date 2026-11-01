import { describe, expect, it } from "vitest";
import {
  buildEvaluationMessages,
  buildFunnelMessages,
  buildMarketplaceUrl,
  isValidProduct,
  parseDigistoreProducts,
  parseEvaluations,
  parseFunnel,
  type DigistoreProduct,
} from "../lib/digistore24-logic";

const validProduct: DigistoreProduct = {
  slug: "speed-reading-mastery",
  title: "Speed Reading Mastery",
  url: "https://www.digistore24.com/product/speed-reading-mastery/",
};

describe("Digistore24 affiliate engine: pure logic (parse, validate, prompt, funnel)", () => {
  it("liefert die Marketplace-URL des deutschen Katalogs", () => {
    expect(buildMarketplaceUrl()).toBe("https://www.digistore24.com/marketplace");
  });

  it("validiert Produkte nach Mindestanforderungen und kanonischer Produkt-URL", () => {
    expect(isValidProduct(validProduct)).toBe(true);
    // slug zu kurz / zu lang
    expect(isValidProduct({ ...validProduct, slug: "ab" })).toBe(false);
    expect(isValidProduct({ ...validProduct, slug: "x".repeat(201) })).toBe(false);
    // Titel zu kurz / zu lang
    expect(isValidProduct({ ...validProduct, title: "abc" })).toBe(false);
    expect(isValidProduct({ ...validProduct, title: "x".repeat(301) })).toBe(false);
    // Titel nur aus Leerraum zaehlt nicht
    expect(isValidProduct({ ...validProduct, title: "   " })).toBe(false);
    // Falsche Hosts/Pfade werden abgelehnt
    expect(isValidProduct({ ...validProduct, url: "http://www.digistore24.com/product/x/" })).toBe(false);
    expect(isValidProduct({ ...validProduct, url: "https://evil.example.com/product/x/" })).toBe(false);
    expect(isValidProduct({ ...validProduct, url: "https://www.digistore24.com/marketplace/x/" })).toBe(false);
    // Ohne www ist kanonisch erlaubt
    expect(isValidProduct({ ...validProduct, url: "https://digistore24.com/product/speed-reading-mastery" })).toBe(true);
  });

  it("parst Produkt-Links tolerant: relativ, Query-Strip, Tag-Bereinigung, Dedupe", () => {
    const html = `
      <div>
        <a href="/product/speed-reading-mastery?aff=me"> <strong>Speed <em>Reading</em> Mastery</strong> </a>
        <a href="https://www.digistore24.com/product/speed-reading-mastery/">Duplikat wird verworfen</a>
        <a href="https://evil.example.com/product/hostile-item">Fremdhost gefiltert</a>
        <a href="/product/ab">Zu kurzer Titel</a>
        <a href="/product/email-formel-2026">Die E-Mail-Formel 2026</a>
      </div>`;
    const products = parseDigistoreProducts(html);
    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({
      slug: "speed-reading-mastery",
      title: "Speed Reading Mastery",
      url: "https://www.digistore24.com/product/speed-reading-mastery",
    });
    expect(products[1].slug).toBe("email-formel-2026");
  });

  it("liefert ehrlich eine leere Liste, wenn das Marketplace-HTML keine Produkt-Links enthaelt", () => {
    expect(parseDigistoreProducts("<p>Wartungsarbeiten. Keine Produkte sichtbar.</p>")).toEqual([]);
  });

  it("begrenzt den Parse auf 60 Produkte pro Lauf", () => {
    const anchors = Array.from({ length: 70 }, (_, i) =>
      `<a href="/product/produkt-nummer-${i}">Produkt Nummer ${i}</a>`,
    ).join("\n");
    const products = parseDigistoreProducts(anchors);
    expect(products).toHaveLength(60);
    expect(products[0].slug).toBe("produkt-nummer-0");
    expect(products[59].slug).toBe("produkt-nummer-59");
  });

  it("baut den Bewertungs-Prompt fuer hoechstens 40 Produkte", () => {
    const many: DigistoreProduct[] = Array.from({ length: 55 }, (_, i) => ({
      slug: `slug-${i}`,
      title: `Titel ${i}`,
      url: `https://www.digistore24.com/product/slug-${i}`,
    }));
    const messages = buildEvaluationMessages(many);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("slug=slug-0");
    expect(messages[0].content).toContain("slug=slug-39");
    expect(messages[0].content).not.toContain("slug=slug-40");
    expect(messages[0].content).toContain("JSON-Array");
  });

  it("ueberfuehrt LLM-Antworten in geclampte, sortierte, gefilterte Bewertungen", () => {
    const products: DigistoreProduct[] = [
      validProduct,
      { slug: "email-formel-2026", title: "Die E-Mail-Formel 2026", url: "https://www.digistore24.com/product/email-formel-2026/" },
    ];
    const text = `Vorab ein Satz. [{"slug":"Email-Formel-2026","title":"","score":"88","reason":"Begruendung"},
      {"slug":"speed-reading-mastery","score":250,"reason":"zu hoch"},
      {"slug":"unbekanntes-produkt","score":90,"reason":"faellt raus"},
      {"slug":"email-formel-2026","score":"keine-zahl","reason":"faellt raus"},
      {"slug":"speed-reading-mastery","score":-30,"reason":"negativ"}] Nachsatz.`;
    const evaluations = parseEvaluations(text, products);
    expect(evaluations).toHaveLength(3);
    // Sortierung nach Score absteigend, Clamp auf 0..100
    expect(evaluations.map((e) => e.slug)).toEqual([
      "speed-reading-mastery", "email-formel-2026", "speed-reading-mastery",
    ]);
    expect(evaluations[0].score).toBe(100); // 250 geclampt
    expect(evaluations[1].score).toBe(88);
    expect(evaluations[1].title).toBe("Die E-Mail-Formel 2026"); // Fallback-Titel
    expect(evaluations[2].score).toBe(0); // -30 geclampt
  });

  it("liefert bei unbrauchbarer LLM-Antwort eine leere Bewertungsliste statt zu werfen", () => {
    const products = [validProduct];
    expect(parseEvaluations("kein json hier", products)).toEqual([]);
    expect(parseEvaluations('{"slug":"speed-reading-mastery"}', products)).toEqual([]);
    expect(parseEvaluations("[1, 2, null]", products)).toEqual([]);
  });

  it("baut den Funnel-Prompt produktspezifisch und JSON-fordernd", () => {
    const messages = buildFunnelMessages(validProduct);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain('"Speed Reading Mastery"');
    expect(messages[0].content).toContain("https://www.digistore24.com/product/speed-reading-mastery/");
    expect(messages[0].content).toContain('"stages"');
  });

  it("parst einen vollstaendigen Funnel inklusive Optionalfelder und Begrenzungen", () => {
    const longSubheadline = "s".repeat(300);
    const text = `Nur JSON: {"name":"E-Mail-Formel Launch","hypothesis":"Kleinunternehmer wollen bessere E-Mails",
      "headline":"Mehr Umsatz pro E-Mail","subheadline":"${longSubheadline}",
      "benefits":["Nutzen 1","", "Nutzen 2","Nutzen 3","Nutzen 4","Nutzen 5","Nutzen 6","Nutzen 7"],
      "ctaText":"Jetzt holen","audience":"Solo-Selbststaendige im DACH-Raum",
      "stages":["STAGE 1: Landingpage","STAGE 2: E-Mail-Sequenz","STAGE 3: Sales-Copy","STAGE 4: Traffic-Plan"],
      "metric":"Gemessen an: opt-ins pro 100 Besucher"} Fertig.`;
    const funnel = parseFunnel(text);
    expect(funnel).not.toBeNull();
    expect(funnel!.name).toBe("E-Mail-Formel Launch");
    expect(funnel!.stages).toHaveLength(4);
    expect(funnel!.benefits).toEqual(["Nutzen 1", "Nutzen 2", "Nutzen 3", "Nutzen 4", "Nutzen 5", "Nutzen 6"]);
    expect(funnel!.subheadline!.length).toBe(240);
    expect(funnel!.ctaText).toBe("Jetzt holen");
  });

  it("lehnt unvollstaendige oder unbrauchbare Funnel-Antworten ab", () => {
    const base = (over: Record<string, unknown>) =>
      JSON.stringify({
        name: "Valider Name", hypothesis: "Hypothese", stages: ["S1", "S2", "S3"], metric: "KPI", ...over,
      });
    expect(parseFunnel(base({ name: "abc" }))).toBeNull(); // Name zu kurz
    expect(parseFunnel(base({ hypothesis: "" }))).toBeNull();
    expect(parseFunnel(base({ stages: ["S1", "S2"] }))).toBeNull(); // unter 3 Stufen
    expect(parseFunnel(base({ metric: " " }))).toBeNull();
    expect(parseFunnel("gar kein JSON")).toBeNull();
    expect(parseFunnel('["array"]')).toBeNull();
    // Optionale Landing-Felder bleiben weg, wenn sie fehlen
    const minimal = parseFunnel(base({}));
    expect(minimal!.headline).toBeUndefined();
    expect(minimal!.benefits).toBeUndefined();
  });
});
