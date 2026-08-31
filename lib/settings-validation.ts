const placeholderHosts = new Set(["example.com", "studio.example.com"]);

export interface FieldValidation {
  valid: boolean;
  tone: "neutral" | "error" | "success" | "stored";
  message: string;
}

function isIpAddress(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === "localhost" || hostname === "127.0.0.1";
}

export function validateWorkspaceUrl(rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) return { valid: false, tone: "neutral", message: "Eine URL wird benoetigt." };
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return { valid: false, tone: "error", message: "Nutze http oder https." };
    if (!url.hostname || url.username || url.password) return { valid: false, tone: "error", message: "Die Adresse ist ungueltig." };
    if (placeholderHosts.has(url.hostname) || url.hostname.endsWith(".example.com")) return { valid: false, tone: "error", message: "Ersetze den Platzhalter." };
    if (url.protocol === "http:" && !isIpAddress(url.hostname)) return { valid: false, tone: "error", message: "Fuer Domains ist HTTPS erforderlich." };
    return { valid: true, tone: "success", message: "URL ist gueltig." };
  } catch { return { valid: false, tone: "error", message: "Gib eine gueltige URL ein." }; }
}

export function validateLocalProviderEndpoint(rawValue: string, providerName: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) return { valid: false, tone: "neutral", message: `${providerName}-Endpunkt wird benoetigt.` };
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return { valid: false, tone: "error", message: "Nutze http oder https." };
    if (!url.hostname || url.username || url.password) return { valid: false, tone: "error", message: "Die Adresse ist ungueltig." };
    if (url.protocol === "http:" && !isIpAddress(url.hostname)) return { valid: false, tone: "error", message: `Fuer ${providerName}-Domains ist HTTPS erforderlich.` };
    return { valid: true, tone: "success", message: `${providerName}-Endpunkt ist gueltig.` };
  } catch { return { valid: false, tone: "error", message: "Gib eine gueltige URL ein." }; }
}

export function validateServiceAccessToken(rawValue: string, hasStoredToken: boolean): FieldValidation {
  const value = rawValue.trim();
  if (!value && hasStoredToken) return { valid: true, tone: "stored", message: "Token ist sicher gespeichert." };
  if (!value) return { valid: false, tone: "neutral", message: "Ein Token wird benoetigt." };
  if (value.startsWith("Bearer ")) return { valid: false, tone: "error", message: "Token ohne Bearer-Prefix eingeben." };
  if (/\s/.test(value)) return { valid: false, tone: "error", message: "Token darf keine Leerzeichen enthalten." };
  if (value.length < 16) return { valid: false, tone: "error", message: "Token ist zu kurz." };
  return { valid: true, tone: "success", message: "Token gesetzt." };
}
