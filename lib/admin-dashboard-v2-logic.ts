/**
 * Sprint 354 — Admin-Dashboard v2: Systemzustand mit echten Metriken.
 *
 * Konsolidierung von Systemmetriken (CPU, Speicher, Latenz-Perzentile, Fehlerraten,
 * DB-Pools, Storage, aktive Sessions) zu einem ehrlichen Gesamtgesundheitswert (0-100)
 * mit Schwellenwertprüfung, Trendanalyse und UI-View-Model.
 */

export interface SystemMetrics {
  cpuUsagePct: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  requestRatePerSec: number;
  errorRatePct: number;
  dbActiveConnections: number;
  dbIdleConnections: number;
  dbMaxConnections: number;
  storageUsedGb: number;
  storageTotalGb: number;
  activeSessionsCount: number;
  timestamp: number;
}

export type SubsystemStatus = "ok" | "warning" | "critical" | "unknown";

export interface SubsystemHealth {
  name: string;
  status: SubsystemStatus;
  score: number; // 0-100
  message: string;
  metricValue?: string | number;
}

export interface MetricAlert {
  id: string;
  subsystem: string;
  severity: "warning" | "critical";
  message: string;
  threshold: string;
  currentValue: string;
}

export interface SystemHealthEvaluation {
  overallScore: number; // 0-100
  status: "healthy" | "degraded" | "critical" | "unknown";
  subsystems: SubsystemHealth[];
  alerts: MetricAlert[];
  missingMetrics: string[];
  evaluatedAt: number;
}

export type TrendDirection = "improving" | "stable" | "degrading" | "unknown";

export interface MetricTrends {
  cpuTrend: TrendDirection;
  memoryTrend: TrendDirection;
  latencyTrend: TrendDirection;
  errorRateTrend: TrendDirection;
  dbUsageTrend: TrendDirection;
}

export interface AdminDashboardViewModel {
  score: number;
  statusBadge: {
    label: string;
    variant: "success" | "warning" | "danger" | "neutral";
  };
  summaryText: string;
  subsystemCards: Array<{
    name: string;
    status: SubsystemStatus;
    scoreText: string;
    detail: string;
    badgeVariant: "success" | "warning" | "danger" | "neutral";
  }>;
  alerts: MetricAlert[];
  trends: MetricTrends;
  missingDataWarning: string | null;
}

