/**
 * StartupScreen — Verbindungsprüfung beim App-Start
 * Zeigt einen Ladebildschirm mit Server-Status und lädt erst dann das Dashboard.
 */
import { useState, useEffect } from "react";
import { Shield, Wifi, WifiOff, Loader2 } from "lucide-react";

interface StartupProps {
  onComplete: () => void;
}

export function StartupScreen({ onComplete }: StartupProps) {
  const [status, setStatus] = useState<"checking" | "connected" | "failed">("checking");
  const [message, setMessage] = useState("Verbinde mit Server...");
  const [retryCount, setRetryCount] = useState(0);

  // API-Basis-URL aus der Build-Umgebung (im APK via .env / .env.production gesetzt)
  const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
  const healthUrl = apiBase ? `${apiBase}/api/healthz` : "/api/healthz";

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkConnection = async () => {
      setStatus("checking");
      setMessage(retryCount > 0 ? `Erneuter Versuch (${retryCount + 1}/3)...` : "Verbinde mit Server...");

      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(healthUrl, {
          signal: controller.signal,
          cache: "no-cache",
        });

        clearTimeout(timeoutId);

        if (!cancelled) {
          if (res.ok) {
            setStatus("connected");
            setMessage("Server verbunden!");
            setTimeout(() => onComplete(), 600);
          } else {
            throw new Error(`Status ${res.status}`);
          }
        }
      } catch {
        clearTimeout(timeoutId);
        if (!cancelled) {
          if (retryCount < 2) {
            setRetryCount(prev => prev + 1);
          } else {
            setStatus("failed");
            setMessage("Server nicht erreichbar");
          }
        }
      }
    };

    checkConnection();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [retryCount, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0c0c14]">
      {/* Logo/Icon */}
      <div className="mb-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Shield className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* App-Name */}
      <h1 className="text-2xl font-bold text-white mb-2">CyberSarah</h1>
      <p className="text-sm text-zinc-400 mb-12">Revenue Operating System</p>

      {/* Status */}
      <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10">
        {status === "checking" ? (
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
        ) : status === "connected" ? (
          <Wifi className="w-5 h-5 text-green-400" />
        ) : (
          <WifiOff className="w-5 h-5 text-red-400" />
        )}
        <span className={`text-sm ${
          status === "connected" ? "text-green-400" :
          status === "failed" ? "text-red-400" : "text-zinc-300"
        }`}>
          {message}
        </span>
      </div>

      {/* Retry Button bei Fehler */}
      {status === "failed" && (
        <button
          onClick={() => setRetryCount(0)}
          className="mt-6 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all active:scale-95"
        >
          Erneut versuchen
        </button>
      )}

      {/* Version */}
      <p className="absolute bottom-8 text-xs text-zinc-600">Master v1.0</p>
    </div>
  );
}
