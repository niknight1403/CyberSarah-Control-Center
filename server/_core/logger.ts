const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/g,                  // OpenAI/Groq Keys
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,          // Bearer Tokens
  /AIza[0-9A-Za-z-_]{35}/g,                // Google API Keys
  /ghp_[a-zA-Z0-9]{36}/g                   // GitHub Personal Access Tokens
];

export function sanitizeLog(data: any): any {
  if (typeof data === 'string') {
    let cleaned = data;
    for (const pattern of SECRET_PATTERNS) {
      cleaned = cleaned.replace(pattern, '[REDACTED_SECRET]');
    }
    return cleaned;
  }
  if (typeof data === 'object' && data !== null) {
    const copy: any = Array.isArray(data) ? [] : {};
    for (const key of Object.keys(data)) {
      if (/password|secret|key|token|authorization/i.test(key)) {
        copy[key] = '[REDACTED_SECRET]';
      } else {
        copy[key] = sanitizeLog(data[key]);
      }
    }
    return copy;
  }
  return data;
}

export function enableSecureLogging() {
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    originalLog(...args.map(arg => sanitizeLog(arg)));
  };

  const originalError = console.error;
  console.error = (...args: any[]) => {
    originalError(...args.map(arg => sanitizeLog(arg)));
  };

  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    originalWarn(...args.map(arg => sanitizeLog(arg)));
  };
}