/** Evaluiert die Systemgesundheit basierend auf den übergebenen Metriken. */
export function evaluateSystemHealth(
  metrics?: Partial<SystemMetrics> | null,
  nowMs: number = Date.now()
): SystemHealthEvaluation {
  if (!metrics || Object.keys(metrics).length === 0) {
    return {
      overallScore: 0,
      status: "unknown",
      subsystems: [],
      alerts: [],
      missingMetrics: [
        "cpuUsagePct",
        "memoryUsedMb",
        "latencyP95Ms",
        "errorRatePct",
        "dbActiveConnections",
        "storageUsedGb",
      ],
      evaluatedAt: nowMs,
    };
  }

  const missingMetrics: string[] = [];
  const alerts: MetricAlert[] = [];
  const subsystems: SubsystemHealth[] = [];

  // 1. CPU Evaluation
  if (metrics.cpuUsagePct !== undefined) {
    const cpu = metrics.cpuUsagePct;
    let status: SubsystemStatus = "ok";
    let score = 100;
    let msg = `CPU-Auslastung bei ${cpu.toFixed(1)}%`;

    if (cpu >= 90) {
      status = "critical";
      score = 20;
      alerts.push({
        id: "alert-cpu-crit",
        subsystem: "CPU",
        severity: "critical",
        message: "Kritisch hohe CPU-Auslastung",
        threshold: "< 90%",
        currentValue: `${cpu.toFixed(1)}%`,
      });
    } else if (cpu >= 75) {
      status = "warning";
      score = 60;
      alerts.push({
        id: "alert-cpu-warn",
        subsystem: "CPU",
        severity: "warning",
        message: "Erhöhte CPU-Auslastung",
        threshold: "< 75%",
        currentValue: `${cpu.toFixed(1)}%`,
      });
    }
    subsystems.push({ name: "CPU", status, score, message: msg, metricValue: `${cpu.toFixed(1)}%` });
  } else {
    missingMetrics.push("cpuUsagePct");
  }

  // 2. Speicher Evaluation
  if (metrics.memoryUsedMb !== undefined && metrics.memoryTotalMb !== undefined && metrics.memoryTotalMb > 0) {
    const memPct = (metrics.memoryUsedMb / metrics.memoryTotalMb) * 100;
    let status: SubsystemStatus = "ok";
    let score = 100;
    let msg = `Speicher: ${metrics.memoryUsedMb}MB / ${metrics.memoryTotalMb}MB (${memPct.toFixed(1)}%)`;

    if (memPct >= 92) {
      status = "critical";
      score = 15;
      alerts.push({
        id: "alert-mem-crit",
        subsystem: "Speicher",
        severity: "critical",
        message: "Speicher nahezu erschöpft",
        threshold: "< 92%",
        currentValue: `${memPct.toFixed(1)}%`,
      });
    } else if (memPct >= 80) {
      status = "warning";
      score = 65;
      alerts.push({
        id: "alert-mem-warn",
        subsystem: "Speicher",
        severity: "warning",
        message: "Erhöhter Speicherverbrauch",
        threshold: "< 80%",
        currentValue: `${memPct.toFixed(1)}%`,
      });
    }
    subsystems.push({ name: "Speicher", status, score, message: msg, metricValue: `${memPct.toFixed(1)}%` });
  } else {
    missingMetrics.push("memoryUsedMb/memoryTotalMb");
  }

  // 3. Latenz Evaluation (p95)
  if (metrics.latencyP95Ms !== undefined) {
    const lat = metrics.latencyP95Ms;
    let status: SubsystemStatus = "ok";
    let score = 100;
    let msg = `p95 Latenz: ${lat}ms`;

    if (lat >= 1000) {
      status = "critical";
      score = 30;
      alerts.push({
        id: "alert-lat-crit",
        subsystem: "Latenz",
        severity: "critical",
        message: "p95 Antwortzeit extrem hoch",
        threshold: "< 1000ms",
        currentValue: `${lat}ms`,
      });
    } else if (lat >= 400) {
      status = "warning";
      score = 70;
      alerts.push({
        id: "alert-lat-warn",
        subsystem: "Latenz",
        severity: "warning",
        message: "p95 Antwortzeit erhöht",
        threshold: "< 400ms",
        currentValue: `${lat}ms`,
      });
    }
    subsystems.push({ name: "Latenz", status, score, message: msg, metricValue: `${lat}ms` });
  } else {
    missingMetrics.push("latencyP95Ms");
  }

  // 4. Fehlerrate Evaluation
  if (metrics.errorRatePct !== undefined) {
    const err = metrics.errorRatePct;
    let status: SubsystemStatus = "ok";
    let score = 100;
    let msg = `Fehlerrate: ${err.toFixed(2)}%`;

    if (err >= 5.0) {
      status = "critical";
      score = 10;
      alerts.push({
        id: "alert-err-crit",
        subsystem: "Fehlerrate",
        severity: "critical",
        message: "Hohe Fehlerrate im System",
        threshold: "< 5.0%",
        currentValue: `${err.toFixed(2)}%`,
      });
    } else if (err >= 1.0) {
      status = "warning";
      score = 60;
      alerts.push({
        id: "alert-err-warn",
        subsystem: "Fehlerrate",
        severity: "warning",
        message: "Leicht erhöhte Fehlerrate",
        threshold: "< 1.0%",
        currentValue: `${err.toFixed(2)}%`,
      });
    }
    subsystems.push({ name: "Fehlerrate", status, score, message: msg, metricValue: `${err.toFixed(2)}%` });
  } else {
    missingMetrics.push("errorRatePct");
  }

  // 5. DB Pool Evaluation
  if (metrics.dbActiveConnections !== undefined && metrics.dbMaxConnections !== undefined && metrics.dbMaxConnections > 0) {
    const dbPct = (metrics.dbActiveConnections / metrics.dbMaxConnections) * 100;
    let status: SubsystemStatus = "ok";
    let score = 100;
    let msg = `DB Connections: ${metrics.dbActiveConnections}/${metrics.dbMaxConnections} (${dbPct.toFixed(1)}%)`;

    if (dbPct >= 90) {
      status = "critical";
      score = 25;
      alerts.push({
        id: "alert-db-crit",
        subsystem: "Datenbank-Pool",
        severity: "critical",
        message: "DB Connection Pool nahezu ausgelastet",
        threshold: "< 90%",
        currentValue: `${dbPct.toFixed(1)}%`,
      });
    } else if (dbPct >= 75) {
      status = "warning";
      score = 70;
      alerts.push({
        id: "alert-db-warn",
        subsystem: "Datenbank-Pool",
        severity: "warning",
        message: "Erhöhte DB Connection Auslastung",
        threshold: "< 75%",
        currentValue: `${dbPct.toFixed(1)}%`,
      });
    }
    subsystems.push({ name: "Datenbank-Pool", status, score, message: msg, metricValue: `${dbPct.toFixed(1)}%` });
  } else {
    missingMetrics.push("dbActiveConnections/dbMaxConnections");
  }

  // Calculate overall score
  if (subsystems.length === 0) {
    return {
      overallScore: 0,
      status: "unknown",
      subsystems: [],
      alerts: [],
      missingMetrics,
      evaluatedAt: nowMs,
    };
  }

  const overallScore = Math.round(
    subsystems.reduce((acc, curr) => acc + curr.score, 0) / subsystems.length
  );

  let overallStatus: "healthy" | "degraded" | "critical" | "unknown" = "healthy";
  if (subsystems.some((s) => s.status === "critical") || overallScore < 50) {
    overallStatus = "critical";
  } else if (subsystems.some((s) => s.status === "warning") || overallScore < 80) {
    overallStatus = "degraded";
  }

  return {
    overallScore,
    status: overallStatus,
    subsystems,
    alerts,
    missingMetrics,
    evaluatedAt: nowMs,
  };
}

