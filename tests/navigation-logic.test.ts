import { describe, it, expect } from "vitest";
import {
  tabForRoute,
  createNavigationState,
  switchTab,
  navigate,
  decideBack,
  parseDeepLink,
  applyDeepLink,
  currentRoute,
  canGoBackWithinTab,
  HOME_TAB,
} from "@/lib/navigation-logic";

const roots = { chat: "/chat", "revenue-os": "/revenue-os", memory: "/memory" } as const;

describe("Sprint 344 — Navigation-Pass", () => {
  it("ordnet Routen dem laengsten passenden Tab-Wurzel-Prefix zu", () => {
    expect(tabForRoute("/chat", roots)).toBe("chat");
    expect(tabForRoute("/chat/42", roots)).toBe("chat");
    expect(tabForRoute("/revenue-os/detail/7", roots)).toBe("revenue-os");
    expect(tabForRoute("/gibtsnicht", roots)).toBeNull();
  });

  it("Tab-Wechsel bewahrt den Stack des alten Tabs", () => {
    let s = createNavigationState(roots);
    s = navigate(s, "/chat/42", roots).state;
    const switched = switchTab(s, "memory");
    expect(switched.activeTab).toBe("memory");
    expect(s.tabStacks.chat).toEqual(["/chat", "/chat/42"]); // unberuehrt
    expect(currentRoute(switched)).toBe("/memory");
    expect(switchTab(switched, "memory")).toBe(switched); // gleicher Tab: no-op
    expect(switchTab(switched, "nichtda" as never)).toBe(switched); // unbekannt: no-op
  });

  it("navigate pusht im Tab und wechselt bei Fremd-Tab ehrlich", () => {
    let s = createNavigationState(roots);
    s = navigate(s, "/chat/42", roots).state;
    s = navigate(s, "/chat/42", roots).state; // doppelt: kein Push
    expect(s.tabStacks.chat).toHaveLength(2);
    s = navigate(s, "/memory/notiz/3", roots).state;
    expect(s.activeTab).toBe("memory");
    expect(s.tabStacks.memory).toEqual(["/memory", "/memory/notiz/3"]);
    const refused = navigate(s, "/unbekannt/x", roots);
    expect(refused.state).toBe(s);
    expect(refused.notice).toContain("unbekannt");
  });

  it("Zurueck: pop im Tab, dann Tab zurueck, dann App beenden", () => {
    let s = createNavigationState(roots);
    s = navigate(s, "/chat/42", roots).state;
    s = navigate(s, "/memory/notiz/3", roots).state;

    const b1 = decideBack(s);
    expect(b1.action).toBe("pop");
    expect(b1.target).toBe("/memory");

    const b2 = decideBack(b1.nextState);
    expect(b2.action).toBe("tab-zurueck");
    expect(b2.target).toBe("chat");

    const b3 = decideBack(b2.nextState);
    expect(b3.action).toBe("pop"); // chat-Stack hat noch /chat/42
    expect(b3.target).toBe("/chat");

    const b4 = decideBack(b3.nextState);
    expect(b4.action).toBe("app-beenden");
  });

  it("Deep-Link parsen: Schema, Pfad, Query-Parameter", () => {
    const link = parseDeepLink("cyber-sarah://chat/42?draft=abc&x=1");
    expect(link?.route).toBe("/chat/42");
    expect(link?.params).toEqual({ draft: "abc", x: "1" });
    expect(parseDeepLink("https://app.example.com/chat/7")?.route).toBe("/chat/7");
    expect(parseDeepLink("cyber-sarah://")?.route ?? null).toBeNull();
    expect(parseDeepLink("murks")).toBeNull();
  });

  it("unbekannter Deep-Link aendert NICHTS und meldet sich klar", () => {
    let s = createNavigationState(roots);
    s = navigate(s, "/chat/42", roots).state;
    const r = applyDeepLink(s, { route: "/spam/offer", params: {} }, roots);
    expect(r.state).toBe(s);
    expect(r.notice).toContain("NICHT navigiert");
    const ok = applyDeepLink(s, { route: "/memory/tag/9", params: {} }, roots);
    expect(ok.state.activeTab).toBe("memory");
    expect(ok.state.tabStacks.memory).toContain("/memory/tag/9");
  });

  it("Zurueck-Pfeil nur wenn im Stack wirklich zurueck gegangen werden kann", () => {
    let s = createNavigationState(roots);
    expect(canGoBackWithinTab(s)).toBe(false);
    s = navigate(s, "/chat/42", roots).state;
    expect(canGoBackWithinTab(s)).toBe(true);
    expect(HOME_TAB).toBe("chat");
  });
});
