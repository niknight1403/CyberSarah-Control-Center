/**
 * Sprint 360 — Konfigurations-Screen: maskierte Umgebungs-Ansicht.
 *
 * Zeigt System- und Umgebungsvariablen mit automatischer Erkennung und
 * Maskierung von Geheimnissen (Secrets, Keys, Passwörter, Tokens).
 * Bietet Audit-geschütztes Aufdecken für Admins und Konfigurations-Validierung.
 */

export type ConfigCategory =
  | "Database"
  | "Auth"
  | "Security"
  | "Server"
  | "Storage"
  | "Integrations"
  | "General";

export type ConfigValueType = "string" | "number" | "boolean" | "url" | "json";

export interface ConfigItem {
  key: string;
  rawValue: string;
  maskedValue: string;
  isSecret: boolean;
  category: ConfigCategory;
  valueType: ConfigValueType;
  source: "environment" | "file" | "database" | "default";
  isRequired: boolean;
  isValid: boolean;
  validationError?: string;
  description?: string;
}

export interface ConfigViewFilter {
  category?: ConfigCategory;
  searchQuery?: string;
  onlySecrets?: boolean;
  onlyInvalid?: boolean;
}

export interface ConfigAuditEntry {
  timestamp: number;
  actorUserId: string;
  actorRole: string;
  action: "view_masked" | "unmask_secret" | "export_config";
  key?: string;
  ipAddress?: string;
}

const SENSITIVE_KEYWORDS = [
  "SECRET",
  "KEY",
  "TOKEN",
  "PASSWORD",
  "PASS",
  "PWD",
  "CREDENTIAL",
  "PRIVATE",
  "DATABASE_URL",
  "DB_URL",
  "CONNECTION_STRING",
  "PEPPER",
  "SALT",
  "SIGNING",
];

export class ConfigViewManager {
  private configMap: Map<string, ConfigItem> = new Map();
  private auditLogs: ConfigAuditEntry[] = [];

  constructor() {
    this.initDefaultConfig();
  }

  private initDefaultConfig(): void {
    const defaults: ConfigItem[] = [
      {
        key: "NODE_ENV",
        rawValue: "production",
        maskedValue: "production",
        isSecret: false,
        category: "Server",
        valueType: "string",
        source: "environment",
        isRequired: true,
        isValid: true,
        description: "Laufzeitumgebung (production, staging, development)",
      },
      {
        key: "PORT",
        rawValue: "3000",
        maskedValue: "3000",
        isSecret: false,
        category: "Server",
        valueType: "number",
        source: "environment",
        isRequired: true,
        isValid: true,
        description: "HTTP-Listen-Port des Control-Centers",
      },
      {
        key: "DATABASE_URL",
        rawValue: "postgresql://cybersarah_usr:P%40ssw0rd2026!@postgres.internal:5432/controlcenter_db",
        maskedValue: "postgresql://cybersarah_usr:****@postgres.internal:5432/controlcenter_db",
        isSecret: true,
        category: "Database",
        valueType: "url",
        source: "environment",
        isRequired: true,
        isValid: true,
        description: "PostgreSQL-Verbindungs-URL",
      },
      {
        key: "JWT_SECRET",
        rawValue: "super-secret-jwt-signing-key-2026-cybersarah-prod-v2",
        maskedValue: "supe****-v2",
        isSecret: true,
        category: "Auth",
        valueType: "string",
        source: "environment",
        isRequired: true,
        isValid: true,
        description: "HMAC-Schlüssel für Session-Tokens",
      },
      {
        key: "GITHUB_TOKEN",
        rawValue: "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        maskedValue: "ghp_****wxyz",
        isSecret: true,
        category: "Integrations",
        valueType: "string",
        source: "environment",
        isRequired: false,
        isValid: true,
        description: "GitHub API Personal Access Token für Repository-Sync",
      },
      {
        key: "STRIPE_API_KEY",
        rawValue: "sk_test_51M00000000000000000000000000000000000000000",
        maskedValue: "sk_test_****0000",
        isSecret: true,
        category: "Integrations",
        valueType: "string",
        source: "environment",
        isRequired: false,
        isValid: true,
        description: "Stripe Secret Key für Abrechnungs-Workflows",
      },
      {
        key: "STORAGE_S3_ENDPOINT",
        rawValue: "https://s3.eu-central-1.hetzner.cloud",
        maskedValue: "https://s3.eu-central-1.hetzner.cloud",
        isSecret: false,
        category: "Storage",
        valueType: "url",
        source: "environment",
        isRequired: false,
        isValid: true,
        description: "S3-kompatibler Objekt-Speicher Endpoint",
      },
      {
        key: "MAX_LOG_RETENTION_DAYS",
        rawValue: "90",
        maskedValue: "90",
        isSecret: false,
        category: "General",
        valueType: "number",
        source: "default",
        isRequired: false,
        isValid: true,
        description: "Aufbewahrungsdauer für Audit- & System-Logs in Tagen",
      },
    ];

    defaults.forEach((item) => this.configMap.set(item.key, item));
  }

