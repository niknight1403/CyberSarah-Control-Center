/** Deterministic screen headings for the mobile header and deep-linked subpages. */
export type MobileHeader = { title: string; subtitle: string };

export const MOBILE_HEADER_ROUTES: Readonly<Record<string, MobileHeader>> = {
  "/": { title: "Workspace", subtitle: "Code, Repository & Delivery" },
  "/dashboard": { title: "Übersicht", subtitle: "Systemlage auf einen Blick" },
  "/chat": { title: "Chat", subtitle: "KI-Dialog & Agentensteuerung" },
  "/superagent": { title: "Superagent", subtitle: "Autonome Orchestrierung" },
  "/business": { title: "Business", subtitle: "Revenue, Trading & Operations" },
  "/revenue-os": { title: "Revenue OS", subtitle: "Wachstum & Monetarisierung" },
  "/media-studio": { title: "Media Studio", subtitle: "Content & Kampagnen" },
  "/commerce-studio": { title: "Commerce Studio", subtitle: "Produkte, Content & Gewinnoptimierung" },
  "/account": { title: "Konto", subtitle: "Profil, Plan & Einstellungen" },
  "/agent": { title: "Entwicklung", subtitle: "Agenten, Builds & Automatisierung" },
  "/preview": { title: "Vorschau", subtitle: "App-Erlebnis prüfen" },
  "/quality": { title: "Qualität", subtitle: "CI, Sicherheit & Release-Status" },
  "/focus": { title: "Fokus", subtitle: "Prioritäten & Rückblick" },
  "/ideas": { title: "Ideen-Inbox", subtitle: "Ideen prüfen und entwickeln" },
  "/decisions": { title: "Entscheidungen", subtitle: "Entscheidungsverlauf & Nachweise" },
  "/cyber-terminal": { title: "Terminal", subtitle: "Entwicklung & Diagnose" },
  "/loop-engineering": { title: "Loop Engineering", subtitle: "Autonome Entwicklungszyklen" },
};

const FALLBACK_HEADER: MobileHeader = { title: "CyberSarah", subtitle: "AI Control Center" };

/** Exact parent route first, then longest segment-safe prefix; never match /agentic as /agent. */
export function resolveMobileHeader(pathname: string): MobileHeader {
  const path = pathname === "" ? "/" : pathname.replace(/\/+$/, "") || "/";
  if (MOBILE_HEADER_ROUTES[path]) return MOBILE_HEADER_ROUTES[path];
  const parent = Object.keys(MOBILE_HEADER_ROUTES)
    .filter((route) => route !== "/" && path.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ? MOBILE_HEADER_ROUTES[parent] : FALLBACK_HEADER;
}
