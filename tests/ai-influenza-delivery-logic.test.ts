import {describe,it,expect} from "vitest";
import {aiInfluenzaCreativePrompt,buildAiInfluenzaDeliveryBriefs} from "../lib/ai-influenza-delivery-logic";

describe("AI Influenza delivery plans",()=>{
  it("matches starter and growth package commitments",()=>{
    const starter=buildAiInfluenzaDeliveryBriefs("starter");
    expect(starter.find(x=>x.taskKind==="content-post")?.quantity).toBe(12);
    expect(starter.find(x=>x.taskKind==="ai-image")?.quantity).toBe(4);
    const growth=buildAiInfluenzaDeliveryBriefs("growth");
    expect(growth.find(x=>x.taskKind==="short-video")).toMatchObject({quantity:12,renderPipeline:"media-pipeline",requiresApproval:true});
    expect(growth.find(x=>x.taskKind==="content-post")?.quantity).toBe(20);
  });
  it("builds truthful customer-specific creative prompts",()=>{
    const prompt=aiInfluenzaCreativePrompt({companyName:"Example GmbH",packageId:"growth",taskKind:"short-video",quantity:12});
    expect(prompt).toContain("Example GmbH");
    expect(prompt).toContain("keine erfundenen");
    expect(prompt).toContain("Freigabe");
  });
});
