import { afterEach, describe, expect, it } from "vitest";
import { getModelRouterSetting, setModelRouterKvForTests, updateModelRouterSettingAtomic } from "../server/db";

describe("atomic model-router KV updates", () => {
  afterEach(() => setModelRouterKvForTests(null));
  it("serializes concurrent in-memory increments without lost updates", async () => {
    const kv = new Map<string, unknown>();
    setModelRouterKvForTests(kv);
    await Promise.all(Array.from({ length: 200 }, () => updateModelRouterSettingAtomic<number>("counter", (value) => (value ?? 0) + 1)));
    await expect(getModelRouterSetting<number>("counter")).resolves.toBe(200);
  });
  it("initializes missing values and preserves typed updates", async () => {
    setModelRouterKvForTests(new Map());
    await expect(updateModelRouterSettingAtomic<{ total: number }>("state", (value) => ({ total: (value?.total ?? 0) + 5 }))).resolves.toEqual({ total: 5 });
  });
});
