import { describe, it, expect } from "vitest";
import { resolveResendConfig } from "../lib/email-logic";

describe("resolveResendConfig", () => {
  it("ist ohne Variablen ehrlich nicht konfiguriert", () => {
    const config = resolveResendConfig({});
    expect(config.configured).toBe(false);
    expect(config.apiKey).toBeNull();
    expect(config.from).toBeNull();
    expect(config.issues.join(" ")).toContain("RESEND_API_KEY fehlt");
    expect(config.issues.join(" ")).toContain("Absenderadresse fehlt");
  });

  it("akzeptiert RESEND_FROM_EMAIL", () => {
    const config = resolveResendConfig({ RESEND_API_KEY: "re_abc", RESEND_FROM_EMAIL: "team@cybersarah-ki.com" });
    expect(config.configured).toBe(true);
    expect(config.fromSource).toBe("RESEND_FROM_EMAIL");
    expect(config.issues).toEqual([]);
  });

  it("akzeptiert OUTREACH_FROM_ADDRESS als zweiten Namen", () => {
    const config = resolveResendConfig({ RESEND_API_KEY: "re_abc", OUTREACH_FROM_ADDRESS: "team@cybersarah-ki.com" });
    expect(config.configured).toBe(true);
    expect(config.fromSource).toBe("OUTREACH_FROM_ADDRESS");
  });

  it("bevorzugt RESEND_FROM_EMAIL und meldet Widerspruch", () => {
    const config = resolveResendConfig({
      RESEND_API_KEY: "re_abc",
      RESEND_FROM_EMAIL: "team@cybersarah-ki.com",
      OUTREACH_FROM_ADDRESS: "alt@cybersarah-ki.com",
    });
    expect(config.from).toBe("team@cybersarah-ki.com");
    expect(config.issues.join(" ")).toContain("unterscheiden sich");
  });

  it("meldet einen falschen Schluessel und eine unbrauchbare Adresse", () => {
    const config = resolveResendConfig({ RESEND_API_KEY: "sk_live_123", RESEND_FROM_EMAIL: "keine-mail" });
    expect(config.configured).toBe(false);
    expect(config.issues.join(" ")).toContain("re_…");
    expect(config.issues.join(" ")).toContain("keine gueltige E-Mail-Adresse");
  });

  it("warnt bei Test-Absendern ohne eigene Domain", () => {
    const config = resolveResendConfig({ RESEND_API_KEY: "re_abc", RESEND_FROM_EMAIL: "onboarding@resend.dev" });
    expect(config.configured).toBe(false);
    expect(config.issues.join(" ")).toContain("verifizierte Domain");
  });
});
