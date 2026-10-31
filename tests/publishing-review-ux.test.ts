import {describe,expect,it} from "vitest";
import {
  REVIEW_PLATFORMS,cleanReviewSearch,reviewAgeLabel,reviewPlatformHome,
  reviewUrgency,validManualReviewReceipt,
} from "../lib/publishing-review-logic";

const now=new Date("2026-10-31T12:00:00.000Z");
const past=(hours:number)=>new Date(now.getTime()-hours*3_600_000);

describe("publishing review desk reliability and mobile presentation",()=>{
  it("prioritizes aged tasks without hiding unknown dates",()=>{
    expect(reviewUrgency(past(25),now)).toBe("critical");
    expect(reviewUrgency(past(2),now)).toBe("urgent");
    expect(reviewUrgency(past(0.5),now)).toBe("fresh");
    expect(reviewUrgency("not-a-date",now)).toBe("unknown");
    expect(reviewUrgency(new Date(now.getTime()+5000),now)).toBe("fresh");
    expect(reviewAgeLabel(past(25),now)).toBe("25 Std. offen");
    expect(reviewAgeLabel(past(49),now)).toBe("2 Tage offen");
    expect(reviewAgeLabel(past(0.5),now)).toBe("30 Min. offen");
    expect(reviewAgeLabel("broken",now)).toBe("Zeitpunkt unbekannt");
  });
  it("only builds pre-approved official platform links",()=>{
    expect(REVIEW_PLATFORMS).toHaveLength(6);
    expect(reviewPlatformHome("x")).toBe("https://x.com/");
    expect(reviewPlatformHome("bluesky")).toBe("https://bsky.app/");
    expect(reviewPlatformHome("instagram")).toContain("instagram.com");
    expect(reviewPlatformHome("javascript:alert(1)")).toBeNull();
    expect(reviewPlatformHome("evil.com")).toBeNull();
  });
  it("allows canonical post identifiers but rejects URLs and placeholders",()=>{
    expect(validManualReviewReceipt("1234567890123456789")).toBe(true);
    expect(validManualReviewReceipt("urn:li:share:1234567890")).toBe(true);
    expect(validManualReviewReceipt("at://did:plc:sample/app.bsky.feed.post/abc")).toBe(true);
    for(const value of ["","x-unknown","ig-fake","pending","none","placeholder",
      "unknown","https://x.com/user/status/1234","www.x.com/status/1234",
      "a b c d","abc\n1234","four?","https://evil.com"]){
      expect(validManualReviewReceipt(value),value).toBe(false);
    }
    expect(validManualReviewReceipt("a".repeat(301))).toBe(false);
  });
  it("limits search length and removes surrounding whitespace",()=>{
    expect(cleanReviewSearch("  Produkt  ")).toBe("Produkt");
    expect(cleanReviewSearch(undefined)).toBe("");
    expect(cleanReviewSearch("a".repeat(200))).toHaveLength(80);
  });
});
