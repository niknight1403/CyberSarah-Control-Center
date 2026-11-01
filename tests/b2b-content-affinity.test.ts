import {describe,it,expect} from "vitest";
import {formatB2BAffinityPrompt,selectB2BAffinityBrief} from "../lib/b2b-content-affinity-logic";

describe("B2B high-ticket affinity briefs",()=>{
  it("maps commercial personas to concrete buyer segments",()=>{
    expect(selectB2BAffinityBrief("juno",0)?.segment).toBe("founder");
    expect(selectB2BAffinityBrief("juno",1)?.segment).toBe("agency-owner");
    expect(selectB2BAffinityBrief("nova",0)?.segment).toBe("automation-lead");
    expect(selectB2BAffinityBrief("zara",0)?.segment).toBe("agency-owner");
    expect(selectB2BAffinityBrief("mira",0)).toBeNull();
  });

  it("keeps commercial hooks truthful and non-deceptive",()=>{
    const brief=selectB2BAffinityBrief("nova",0)!;
    const prompt=formatB2BAffinityPrompt(brief);
    expect(prompt).toContain("Automation Leads");
    expect(prompt).toContain("keine erfundene Uptime");
    expect(prompt).toContain("niemals Täuschung");
    expect(prompt).toContain("CTA:");
  });
});
