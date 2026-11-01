/**
 * Sprint 362 — Log-Viewer im Admin: gefiltert, PII-maskiert.
 *
 * Administrativer Log-Viewer mit automatischer PII- und Credential-Maskierung
 * (E-Mails, Telefonnummern, IP-Adressen, Tokens), Schweregrad-Filtern,
 * Korrelations-ID Suche, Paginierung und Log-Statistiken.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  correlationId?: string;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilterQuery {
  levels?: LogLevel[];
  components?: string[];
  searchQuery?: string;
  correlationId?: string;
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
}

export interface LogFilterResult {
  entries: LogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LogStats {
  totalCount: number;
  countByLevel: Record<LogLevel, number>;
  errorRatePercentage: number;
  topComponents: { name: string; count: number }[];
}

export function maskPiiInText(text: string): string {
  if (!text) return text;

  let masked = text;

  // Mask E-mail addresses: john.doe@example.com -> j***e@example.com
  masked = masked.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_match, user, domain) => {
    if (user.length <= 2) {
      return `${user[0]}*@${domain}`;
    }
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  });

  // Mask Phone numbers (E.164 or common formats): +491761234567 -> +4917****4567
  masked = masked.replace(/(\+?\d{2,4})[\s.-]?(\d{3,4})[\s.-]?(\d{3,6})/g, (_match, p1, _p2, p3) => {
    return `${p1}****${p3}`;
  });

  // Mask IPv4 addresses: 192.168.1.100 -> 192.168.x.x
  masked = masked.replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, "$1.x.x");

  // Mask Bearer Tokens / sk_ keys: Bearer eyJhbGci... -> Bearer ****
  masked = masked.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1****");
  masked = masked.replace(/(sk_[live|test]+_)[A-Za-z0-9]+/gi, "$1****");

  return masked;
}

class AdminLogViewerManager {
  private logBuffer: LogEntry[] = [];

  constructor() {
    this.initDefaultLogs();
  }

  private initDefaultLogs(): void {
    const now = Date.now();
    const initialLogs: Omit<LogEntry, "id">[] = [
      {
        timestamp: now - 120000,
        level: "info",
        component: "api-gateway",
        message: "Nutzer john.doe@example.com erfolgreich angemeldet von IP 192.168.1.45",
        correlationId: "corr-101",
        userId: "usr-456",
        ipAddress: "192.168.1.45",
        metadata: { path: "/api/v1/auth/login", method: "POST" },
      },
      {
        timestamp: now - 90000,
        level: "warn",
        component: "db-pool",
        message: "Verbindungspool zu 85% ausgelastet. Aktive Verbindungen: 34/40",
        correlationId: "corr-102",
        metadata: { poolSize: 40, activeCount: 34 },
      },
      {
        timestamp: now - 60000,
        level: "error",
        component: "webhook-worker",
        message: "Webhook-Zustellung fehlgeschlagen für admin.contact@cybersarah-ki.com (+491761234567). Token: Bearer secret_token_xyz999",
        correlationId: "corr-103",
        metadata: { targetUrl: "https://partner.example.com/hooks", statusCode: 502 },
      },
      {
        timestamp: now - 30000,
        level: "fatal",
        component: "payment-service",
        message: "Zahlungs-Gateway nicht erreichbar nach 3 Versuchen mit Key sk_test_998877665544332211",
        correlationId: "corr-104",
        metadata: { provider: "stripe", errorCode: "ETIMEDOUT" },
      },
      {
        timestamp: now - 10000,
        level: "info",
        component: "api-gateway",
        message: "GET /api/health HTTP/1.1 200 OK (2ms)",
        correlationId: "corr-105",
      },
    ];

    initialLogs.forEach((log) => this.ingestLog(log));
  }

  public ingestLog(rawEntry: Omit<LogEntry, "id">): LogEntry {
    const id = `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const maskedMessage = maskPiiInText(rawEntry.message);
    const maskedIp = rawEntry.ipAddress ? maskPiiInText(rawEntry.ipAddress) : undefined;

    const maskedEntry: LogEntry = {
      ...rawEntry,
      id,
      message: maskedMessage,
      ipAddress: maskedIp,
    };

    this.logBuffer.unshift(maskedEntry);
    return maskedEntry;
  }

  public queryLogs(query?: LogFilterQuery): LogFilterResult {
    let filtered = [...this.logBuffer];

    if (query) {
      if (query.levels && query.levels.length > 0) {
        filtered = filtered.filter((l) => query.levels!.includes(l.level));
      }
      if (query.components && query.components.length > 0) {
        filtered = filtered.filter((l) => query.components!.includes(l.component));
      }
      if (query.correlationId) {
        filtered = filtered.filter((l) => l.correlationId === query.correlationId);
      }
      if (query.startTime) {
        filtered = filtered.filter((l) => l.timestamp >= query.startTime!);
      }
      if (query.endTime) {
        filtered = filtered.filter((l) => l.timestamp <= query.endTime!);
      }
      if (query.searchQuery && query.searchQuery.trim() !== "") {
        const q = query.searchQuery.toLowerCase();
        filtered = filtered.filter(
          (l) =>
            l.message.toLowerCase().includes(q) ||
            l.component.toLowerCase().includes(q) ||
            (l.correlationId && l.correlationId.toLowerCase().includes(q))
        );
      }
    }

    const totalCount = filtered.length;
    const page = Math.max(1, query?.page || 1);
    const pageSize = Math.max(1, Math.min(query?.pageSize || 50, 500));
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const startIndex = (page - 1) * pageSize;
    const paginatedEntries = filtered.slice(startIndex, startIndex + pageSize);

    return {
      entries: paginatedEntries,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  public getLogStats(timeWindowMs?: number): LogStats {
    const now = Date.now();
    let logs = this.logBuffer;

    if (timeWindowMs) {
      const minTime = now - timeWindowMs;
      logs = logs.filter((l) => l.timestamp >= minTime);
    }

    const totalCount = logs.length;
    const countByLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };

    const componentCounts: Record<string, number> = {};

    logs.forEach((log) => {
      countByLevel[log.level] = (countByLevel[log.level] || 0) + 1;
      componentCounts[log.component] = (componentCounts[log.component] || 0) + 1;
    });

    const errorCount = countByLevel.error + countByLevel.fatal;
    const errorRatePercentage =
      totalCount > 0 ? Number(((errorCount / totalCount) * 100).toFixed(1)) : 0;

    const topComponents = Object.entries(componentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalCount,
      countByLevel,
      errorRatePercentage,
      topComponents,
    };
  }

  public exportLogs(query?: LogFilterQuery, format: "json" | "csv" = "json"): string {
    const result = this.queryLogs({ ...query, page: 1, pageSize: 500 });

    if (format === "csv") {
      const headers = ["id", "timestamp", "level", "component", "correlationId", "message"];
      const rows = result.entries.map((e) =>
        [
          e.id,
          new Date(e.timestamp).toISOString(),
          e.level,
          e.component,
          e.correlationId || "",
          `"${e.message.replace(/"/g, '""')}"`,
        ].join(",")
      );
      return [headers.join(","), ...rows].join("\n");
    }

    return JSON.stringify(result.entries, null, 2);
  }

  public resetToDefault(): void {
    this.logBuffer = [];
    this.initDefaultLogs();
  }
}

export const adminLogViewerManager = new AdminLogViewerManager();
