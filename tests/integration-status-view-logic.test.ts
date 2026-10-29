import { describe, expect, it } from "vitest";
import { classifyIntegrationCardHealth } from "../lib/integration-status-view-logic";

describe("integration status mobile view",()=>{
  it("meldet gesund nur bei nutzbarem Routing ohne Queue-Fehler",()=>{
    expect(classifyIntegrationCardHealth({llmHealthy:2,routeHealthy:2,routeConfigured:2,queueFailed:0})).toEqual({
      state:"healthy",label:"Autonomie bereit",
    });
  });
  it("markiert partielle Route oder Queue-Fehler als degradiert",()=>{
    expect(classifyIntegrationCardHealth({llmHealthy:2,routeHealthy:1,routeConfigured:2,queueFailed:0}).state).toBe("degraded");
    expect(classifyIntegrationCardHealth({llmHealthy:2,routeHealthy:2,routeConfigured:2,queueFailed:1}).state).toBe("degraded");
  });
  it("meldet Routing ohne gesunde Route als gestoert",()=>{
    expect(classifyIntegrationCardHealth({llmHealthy:0,routeHealthy:0,routeConfigured:2,queueFailed:0}).state).toBe("offline");
  });
});
