const placeholderHosts = new Set(["example.com", "studio.example.com"]);

export interface FieldValidation {
  valid: boolean;
  tone: "neutral" | "error" | "success";
  message: string;
}

function isIpAddress(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === "localhost";
}

export function validateWorkspaceUrl(rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: "Eine URL wird benötigt." };
  }
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) {
      return { valid: false, tone: "error", message: "Nutze http oder https." };
    }
    if (!url.hostname || url.username || url.password) {
      return { valid: false, tone: "error", message: "Die Adresse ist ungültig." };
    }
    if (placeholderHosts.has(url.hostname) || url.hostname.endsWith(".example.com")) {
      return { valid: false, tone: "error", message: "Ersetze den Platzhalter." };
    }
    if (url.protocol === "http:" && !isIpAddress(url.hostname)) {
      return { valid: false, tone: "error", message: "Für Domains ist HTTPS erforderlich." };
    }
    return { valid: true, tone: "success", message: "URL ist gültig." };
  } catch {
    return { valid: false, tone: "error", message: "Gib eine gültige URL ein." };
  }
}

export function validateLocalProviderEndpoint(rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: "Ein Endpunkt wird benötigt." };
  }
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) {
      return { valid: false, tone: "error", message: "Nutze http oder https." };
    }
    if (!url.hostname) {
      return { valid: false, tone: "error", message: "Die Adresse ist ungültig." };
    }
    return { valid: true, tone: "success", message: "Endpunkt ist gültig." };
  } catch {
    return { valid: false, tone: "error", message: "Gib eine gültige URL ein." };
  }
}

export function validateServiceAccessToken(rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: "Ein Token wird benötigt." };
  }
  if (value.length < 16) {
    return { valid: false, tone: "error", message: "Token ist zu kurz." };
  }
  return { valid: true, tone: "success", message: "Token gesetzt." };
}
