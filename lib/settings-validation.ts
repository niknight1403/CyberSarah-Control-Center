const placeholderHosts = new Set(["example.com", "studio.example.com"]);

export function validateWorkspaceUrl(rawValue: string) {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, tone: "neutral", message: "Eine URL wird benötigt." };
  }

  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return { valid: false, tone: 'error', message: 'Nutze http oder https.' };
    }
    if (!url.hostname || url.username || url.password) {
      return { valid: false, tone: "error", message: "Die Adresse ist ungültig." };
    }
    if (placeholderHosts.has(url.hostname) || url.hostname.endsWith(".example.com")) {
      return { valid: false, tone: "error", message: "Ersetze den Platzhalter." };
    }
    return { valid: true, tone: "success", message: "HTTPS-URL ist gültig." };
  } catch {
    return { valid: false, tone: "error", message: "Gib eine gültige URL ein." };
  }
}
