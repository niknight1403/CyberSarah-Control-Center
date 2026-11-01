import { describe, expect, it } from "vitest";
import { verifyRenderLiveCommit } from "../lib/render-deploy-logic.mjs";
const expected = "a".repeat(40);
describe("Render deployment must prove the exact pushed source revision", () => {
 it("accepts only the latest live deploy with exact matching git SHA", () => {
   expect(verifyRenderLiveCommit({deploy:{status:"live",commit:{id:expected}}},expected).verified).toBe(true);
 });
 it("rejects a still-building newest deploy even when an older version answers HTTP 200", () => {
   expect(()=>verifyRenderLiveCommit({deploy:{status:"build_in_progress",commit:{id:expected}}},expected)).toThrow("nicht live");
 });
 it("rejects a healthy old Render commit as false-green deploy", () => {
   expect(()=>verifyRenderLiveCommit({status:"live",commit:{id:"b".repeat(40)}},expected)).toThrow("weicht");
 });
 it("fails closed for a missing commit in the Render response", () => {
   expect(()=>verifyRenderLiveCommit({status:"live"},expected)).toThrow("weicht");
 });
 it("manual local runs without GITHUB_SHA are not presented as commit-verified", () => {
   expect(verifyRenderLiveCommit({status:"live"},undefined).verified).toBe(false);
 });
});