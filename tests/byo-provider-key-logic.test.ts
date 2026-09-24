/**
 * Sprint 304 — Tests fuer BYO-Key-Verwaltung.
 */
import { describe, it, expect } from "vitest";
import {
  validateByoKey,
  maskKey,
  createKeyEntry,
  verificationState,
} from "@/lib/byo-provider-key-logic";

const HF_KEY = "hf_" + "A".repeat(30);
const GROQ_KEY = "gsk_" + "B".repeat(30);

describe("Sprint 304 — BYO Provider Key Logic", () => {
  it("akzeptiert formatkorrekte Keys je Anbieter", () => {
    expect(validateByoKey("huggingface", HF_KEY).valid).toBe(true);
    expect(validateByoKey("groq", GROQ_KEY).valid).toBe(true);
    expect(validateByoKey("gemini", "AIza" + "C".repeat(30)).valid).toBe(true);
  });

  it("lehnt Keys mit falschem Praefix fuer den Anbieter ab", () => {
    const r = validateByoKey("groq", HF_KEY);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("Groq");
  });

  it("lehnt leere Keys ab; Trimmt Leading/Trailing-Spaces", () => {
    expect(validateByoKey("huggingface", "   ").valid).toBe(false);
    expect(validateByoKey("huggingface", "  " + HF_KEY + "  ").valid).toBe(true);
  });

  it("lehnt innere Leerzeichen im Key ab", () => {
    expect(validateByoKey("huggingface", HF_KEY.slice(0, 6) + " " + HF_KEY.slice(7)).valid).toBe(false);
  });

  it("maskiert Keys mit ersten 4 und letzten 4 Zeichen", () => {
    const masked = maskKey(HF_KEY);
    expect(masked.startsWith("hf_A")).toBe(true);
    expect(masked.endsWith("AAAA")).toBe(true);
    expect(masked).not.toContain(HF_KEY.slice(4, 20));
  });

  it("voll verschleiert kurze Keys (keine Teiloffenlegung)", () => {
    expect(maskKey("abc")).toBe("•••");
    expect(maskKey("12345678")).toBe("••••••••");
  });

  it("speichert nur die Maske im Eintrag", () => {
    const entry = createKeyEntry("huggingface", HF_KEY, "", 1000, "k1");
    expect(entry.maskedKey).not.toContain(HF_KEY.slice(4, -4));
    expect(entry.label).toBe("Hugging Face");
    expect(entry.lastVerifiedAt).toBeNull();
  });

  it("verificationState: ungetestet vs verifiziert vs alt", () => {
    const entry = createKeyEntry("huggingface", HF_KEY, "Mein Key", 0, "k1");
    expect(verificationState(entry, 1000).state).toBe("ungetestet");
    const verified = { ...entry, lastVerifiedAt: 1000 };
    expect(verificationState(verified, 2000).state).toBe("verifiziert");
    expect(verificationState(verified, 1000 + 40 * 86_400_000).state).toBe("alt");
  });
});
