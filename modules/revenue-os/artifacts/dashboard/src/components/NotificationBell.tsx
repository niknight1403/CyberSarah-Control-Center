import { useState, useEffect, useRef } from "react";
import { Bell, X, Circle, ExternalLink, DollarSign, Bot, AlertTriangle, Activity } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

interface AppNotification {
  id: string;
  typ: "revenue" | "hara" | "system" | "agent" | "warning";
  titel: string;
  beschreibung: string;
  zeit: string;
  gelesen: boolean;
  actionUrl?: string;
  prioritaet: number;
}

const TYP_ICON: Record<string, typeof DollarSign> = {
  revenue: DollarSign,
  hara: Bot,
  warning: AlertTriangle,
  agent: Activity,
  system: Activity,
};

const TYP_COLOR: Record<string, string> = {
  revenue: "text-green-400",
  hara: "text-violet-400",
  warning: "text-red-400",
  agent: "text-blue-400",
  system: "text-zinc-400",
};

function formatZeit(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "gerade eben";
  if (diff < 3600000) return \`vor \${Math.floor(diff / 60000)} Min\`;
  if (diff < 86400000) return \`vor \${Math.floor(diff / 3600000)}h\`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await apiFetch<{ notifications: AppNotification[]; ungelesen: number }>("/api/notifications");
        setNotifications(data.notifications ?? []);
        setUngelesen(data.ungelesen ?? 0);
      } catch { /* silent */ }
    };

    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, 30000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-5 w-5 text-zinc-400" />
        {ungelesen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {ungelesen > 9 ? "9+" : ungelesen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 max-h-[70vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Benachrichtigungen</h3>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/5 rounded-lg">
              <X className="h-4 w-4 text-zinc-400" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(70vh-52px)]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Keine Benachrichtigungen</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = TYP_ICON[n.typ] ?? Activity;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-white/5 transition-colors cursor-pointer",
                      !n.gelesen && "bg-violet-500/5"
                    )}
                    onClick={() => {
                      if (n.actionUrl) window.location.href = n.actionUrl;
                    }}
                  >
                    <div className={cn("mt-0.5", TYP_COLOR[n.typ] ?? "text-zinc-400")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{n.titel}</p>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{n.beschreibung}</p>
                      <p className="text-[10px] text-zinc-600 mt-1">{formatZeit(n.zeit)}</p>
                    </div>
                    {!n.gelesen && <Circle className="h-2 w-2 fill-violet-400 text-violet-400 mt-1.5 flex-shrink-0" />}
                    {n.actionUrl && <ExternalLink className="h-3 w-3 text-zinc-600 mt-1 flex-shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
