import type { NextFunction, Request, RequestHandler, Response } from "express";

let requestCount = 0;
let errorCount = 0;

export const requestMetricsMiddleware: RequestHandler = (
  _request: Request,
  response: Response,
  next: NextFunction,
) => {
  requestCount += 1;
  response.on("finish", () => {
    if (response.statusCode >= 500) errorCount += 1;
  });
  next();
};

export function metricsText() {
  const memory = process.memoryUsage();
  return [
    "# HELP cybersarah_process_uptime_seconds Process uptime in seconds.",
    "# TYPE cybersarah_process_uptime_seconds gauge",
    `cybersarah_process_uptime_seconds ${process.uptime()}`,
    "# HELP cybersarah_http_requests_total Total HTTP requests observed by this process.",
    "# TYPE cybersarah_http_requests_total counter",
    `cybersarah_http_requests_total ${requestCount}`,
    "# HELP cybersarah_http_5xx_total Total HTTP 5xx responses observed by this process.",
    "# TYPE cybersarah_http_5xx_total counter",
    `cybersarah_http_5xx_total ${errorCount}`,
    "# HELP cybersarah_process_resident_memory_bytes Resident process memory in bytes.",
    "# TYPE cybersarah_process_resident_memory_bytes gauge",
    `cybersarah_process_resident_memory_bytes ${memory.rss}`,
    "",
  ].join("\n");
}

export function metricsHandler(request: Request, response: Response) {
  const configuredToken = process.env.METRICS_TOKEN?.trim();
  if (process.env.NODE_ENV === "production" && !configuredToken) {
    response
      .status(503)
      .json({ error: "METRICS_TOKEN ist nicht konfiguriert." });
    return;
  }
  if (configuredToken) {
    const authorization = request.header("authorization");
    if (authorization !== `Bearer ${configuredToken}`) {
      response
        .status(401)
        .json({ error: "Metriken erfordern eine Authentifizierung." });
      return;
    }
  }
  response.type("text/plain").send(metricsText());
}
