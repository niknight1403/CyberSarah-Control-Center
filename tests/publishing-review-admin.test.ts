import {describe, expect, it} from "vitest";
import {appRouter} from "../server/routers";
import type {TrpcContext} from "../server/_core/context";
import {validatePublishingReview} from "../server/publishing-review";

function caller(role:"admin"|"user"|null) {
  const ctx={
    user:role?{role,openId:"owner-123"}:null,
    req:{headers:{}},res:{locals:{}},
  } as TrpcContext;
  return appRouter.createCaller(ctx);
}

describe("Publishing manual review: secure admin boundary",()=>{
  it("denies non-admin and anonymous users before hitting the database",async()=>{
    await expect(caller("user").publishing.reviewQueue()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller(null).publishing.reviewQueue()).rejects.toMatchObject({code:"FORBIDDEN"});
    const mutation={jobId:1,resolution:"closed_without_replay" as const,
      evidence:"On the platform, no post was found at 12:30.",confirmation:"OHNE_WIEDERHOLUNG_SCHLIESSEN" as const};
    await expect(caller("user").publishing.reconcile(mutation)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller(null).publishing.reconcile(mutation)).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("requires explicit confirmation tokens and useful operator evidence",async()=>{
    await expect(caller("admin").publishing.reconcile({
      jobId:1,resolution:"closed_without_replay",
      evidence:"Reviewed external platform, no post was found.",
      confirmation:"wrong" as "OHNE_WIEDERHOLUNG_SCHLIESSEN",
    })).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect(()=>validatePublishingReview({
      resolution:"confirmed_published",externalId:"x-unknown",
      evidence:"Checked the external provider post directly.",
    })).toThrow(/echte externe/);
    expect(()=>validatePublishingReview({
      resolution:"closed_without_replay",evidence:"short",
    })).toThrow(/Prüfgrundlage/);
  });
});
