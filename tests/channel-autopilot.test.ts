import {describe,expect,it} from "vitest";
import {buildChannelContentDraft,buildChannelExperimentDraft,channelAutopilotHealth,decideChannelAutopilot} from "../lib/channel-autopilot-logic";
const base={impressions:0,views:0,clicks:0,leads:0,purchases:0,refunds:0,confirmedRevenueCents:0,published:0,failed:0,activeExperiments:0,pendingContentDrafts:0,pendingRevenueDrafts:0};
describe("Channel Autopilot",()=>{
 it("explores before pretending low-data optimization is known",()=>{expect(decideChannelAutopilot({...base,impressions:200}).lever).toBe("DISCOVERY");});
 it("fixes reliability before scaling reach",()=>{expect(decideChannelAutopilot({...base,impressions:9000,published:4,failed:3}).lever).toBe("RELIABILITY");});
 it("diagnoses packaging as the earliest measured reach bottleneck",()=>{expect(decideChannelAutopilot({...base,impressions:5000,views:100,published:10}).lever).toBe("PACKAGING");});
 it("moves to CTA only after enough viewing evidence",()=>{expect(decideChannelAutopilot({...base,impressions:5000,views:500,clicks:2,published:10}).lever).toBe("CTA");});
 it("moves to landing conversion after qualified clicks",()=>{expect(decideChannelAutopilot({...base,impressions:5000,views:500,clicks:40,leads:3,published:10}).lever).toBe("LANDING");});
 it("moves to monetization after lead evidence",()=>{const d=decideChannelAutopilot({...base,impressions:5000,views:500,clicks:80,leads:40,purchases:0,published:10});expect(d.lever).toBe("MONETIZATION");expect(d.unit).toBe("%");expect(d.targetValue).toBe(3);});
 it("compounds only confirmed revenue winners",()=>{expect(decideChannelAutopilot({...base,impressions:5000,views:500,clicks:80,leads:40,purchases:4,confirmedRevenueCents:20000,published:10}).lever).toBe("COMPOUND");});
 it("keeps external actions approval-gated",()=>{const d=decideChannelAutopilot({...base,impressions:200});expect(d.requiresApproval).toBe(true);expect(d.blockedActions).toContain("Budget ausgeben");});
 it("builds queue-compatible content and experiment drafts",()=>{const d=decideChannelAutopilot({...base,impressions:200});const c=buildChannelContentDraft(d),e=buildChannelExperimentDraft(d);expect(c.personaId).toBeTruthy();expect(c.platform).toBeTruthy();expect(c.content.length).toBeGreaterThan(20);expect(e.autopilotKey).toContain("channel-autopilot");expect(e.unit).toBe("impressions");expect(e.targetValue).toBe(1000);});
 it("reports only confirmed revenue as truth",()=>{const h=channelAutopilotHealth({...base,confirmedRevenueCents:12345});expect(h.confirmedRevenueCents).toBe(12345);expect(h.truthMode).toBe("confirmed-revenue-only");});
});
