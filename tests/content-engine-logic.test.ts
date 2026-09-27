import { describe, expect, it } from "vitest";
import { buildArticleOutline, clusterKeywords, contentBatchStatus, planContentBatch, seoMetaCheck } from "../modules/content-engine/content-engine-logic";

describe("Content-Engine", () => {
  it("cluster Keywords nach Stem und filtert Stop-Words", () => {
    const clusters = clusterKeywords(["QR Code Generator", "qr scanner app", "Rechnung Rechner"]);
    expect(clusters.find((c) => c.stem === "qr")?.keywords.length).toBe(2);
    expect(clusters.some((c) => c.stem === "der")).toBe(false);
  });

  it("plant einen deterministischen 7-Tage-Kalender", () => {
    const plan = planContentBatch(["qr generator", "rechnung rechner"], new Date("2026-09-25T00:00:00Z"), 7);
    expect(plan).toHaveLength(7);
    expect(plan[0].isoDate).toBe("2026-09-25");
    expect(plan[6].isoDate).toBe("2026-10-01");
    expect(plan[0].primaryKeyword).toBe("qr generator");
  });

  it("outline enthaelt H2-Struktur und Keyword", () => {
    const outline = buildArticleOutline("qr generator", ["qr generator", "qr scanner"]);
    expect(outline.length).toBeGreaterThanOrEqual(5);
    expect(outline.some((line) => line.includes("Verwandte"))).toBe(true);
  });

  it("SEO-Meta-Check prueft Laengen und Keyword-Abdeckung", () => {
    const good = seoMetaCheck("QR Code Generator kostenlos online erstellen in 30 Sekunden", "x".repeat(130), "qr code generator");
    const bad = seoMetaCheck("Kurz", "kurz", "qr");
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.keywordInTitle).toBe(true);
  });

  it("Batch-Status: gruen erst bei null offenen Drafts", () => {
    expect(contentBatchStatus(["approved", "approved"]).status).toBe("green");
    expect(contentBatchStatus(["approved", "pending"]).status).toBe("yellow");
    expect(contentBatchStatus(["rejected", "rejected"]).status).toBe("yellow");
    expect(contentBatchStatus([]).status).toBe("red");
  });
});
