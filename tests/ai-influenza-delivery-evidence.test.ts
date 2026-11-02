import {describe,expect,it} from "vitest";
import {verifiedAiInfluenzaDeliveryCount} from "../lib/ai-influenza-delivery-evidence-logic";

const proof={
  deliveryVerified:true,customerApproved:true,orderId:"order-1",taskKind:"ai-image",
  approvedBy:"customer-1",approvedAt:"2026-11-02T11:00:00.000Z",
  deliveredAt:"2026-11-02T10:00:00.000Z",deliveredQuantity:2,
  deliveredAssetIds:["image-1","image-2"],
};

describe("AI Influenza persisted delivery evidence",()=>{
  it("accepts structurally complete unique references",()=>{
    expect(verifiedAiInfluenzaDeliveryCount(proof,"order-1","ai-image")).toBe(2);
  });
  it("rejects draft-only status and missing approval identity",()=>{
    expect(verifiedAiInfluenzaDeliveryCount({draftGenerated:true},"order-1","ai-image")).toBe(0);
    expect(verifiedAiInfluenzaDeliveryCount({...proof,approvedBy:""},"order-1","ai-image")).toBe(0);
  });
  it("rejects duplicate or insufficient references and wrong order",()=>{
    expect(verifiedAiInfluenzaDeliveryCount({...proof,deliveredAssetIds:["image-1","image-1"]},"order-1","ai-image")).toBe(0);
    expect(verifiedAiInfluenzaDeliveryCount({...proof,deliveredAssetIds:["image-1"]},"order-1","ai-image")).toBe(0);
    expect(verifiedAiInfluenzaDeliveryCount(proof,"another-order","ai-image")).toBe(0);
  });
});
