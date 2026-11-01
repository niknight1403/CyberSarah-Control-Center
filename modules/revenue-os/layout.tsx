import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, LayoutDashboard, Cpu, Megaphone, FileText, DollarSign,
  TerminalSquare, TrendingUp, Rocket, Zap, Brain, Settings, Globe,
  Users, Bot, Search, Mail, Clapperboard, Recycle, Target, Menu, X,
  Key, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, gruppe: "umsatz" },
  { name: "Sofort-Start", href: "/sofort-start", icon: Zap, badge: "€€€", gruppe: "umsatz" },
  { name: "HARA", href: "/hara", icon: Bot, badge: "AUTO", gruppe: "umsatz" },
  { name: "Chancen", href: "/chancen", icon: TrendingUp, gruppe: "umsatz" },
  { name: "Expansion", href: "/expansion", icon: Rocket, gruppe: "umsatz" },
  { name: "Finance-Team", href: "/finance-team", icon: Users, badge: "KI", gruppe: "umsatz" },
  { name: "Content", href: "/content", icon: FileText, gruppe: "content" },
  { name: "SEO-Empire", href: "/seo-content", icon: Search, badge: "AUTO", gruppe: "content" },
  { name: "KI-Influencer", href: "/influencer", icon: Globe, badge: "AUTO", gruppe: "content" },
  { name: "Faceless-Video", href: "/faceless-video", icon: Clapperboard, gruppe: "content" },
  { name: "Content-Recycling", href: "/content-recycling", icon: Recycle, gruppe: "content" },
  { name: "E-Mail-Listen", href: "/email-listen", icon: Mail, gruppe: "content" },
  { name: "Kampagnen", href: "/kampagnen", icon: Megaphone, gruppe: "content" },
  { name: "Trading AI", href: "/trading", icon: Brain, badge: "KI", gruppe: "system" },
  { name: "Finanzen", href: "/finanzen", icon: DollarSign, gruppe: "system" },
  { name: "Attribution", href: "/attribution", icon: Target, gruppe: "system" },
  { name: "Agenten", href: "/agenten", icon: Cpu, gruppe: "system" },
  { name: "API-Keys", href: "/einstellungen", icon: Key, badge: "NEU", gruppe: "system" },
  { name: "Protokolle", href: "/protokolle", icon: TerminalSquare, gruppe: "system" },
];

const mobileNavPrimary = [
  { name: "Start", href: "/", icon: LayoutDashboard },
  { name: "Sofort €", href: "/sofort-start", icon: Zap },
  { name: "HARA", href: "/hara", icon: Bot },
  { name: "Chancen", href: "/chancen", icon: TrendingUp },
  { name: "Finance", href: "/finance-team", icon: Users },
];
const mobileNavSecondary = [
  { name: "Content", href: "/content", icon: FileText },
  { name: "SEO", href: "/seo-content", icon: Search },
  { name: "Video", href: "/faceless-video", icon: Clapperboard },
  { name: "API-Keys", href: "/einstellungen", icon: Key },
  { name: "Menü", href: "#menu", icon: Menu },
];

