/**
 * Sprint 378: Security-Final: Serie-E-Befunde geschlossen
 * Logic-Modul für RLS-Sicherheitsprüfungen, Geheimnis-Hygiene, Rate-Limiting-Audit
 * und Erstellung eines ehrlichen Security Compliance Reports.
 */

export interface DBTableSecurity {
  tableName: string;
  rlsEnabled: boolean;
  hasPolicies: boolean;
  sensitiveColumnsMasked: boolean;
}

export interface ConfigSecretAudit {
  key: string;
  value: string;
  isSecretKeyName: boolean;
  isExposedUnmasked: boolean;
}

export interface EndpointRateLimitAudit {
  endpoint: string;
  rateLimitEnabled: boolean;
  requestsPerMinuteLimit: number;
  isPublic: boolean;
}

export interface SecurityFinding {
  id: string;
  category: "rls" | "secrets" | "ratelimit" | "pii" | "headers";
  severity: "high" | "medium" | "low";
  description: string;
  resolved: boolean;
}

export interface SecurityComplianceReport {
  securityScore: number; // 0..100
  isFullyCompliant: boolean;
  totalFindings: number;
  openFindings: SecurityFinding[];
  resolvedFindingsCount: number;
  summary: string;
}

const SECRET_KEY_PATTERNS = [/token/i, /secret/i, /password/i, /api_?key/i, /auth/i, /credential/i];

/**
 * Prüft RLS-Status und Policierungs-Deckung aller DB-Tabellen.
 */
export function auditRLSPolicies(tables: DBTableSecurity[]): {
  isAllRLSEnabled: boolean;
  unprotectedTables: string[];
} {
  const unprotectedTables = tables
    .filter((t) => !t.rlsEnabled || !t.hasPolicies)
    .map((t) => t.tableName);

  return {
    isAllRLSEnabled: unprotectedTables.length === 0,
    unprotectedTables,
  };
}

/**
 * Auditiert Umgebungsvariablen und Konfigurationen auf unmaskiert offengelegte Geheimnisse.
 */
export function auditSecretHygiene(configs: ConfigSecretAudit[]): {
  isClean: boolean;
  exposedKeys: string[];
} {
  const exposedKeys: string[] = [];

  for (const item of configs) {
    const isSecretName = SECRET_KEY_PATTERNS.some((pattern) => pattern.test(item.key));
    if (isSecretName && item.isExposedUnmasked && item.value && item.value.length > 0) {
      exposedKeys.push(item.key);
    }
  }

  return {
    isClean: exposedKeys.length === 0,
    exposedKeys,
  };
}

/**
 * Prüft Rate-Limiting-Abdeckung für öffentliche und sensible Endpunkte.
 */
export function auditRateLimits(endpoints: EndpointRateLimitAudit[]): {
  isFullyProtected: boolean;
  unprotectedEndpoints: string[];
} {
  const unprotectedEndpoints = endpoints
    .filter((e) => !e.rateLimitEnabled)
    .map((e) => e.endpoint);

  return {
    isFullyProtected: unprotectedEndpoints.length === 0,
    unprotectedEndpoints,
  };
}

/**
 * Erzeugt den abschließenden Security Compliance Report für Serie E Befunde.
 */
export function generateSecurityComplianceReport(
  findings: SecurityFinding[]
): SecurityComplianceReport {
  const totalFindings = findings.length;
  const openFindings = findings.filter((f) => !f.resolved);
  const resolvedFindingsCount = totalFindings - openFindings.length;

  let score = 100;
  for (const open of openFindings) {
    if (open.severity === "high") score -= 25;
    else if (open.severity === "medium") score -= 10;
    else if (open.severity === "low") score -= 5;
  }

  if (score < 0) score = 0;

  const isFullyCompliant = openFindings.length === 0;
  const summary = isFullyCompliant
    ? "Sicherheitsprüfung vollständig bestanden: Alle Serie-E-Befunde (RLS, Secrets, Rate-Limits, PII) sind geschlossen."
    : `Sicherheitsprüfung unvollständig: ${openFindings.length} offene Befunde gefunden. Score: ${score}/100.`;

  return {
    securityScore: score,
    isFullyCompliant,
    totalFindings,
    openFindings,
    resolvedFindingsCount,
    summary,
  };
}
