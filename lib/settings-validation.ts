export type FieldValidation = {
  valid: boolean;
  tone: "neutral" | "success" | "error" | "stored";
  message: string;
};

const placeholderHosts = new Set(["example.com", "studio.example.com"]);

export function validateWorkspaceUrl(rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: "Eine öffentliche HTTPS-Adresse ist erforderlich." };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return { valid: false, tone: "error", message: "Nutze eine HTTPS-Adresse, damit Zugangsdaten geschützt übertragen werden." };
    }
    if (!url.hostname || url.username || url.password) {
      return { valid: false, tone: "error", message: "Die Adresse darf keine eingebetteten Zugangsdaten enthalten." };
    }
    if (placeholderHosts.has(url.hostname) || url.hostname.endsWith(".example.com")) {
      return { valid: false, tone: "error", message: "Ersetze die Beispieladresse durch die echte Service-Domain." };
    }
    return { valid: true, tone: "success", message: "HTTPS-Service-Adresse ist gültig." };
  } catch {
    return { valid: false, tone: "error", message: "Gib eine vollständige Adresse wie https://studio.deine-domain.de ein." };
  }
}

export function validateLocalProviderEndpoint(rawValue: string, providerLabel: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: `Eine HTTP(S)-Basisadresse für ${providerLabel} ist erforderlich.` };
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
      return { valid: false, tone: "error", message: "Nutze eine HTTP(S)-Basisadresse ohne Zugangsdaten, Query oder Fragment." };
    }
    if (placeholderHosts.has(url.hostname) || url.hostname.endsWith(".example.com")) {
      return { valid: false, tone: "error", message: "Ersetze die Beispieladresse durch den erreichbaren lokalen Endpoint." };
    }
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
    return { valid: true, tone: "success", message: localHost ? "Adresse ist gültig. Auf Android muss localhost auf dem Telefon erreichbar sein." : "Lokaler Provider-Endpoint ist gültig." };
  } catch {
    return { valid: false, tone: "error", message: "Gib eine vollständige Adresse wie http://192.168.1.20:11434/v1 ein." };
  }
}

export function validateServiceAccessToken(rawValue: string, hasStoredToken: boolean): FieldValidation {
  const value = rawValue.trim();
  if (!value && hasStoredToken) {
    return { valid: true, tone: "stored", message: "Ein verschlüsselter Token ist bereits auf diesem Gerät gespeichert." };
  }
  if (!value) {
    return { valid: false, tone: "neutral", message: "Ein Service-Zugriffstoken mit mindestens 24 Zeichen ist erforderlich." };
  }
  if (/^bearer\s+/i.test(value)) {
    return { valid: false, tone: "error", message: "Füge nur den Token ein – der Bearer-Präfix wird automatisch gesetzt." };
  }
  if (/\s/.test(value)) {
    return { valid: false, tone: "error", message: "Der Token darf keine Leerzeichen oder Zeilenumbrüche enthalten." };
  }
  if (/replace|example|your[-_ ]?token/i.test(value)) {
    return { valid: false, tone: "error", message: "Ersetze den Platzhalter durch den echten Service-Zugriffstoken." };
  }
  if (value.length < 24) {
    return { valid: false, tone: "error", message: "Der Token ist zu kurz. Verwende mindestens 24 Zeichen." };
  }
  return { valid: true, tone: "success", message: "Service-Zugriffstoken hat ein gültiges Format." };
}