const gruppenLabel: Record<string, string> = {
  umsatz: "Umsatz",
  content: "Content",
  system: "System",
};

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [sidebarOffen, setSidebarOffen] = useState(false);
  const [aktiveGruppe, setAktiveGruppe] = useState<string | null>(null);

  const gruppen = ["umsatz", "content", "system"] as const;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 lg:w-64 flex-shrink-0 flex-col" style={{ background: 'rgba(255,255,255,0.02)', borderRight: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="gradient-text font-bold text-sm tracking-tight">CyberSarah OS</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
          {gruppen.map((gruppe) => (
            <div key={gruppe}>
              <button
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase cursor-pointer transition-colors"
                style={{ color: 'var(--foreground-muted)' }}
                onClick={() => setAktiveGruppe(aktiveGruppe === gruppe ? null : gruppe)}
              >
                {gruppenLabel[gruppe]}
                <ChevronRight className={cn("h-3 w-3 transition-transform", aktiveGruppe !== gruppe && "rotate-90")} />
              </button>
              {aktiveGruppe !== gruppe && navigation
                .filter(n => n.gruppe === gruppe)
                .map((item) => {
                  const isActive = location === item.href;
                  return (
                    <Link key={item.name} href={item.href}>
                      <div className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer",
                        isActive
                          ? "text-white"
                          : "hover:text-white"
                      )} style={isActive ? {
                        background: 'rgba(6,182,212,0.1)',
                        border: '1px solid rgba(6,182,212,0.15)',
                        color: '#06b6d4'
                      } : {
                        color: 'var(--foreground-muted)'
                      }}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.name}
                        {item.badge && (
                          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{
                            background: 'rgba(139,92,246,0.1)',
                            color: '#8b5cf6',
                            border: '1px solid rgba(139,92,246,0.2)'
                          }}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
              CS
            </div>
            <div className="text-xs min-w-0">
              <p className="font-medium truncate" style={{ color: 'var(--foreground)' }}>CyberSarah OS</p>
              <p className="truncate flex items-center gap-1.5" style={{ color: 'var(--foreground-muted)' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                Autonom
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar Overlay ───────────────────────────────────────── */}
      {sidebarOffen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setSidebarOffen(false)} />
          <div className="relative w-72 flex flex-col h-full overflow-y-auto" style={{ background: 'rgba(15,15,25,0.98)', backdropFilter: 'blur(20px)', borderRight: '1px solid var(--border)' }}>
            <div className="h-14 flex items-center justify-between px-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                  <Activity className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="gradient-text font-bold text-sm">CyberSarah OS</span>
              </div>
              <button onClick={() => setSidebarOffen(false)}>
                <X className="h-5 w-5" style={{ color: 'var(--foreground-muted)' }} />
              </button>
            </div>
            <nav className="flex-1 py-3 px-2.5 space-y-1">
              {gruppen.map((gruppe) => (
                <div key={gruppe} className="mb-2">
                  <p className="px-3 py-1.5 text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--foreground-muted)' }}>
                    {gruppenLabel[gruppe]}
                  </p>
                  {navigation.filter(n => n.gruppe === gruppe).map((item) => {
                    const isActive = location === item.href;
                    return (
                      <Link key={item.name} href={item.href} onClick={() => setSidebarOffen(false)}>
                        <div className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer"
                        )} style={isActive ? {
                          background: 'rgba(6,182,212,0.1)',
                          border: '1px solid rgba(6,182,212,0.15)',
                          color: '#06b6d4'
                        } : {
                          color: 'var(--foreground-muted)'
                        }}>
                          <item.icon className="h-5 w-5 shrink-0" />
                          {item.name}
                          {item.badge && (
                            <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded-full" style={{
                              background: 'rgba(139,92,246,0.1)',
                              color: '#8b5cf6',
                              border: '1px solid rgba(139,92,246,0.2)'
                            }}>
                              {item.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        {/* Header */}
        <header className="h-12 md:h-14 flex items-center justify-between px-4 md:px-6 z-10 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(20px)' }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setSidebarOffen(true)}>
              <Menu className="h-5 w-5" style={{ color: 'var(--foreground-muted)' }} />
            </button>
            <div className="flex items-center gap-2 font-bold text-sm md:hidden">
              <div className="h-6 w-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                <Activity className="h-3 w-3 text-white" />
              </div>
              <span className="gradient-text">CyberSarah OS</span>
            </div>
            <h1 className="hidden md:block text-sm font-medium" style={{ color: 'var(--foreground-muted)' }}>
              {navigation.find((n) => n.href === location)?.name || "Übersicht"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-[10px] md:text-xs font-mono" style={{ color: '#22c55e' }}>LIVE</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-6 lg:p-8 pb-36 md:pb-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation (2 Reihen) ─────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 mobile-nav" style={{ borderTop: '1px solid var(--border)', background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(20px)' }}>
        {/* Reihe 1 */}
        <div className="flex items-stretch h-14" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {mobileNavPrimary.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href} className="flex-1">
                <div className="flex flex-col items-center justify-center h-full gap-1 transition-all" style={{ color: isActive ? '#06b6d4' : 'var(--foreground-muted)' }}>
                  <item.icon className="h-5 w-5" />
                  <span className="text-[9px] font-medium leading-none">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </div>
        {/* Reihe 2 */}
        <div className="flex items-stretch h-14">
          {mobileNavSecondary.map((item) => {
            const isActive = location === item.href;
            const isMenu = item.href === "#menu";
            return (
              <div key={item.name} className="flex-1">
                {isMenu ? (
                  <button
                    className="flex flex-col items-center justify-center w-full h-full gap-1 transition-colors"
                    style={{ color: 'var(--foreground-muted)' }}
                    onClick={() => setSidebarOffen(true)}
                  >
                    <Menu className="h-5 w-5" />
                    <span className="text-[9px] font-medium leading-none">Alle Tabs</span>
                  </button>
                ) : (
                  <Link href={item.href} className="flex-1">
                    <div className="flex flex-col items-center justify-center h-full gap-1 transition-all" style={{ color: isActive ? '#06b6d4' : 'var(--foreground-muted)' }}>
                      <item.icon className="h-5 w-5" />
                      <span className="text-[9px] font-medium leading-none">{item.name}</span>
                    </div>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
