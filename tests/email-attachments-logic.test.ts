import { describe, it, expect } from "vitest";
import {
  validateAttachments,
  renderTemplate,
  reviseTemplate,
  appendAttachmentNotice,
  EMAIL_ATTACHMENT_LIMITS,
} from "@/lib/email-attachments-logic";

const att = (over: Record<string, unknown> = {}) => ({
  filename: "a.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1000,
  ...over,
});

describe("Sprint 334 — E-Mail v2: Anhaenge", () => {
  it("gueltige Anhaenge passieren, Regeln bleiben lesbar", () => {
    const r = validateAttachments([att(), att({ filename: "b.png", mimeType: "image/png" })]);
    expect(r.ok).toBe(true);
    expect(EMAIL_ATTACHMENT_LIMITS.maxCount).toBe(10);
  });

  it("zu viele, zu grosse, falsche Typen werden je beim Namen genannt", () => {
    const many = Array.from({ length: 11 }, () => att());
    const r = validateAttachments([...many, att({ filename: "exe", mimeType: "application/x-exe" }), att({ filename: "huge.pdf", sizeBytes: 26 * 1024 * 1024 })]);
    expect(r.ok).toBe(false);
    const issues = r.issues.map((i) => i.issue);
    expect(issues).toContain("zu viele anhaenge");
    expect(issues).toContain("typ nicht erlaubt");
    expect(issues).toContain("datei zu gross");
    expect(r.issues.find((i) => i.issue === "typ nicht erlaubt")?.file).toBe("exe");
  });

  it("Gesamtgroesse ueber Limit wird erkannt", () => {
    const files = Array.from({ length: 3 }, () => att({ sizeBytes: 20 * 1024 * 1024 }));
    expect(validateAttachments(files).issues.map((i) => i.issue)).toContain("gesamt zu gross");
  });
});

describe("Sprint 334 — E-Mail v2: Vorlagen", () => {
  it("rendern ersetzt bekannte Platzhalter, unbekannte bleiben sichtbar", () => {
    const tpl = { id: "t1", version: 1, subject: "Hallo {{name}}", body: "Dein Code: {{code}} / {{fehlt}}" };
    const r = renderTemplate(tpl, { name: "Ada", code: "42" });
    expect(r.subject).toBe("Hallo Ada");
    expect(r.body).toContain("Dein Code: 42");
    expect(r.body).toContain("[unbekannt: fehlt]");
    expect(r.unknownPlaceholders).toEqual(["fehlt"]);
  });

  it("Revision erzeugt neue Version statt stillem Ueberschreiben", () => {
    const tpl = { id: "t1", version: 3, subject: "alt", body: "alt" };
    const v4 = reviseTemplate(tpl, "neu", "neuer Body");
    expect(v4.version).toBe(4);
    expect(tpl.version).toBe(3);
  });

  it("Anhangs-Notice listet Namen, Grosse, Typ — ohne Inline-Inhalt", () => {
    const body = appendAttachmentNotice("Text", [att(), att({ filename: "b.png", mimeType: "image/png", sizeBytes: 2048 })]);
    expect(body).toContain("Anhaenge:");
    expect(body).toContain("a.pdf (application/pdf");
    expect(body).toContain("2.0 KiB");
  });
});
