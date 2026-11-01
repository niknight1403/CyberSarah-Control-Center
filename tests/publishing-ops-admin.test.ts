import {describe,expect,it} from "vitest";
import {appRouter} from "../server/routers";
import type {TrpcContext} from "../server/_core/context";

function caller(role:"admin"|"user"|null){
  const ctx={user:role?{role,openId:"ops-owner"}:null,
    req:{headers:{}},res:{locals:{}}} as TrpcContext;
  return appRouter.createCaller(ctx);
}

describe("publishing operations status authorization",()=>{
  it("blocks anonymous users and regular users from operational counters",async()=>{
    await expect(caller(null).publishing.opsOverview()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller("user").publishing.opsOverview()).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("exposes the query only through an authenticated admin route",()=>{
    expect(caller("admin").publishing.opsOverview).toBeTypeOf("function");
  });
});
