import { describe, it, expect } from "vitest";
import {
  AI_INFLUENZA_OUTREACH_SEQUENCE,
  OUTREACH_BODY_MAX_CHARS,
  nextOutreachStep,
  renderOutreachStep,
  validateOutreachSequence,
} from "../lib/ai-influenza-outreach-sequence";

const vollstaendig = {
  vorname: "Niko",
  firma: "Musterbau GmbH",
  befund: "Euer letztes Video ist vom Mai, euer Blog seit Juni unveraendert.",
  absender: "Sarah",
  abmelde_link: "https://app.cybersarah-ki.com/abmelden?t=abc",
};

describe("AI_INFLUENZA_OUTREACH_SEQUENCE", () => {
  it("haelt alle eigenen Regeln ein", () => {
    expect(validateOutreachSequence()).toEqual([]);
  });

  it("hat drei Schritte mit aufsteigendem Abstand", () => {
    expect(AI_INFLUENZA_OUTREACH_SEQUENCE.map((step) => step.id)).toEqual(["erstkontakt", "befund", "abschluss"]);
    expect(AI_INFLUENZA_OUTREACH_SEQUENCE.map((step) => step.dayOffset)).toEqual([0, 4, 11]);
  });

  it("bleibt unter der Textgrenze", () => {
    for (const step of AI_INFLUENZA_OUTREACH_SEQUENCE) {
      expect(step.body.length).toBeLessThanOrEqual(OUTREACH_BODY_MAX_CHARS);
    }
  });

  it("enthaelt keinen Abmelde-Platzhalter im Betreff", () => {
    for (const step of AI_INFLUENZA_OUTREACH_SEQUENCE) {
      expect(step.subject).not.toContain("{{abmelde_link}}");
    }
  });
});

describe("validateOutreachSequence", () => {
  it("erkennt Versprechen, fehlende Abmeldung und lange Texte", () => {
    const issues = validateOutreachSequence([
      {
        id: "erstkontakt",
        dayOffset: 0,
        subject: "Mehr Umsatz garantiert",
        body: `Hallo {{vorname}}, wir verdoppeln deinen Umsatz. ${"x".repeat(900)}`,
      },
    ]);
    expect(issues.join(" | ")).toContain('verbotenes Versprechen "garantiert"');
    expect(issues.join(" | ")).toContain('verbotenes Versprechen "verdoppel"');
    expect(issues.join(" | ")).toContain("{{abmelde_link}} fehlt");
    expect(issues.join(" | ")).toContain("Text zu lang");
  });

  it("erkennt eine leere Sequenz und falsche Reihenfolge", () => {
    expect(validateOutreachSequence([])).toEqual(["Die Sequenz ist leer."]);
    const issues = validateOutreachSequence([
      { ...AI_INFLUENZA_OUTREACH_SEQUENCE[1] },
      { ...AI_INFLUENZA_OUTREACH_SEQUENCE[0] },
    ]);
    expect(issues.some((issue) => issue.includes("dayOffset muss aufsteigend sein"))).toBe(true);
  });
});

describe("renderOutreachStep", () => {
  it("setzt alle Platzhalter ein", () => {
    const result = renderOutreachStep(AI_INFLUENZA_OUTREACH_SEQUENCE[0], vollstaendig);
    expect(result.missing).toEqual([]);
    expect(result.subject).toBe("Musterbau GmbH: eine Beobachtung zu eurem Content");
    expect(result.body).toContain("Hallo Niko,");
    expect(result.body).toContain("Euer letztes Video ist vom Mai");
    expect(result.body).not.toContain("{{");
  });

  it("laesst fehlende Werte stehen und meldet sie", () => {
    const result = renderOutreachStep(AI_INFLUENZA_OUTREACH_SEQUENCE[0], { vorname: "Niko" });
    expect(result.missing).toEqual(["firma", "befund", "absender", "abmelde_link"]);
    expect(result.body).toContain("{{firma}}");
  });

  it("ignoriert nur-Leerzeichen-Werte als fehlend", () => {
    const result = renderOutreachStep(AI_INFLUENZA_OUTREACH_SEQUENCE[2], { ...vollstaendig, firma: "   " });
    expect(result.missing).toEqual(["firma"]);
  });
});

describe("nextOutreachStep", () => {
  it("liefert den letzten faelligen Schritt", () => {
    expect(nextOutreachStep(0)?.id).toBe("erstkontakt");
    expect(nextOutreachStep(3)?.id).toBe("erstkontakt");
    expect(nextOutreachStep(4)?.id).toBe("befund");
    expect(nextOutreachStep(11)?.id).toBe("abschluss");
    expect(nextOutreachStep(40)?.id).toBe("abschluss");
  });

  it("liefert nichts bei unsinnigen Eingaben", () => {
    expect(nextOutreachStep(-1)).toBeNull();
    expect(nextOutreachStep(Number.NaN)).toBeNull();
  });
});