/** Vergleicht zwei Metriksätze für Trendanalysen. */
export function computeMetricTrends(
  current?: Partial<SystemMetrics> | null,
  previous?: Partial<SystemMetrics> | null
): MetricTrends {
  const getTrend = (
    curr: number | undefined,
    prev: number | undefined,
    higherIsBetter: boolean = false,
    tolerance: number = 0.05
  ): TrendDirection => {
    if (curr === undefined || prev === undefined || prev === 0) return "unknown";
    const diffRatio = (curr - prev) / prev;
    if (Math.abs(diffRatio) <= tolerance) return "stable";

    if (higherIsBetter) {
      return diffRatio > 0 ? "improving" : "degrading";
    } else {
      return diffRatio < 0 ? "improving" : "degrading";
    }
  };

  return {
    cpuTrend: getTrend(current?.cpuUsagePct, previous?.cpuUsagePct, false),
    memoryTrend: getTrend(current?.memoryUsedMb, previous?.memoryUsedMb, false),
    latencyTrend: getTrend(current?.latencyP95Ms, previous?.latencyP95Ms, false),
    errorRateTrend: getTrend(current?.errorRatePct, previous?.errorRatePct, false),
    dbUsageTrend: getTrend(current?.dbActiveConnections, previous?.dbActiveConnections, false),
  };
}

/** Formatiert das Evaluierungsergebnis in ein UI-View-Model. */
export function formatDashboardViewModel(
  evalResult: SystemHealthEvaluation,
  trends: MetricTrends
): AdminDashboardViewModel {
  let badgeVariant: "success" | "warning" | "danger" | "neutral" = "success";
  let statusLabel = "Optimal";

  switch (evalResult.status) {
    case "healthy":
      badgeVariant = "success";
      statusLabel = "Gesund";
      break;
    case "degraded":
      badgeVariant = "warning";
      statusLabel = "Beeinträchtigt";
      break;
    case "critical":
      badgeVariant = "danger";
      statusLabel = "Kritisch";
      break;
    default:
      badgeVariant = "neutral";
      statusLabel = "Unbekannt";
      break;
  }

  const subsystemCards = evalResult.subsystems.map((sub) => {
    let cardVariant: "success" | "warning" | "danger" | "neutral" = "success";
    if (sub.status === "critical") cardVariant = "danger";
    else if (sub.status === "warning") cardVariant = "warning";
    else if (sub.status === "unknown") cardVariant = "neutral";

    return {
      name: sub.name,
      status: sub.status,
      scoreText: `${sub.score}/100`,
      detail: sub.message,
      badgeVariant: cardVariant,
    };
  });

  const missingDataWarning =
    evalResult.missingMetrics.length > 0
      ? `Fehlende Metriken: ${evalResult.missingMetrics.join(", ")}`
      : null;

  return {
    score: evalResult.overallScore,
    statusBadge: {
      label: statusLabel,
      variant: badgeVariant,
    },
    summaryText: `System-Gesundheit ${evalResult.overallScore}/100 (${statusLabel}) - ${evalResult.alerts.length} aktive Warnungen`,
    subsystemCards,
    alerts: evalResult.alerts,
    trends,
    missingDataWarning,
  };
}
