import type { NextFunction, Request, Response } from "express";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;

type RateLimitEntry = { count: number; resetAt: number };

function configuredOrigins() {
  const configured = (process.env.APP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin: string) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return new Set(configured);
  if (process.env.NODE_ENV !== "production") {
    return new Set(["http://localhost:8081", "http://localhost:19006"]);
  }
  return new Set<string>();
}

export function createSecurityMiddleware() {
  const origins = configuredOrigins();
  const requests = new Map<string, RateLimitEntry>();
  const windowMs = Number(
    process.env.RATE_LIMIT_WINDOW_MS ?? DEFAULT_WINDOW_MS,
  );
  const maxRequests = Number(
    process.env.RATE_LIMIT_MAX_REQUESTS ?? DEFAULT_MAX_REQUESTS,
  );

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!origins.has(origin)) {
        res.status(403).json({ error: "Origin nicht zugelassen." });
        return;
      }
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, Stripe-Signature",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("Referrer-Policy", "no-referrer");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const entry = requests.get(key);
    if (!entry || entry.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      res
        .status(429)
        .json({ error: "Zu viele Anfragen. Bitte später erneut versuchen." });
      return;
    }
    next();
  };
}
