import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";

const context = (role: "admin" | "user" | null): TrpcContext => ({
  user: role ? { role } as NonNullable<TrpcContext["user"]> : null,
  req: { headers: {} } as TrpcContext["req"],
  res: { locals: {} } as TrpcContext["res"],
});
describe("Global draft approval is owned by administrator role", () => {
  it("blocks anonymous access to the shared campaign queue", async () => {
    await expect(appRouter.createCaller(context(null)).draftEngine.queue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks normal users from viewing shared campaign and revenue drafts", async () => {
    await expect(appRouter.createCaller(context("user")).draftEngine.queue()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("blocks normal users from approving or rejecting another campaign", async () => {
    await expect(appRouter.createCaller(context("user")).draftEngine.decide({ id: 1, action: "approve" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context("user")).draftEngine.decide({ id: 1, action: "reject" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("prevents ordinary users from starting the global draft generator", async () => {
    await expect(appRouter.createCaller(context("user")).draftEngine.runNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("preserves the administrator draft queue routes", () => {
    const caller = appRouter.createCaller(context("admin"));
    expect(caller.draftEngine.queue).toBeTypeOf("function");
    expect(caller.draftEngine.decide).toBeTypeOf("function");
    expect(caller.draftEngine.runNow).toBeTypeOf("function");
  });
});