  public isSensitiveKey(key: string): boolean {
    const upperKey = key.toUpperCase();
    return SENSITIVE_KEYWORDS.some((kw) => upperKey.includes(kw));
  }

  public maskValue(value: string, key: string): string {
    if (!this.isSensitiveKey(key)) return value;
    if (!value || value.length === 0) return "••••••••";

    if (value.startsWith("postgresql://") || value.startsWith("postgres://")) {
      return value.replace(/:\/\/(.*?):(.*?)@/, "://$1:****@");
    }

    if (value.length <= 8) {
      return "••••••••";
    }

    const prefix = value.slice(0, 4);
    const suffix = value.slice(-4);
    return `${prefix}****${suffix}`;
  }

  public setConfigVariable(
    key: string,
    value: string,
    category: ConfigCategory = "General",
    options?: { description?: string; source?: ConfigItem["source"]; isRequired?: boolean }
  ): ConfigItem {
    const isSecret = this.isSensitiveKey(key);
    const maskedValue = this.maskValue(value, key);

    let isValid = true;
    let validationError: string | undefined;

    if (options?.isRequired && (!value || value.trim() === "")) {
      isValid = false;
      validationError = `Erforderliche Variable '${key}' hat keinen Wert.`;
    }

    const item: ConfigItem = {
      key,
      rawValue: value,
      maskedValue,
      isSecret,
      category,
      valueType: this.inferValueType(value),
      source: options?.source || "environment",
      isRequired: options?.isRequired ?? false,
      isValid,
      validationError,
      description: options?.description,
    };

    this.configMap.set(key, item);
    return item;
  }

  private inferValueType(val: string): ConfigValueType {
    if (val === "true" || val === "false") return "boolean";
    if (!isNaN(Number(val)) && val.trim() !== "") return "number";
    if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("postgresql://")) {
      return "url";
    }
    if (val.startsWith("{") || val.startsWith("[")) {
      try {
        JSON.parse(val);
        return "json";
      } catch {
        /* ignore */
      }
    }
    return "string";
  }

  public getConfigItems(filter?: ConfigViewFilter): ConfigItem[] {
    let items = Array.from(this.configMap.values());

    if (!filter) return items;

    if (filter.category) {
      items = items.filter((item) => item.category === filter.category);
    }
    if (filter.onlySecrets) {
      items = items.filter((item) => item.isSecret);
    }
    if (filter.onlyInvalid) {
      items = items.filter((item) => !item.isValid);
    }
    if (filter.searchQuery && filter.searchQuery.trim() !== "") {
      const q = filter.searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.key.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q))
      );
    }

    return items;
  }

  public getMaskedView(
    actorUserId: string,
    actorRole: string,
    filter?: ConfigViewFilter
  ): Omit<ConfigItem, "rawValue">[] {
    this.recordAudit({
      timestamp: Date.now(),
      actorUserId,
      actorRole,
      action: "view_masked",
    });

    const items = this.getConfigItems(filter);
    return items.map(({ rawValue, ...rest }) => rest);
  }

  public unmaskSecret(
    key: string,
    actorUserId: string,
    actorRole: string,
    ipAddress?: string
  ): { success: boolean; rawValue?: string; message: string } {
    if (actorRole !== "admin") {
      return {
        success: false,
        message: `Zugriff verweigert. Aufdecken von '${key}' erfordert die Rolle 'admin' (aktuell: '${actorRole}').`,
      };
    }

    const item = this.configMap.get(key);
    if (!item) {
      return {
        success: false,
        message: `Konfigurationsschlüssel '${key}' nicht gefunden.`,
      };
    }

    this.recordAudit({
      timestamp: Date.now(),
      actorUserId,
      actorRole,
      action: "unmask_secret",
      key,
      ipAddress,
    });

    return {
      success: true,
      rawValue: item.rawValue,
      message: `Schlüssel '${key}' erfolgreich aufgedeckt.`,
    };
  }

  public exportMaskedConfig(actorUserId: string, actorRole: string): string {
    this.recordAudit({
      timestamp: Date.now(),
      actorUserId,
      actorRole,
      action: "export_config",
    });

    const items = this.getConfigItems();
    const exportData = items.map((item) => ({
      key: item.key,
      value: item.maskedValue,
      category: item.category,
      isSecret: item.isSecret,
      source: item.source,
      isValid: item.isValid,
    }));

    return JSON.stringify(exportData, null, 2);
  }

  public getAuditLogs(): ConfigAuditEntry[] {
    return [...this.auditLogs];
  }

  private recordAudit(entry: ConfigAuditEntry): void {
    this.auditLogs.unshift(entry);
  }

  public resetToDefault(): void {
    this.configMap.clear();
    this.auditLogs = [];
    this.initDefaultConfig();
  }
}

export const configViewManager = new ConfigViewManager();
