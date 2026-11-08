/**
 * Live-Verifikation der Betriebs-Integrationen (rein, testbar).
 *
 * Warum diese Datei existiert:
 * `lib/integration-registry-logic.ts` beantwortet die Frage "ist der
 * Schluessel GESETZT?" — also reine ENV-Pruefung ohne Netzaufruf. Genau
 * das reicht nicht: Am 08.11.2026 war der Resend-Key vorhanden und der
 * Audit gruen, waehrend die Absenderdomain `cybersarah-ki.com` bei Resend
 * auf `not_started` stand und damit jeder Mailversand toter Briefkasten
 * war. Gesetzt ist nicht gleich funktionsfaehig.
 *
 * Diese Datei entscheidet deshalb ueber das, was die Provider-Antwort
 * TATSAECHLICH sagt: HTTP-Status + Response-Body. Sie macht keine
 * Netzaufrufe selbst, damit jeder Fall (Key abgelehnt, Domain fehlt,
 * Domain unverifiziert, DNS-Record fehlt) ohne Live-Zugang testbar ist.
 *
 * Grenze: lesend. Kein Versand, kein Posting, keine Budgetaenderung.
 */

export type ProbeSeverity = "pass" | "warn" | "skip" | "fail";

/** Die drei Integrationen, die live (statt nur per ENV) geprueft werden. */
export type LiveProbeProvider = "resend" | "tiktok" | "meta";

export type ProbeResult = {
  name: string;
  severity: ProbeSeverity;
  detail: string;
  /** Erst ab der Durchfuehrung gesetzt; die reinen Auswerter kennen ihn nicht. */
  provider?: LiveProbeProvider;
};

/** Platzhalter, die in .env.example / Vorlagen stehen und nie echte Keys sind. */
const PLACEHOLDER_FRAGMENTS = [
  "changeme",
  "change-me",
  "your-",
  "your_",
  "placeholder",
  "dummy",
  "example",
  "todo",
  "xxx",
  "***",
  "…",
  "<client-key>",
  "<client-secret>",
  "re_***",
];

/**
 * Erkennt Werte, die zwar nicht leer sind, aber offensichtlich aus einer
 * Vorlage stammen. Ein gesetzter Platzhalter ist fuer den Audit NICHT
 * "konfiguriert" — sonst meldet das Dashboard Gruen fuer einen Key, mit
 * dem jeder Aufruf 401 zurueckkommt.
 */
export function isPlaceholderValue(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return true;
  const lowered = trimmed.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some((fragment) => lowered.includes(fragment));
}

/** Ein Key, der live geprueft werden kann: gesetzt, kein Platzhalter. */
export function isUsableCredential(value: string | null | undefined): value is string {
  return typeof value === "string" && !isPlaceholderValue(value);
}

/** Resend-Keys beginnen mit `re_`; alles andere ist ein Konfigurationsfehler. */
export function looksLikeResendKey(value: string | null | undefined): boolean {
  return isUsableCredential(value) && value.trim().startsWith("re_") && value.trim().length >= 12;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Resend: Absenderdomain + DNS-Records
// ---------------------------------------------------------------------------

export type ResendDomainStatus = "verified" | "pending" | "not_started" | "failure" | "temporary_failure" | "unknown";

export type ResendDomain = {
  id: string;
  name: string;
  status: ResendDomainStatus;
};

export type ResendDomainsEvaluation = {
  severity: ProbeSeverity;
  detail: string;
  domain: ResendDomain | null;
};

const RESEND_DOMAIN_STATUSES: readonly ResendDomainStatus[] = [
  "verified",
  "pending",
  "not_started",
  "failure",
  "temporary_failure",
];

/**
 * Bewertet `GET https://api.resend.com/domains`.
 *
 * Severity-Politik (bewusst so, siehe Sprint-Audit-Begruendung):
 *   fail — Key abgelehnt, Domain fehlt, Domain nicht verifiziert.
 *          Wer eine Absenderdomain eintraegt und dann nicht verifiziert,
 *          hat Mails, die niemand empfaengt. Das ist ein Ausfall, keine
 *          Geschmacksfrage.
 *   skip — Domain ist `pending`: DNS-Records sind gesetzt, Resend prueft
 *          nur noch. Kein Handlungsbedarf, aber sichtbar.
 */
export function evaluateResendDomains(
  httpStatus: number,
  body: unknown,
  expectedDomain: string | null | undefined,
): ResendDomainsEvaluation {
  if (httpStatus === 401 || httpStatus === 403) {
    return { severity: "fail", detail: `Resend lehnt den API-Key ab (HTTP ${httpStatus})`, domain: null };
  }
  if (httpStatus !== 200) {
    return { severity: "warn", detail: `Resend /domains antwortet HTTP ${httpStatus}`, domain: null };
  }

  const record = asRecord(body);
  const rawList = record?.data;
  if (!Array.isArray(rawList)) {
    return { severity: "warn", detail: "Resend /domains liefert kein verwertbares Datenfeld", domain: null };
  }

  const domains: ResendDomain[] = rawList.flatMap((entry) => {
    const item = asRecord(entry);
    const id = asString(item?.id);
    const name = asString(item?.name);
    if (!id || !name) return [];
    const rawStatus = asString(item?.status)?.toLowerCase() ?? "unknown";
    const status = (RESEND_DOMAIN_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as ResendDomainStatus)
      : "unknown";
    return [{ id, name: name.toLowerCase(), status }];
  });

  if (domains.length === 0) {
    return { severity: "fail", detail: "Keine Absenderdomain im Resend-Account hinterlegt", domain: null };
  }

  const wanted = expectedDomain?.trim().toLowerCase() || null;
  const domain = (wanted ? domains.find((entry) => entry.name === wanted) : undefined) ?? domains[0]!;

  switch (domain.status) {
    case "verified":
      return { severity: "pass", detail: `${domain.name} ist bei Resend verifiziert`, domain };
    case "pending":
      return { severity: "warn", detail: `${domain.name}: DNS-Records gesetzt, Verifizierung laeuft`, domain };
    case "not_started":
      return {
        severity: "fail",
        detail: `${domain.name}: Verifizierung nie gestartet — DNS-Records fehlen, Mailversand ist tot`,
        domain,
      };
    case "failure":
    case "temporary_failure":
      return { severity: "fail", detail: `${domain.name}: Verifizierung fehlgeschlagen (Status ${domain.status})`, domain };
    default:
      return { severity: "warn", detail: `${domain.name}: unbekannter Resend-Status "${domain.status}"`, domain };
  }
}

export type ResendRecord = {
  record: string;
  name: string;
  type: string;
  status: string;
  value: string;
};

/** Liest die von Resend geforderten DNS-Records aus `GET /domains/{id}`. */
export function extractResendRecords(body: unknown): ResendRecord[] {
  const list = asRecord(body)?.records;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const item = asRecord(entry);
    const name = asString(item?.name);
    const type = asString(item?.type);
    if (!name || !type) return [];
    return [
      {
        record: asString(item?.record) ?? type.toUpperCase(),
        name: name.toLowerCase().replace(/\.$/, ""),
        type: type.toUpperCase(),
        status: (asString(item?.status) ?? "unknown").toLowerCase(),
        value: asString(item?.value) ?? "",
      },
    ];
  });
}

/**
 * TXT-Werte kommen aus DNS gequotet und in Chunks zerlegt zurueck
 * ("v=spf1 ..." / "\"abc\" \"def\""). Vergleich daher normalisiert und
 * ueber Teilstring, weil Resend bei DKIM den ganzen Public-Key erwartet,
 * DNS ihn aber umbrechen darf.
 */
export function normalizeDnsTextValue(value: string): string {
  return value
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function dnsRecordIsPresent(required: ResendRecord, liveValues: readonly string[]): boolean {
  if (liveValues.length === 0) return false;
  const wanted = normalizeDnsTextValue(required.value);
  if (wanted.length === 0) return true;
  // Der praegnanteste Teil des Records reicht fuer "vorhanden" — Resend
  // liefert bei DKIM einen sehr langen Schluessel, DNS chunkt ihn.
  const probe = wanted.slice(0, 32);
  return liveValues.some((value) => normalizeDnsTextValue(value).includes(probe));
}

export type DnsAlignment = {
  severity: ProbeSeverity;
  detail: string;
  missing: string[];
  present: string[];
};

/** Vergleicht die von Resend geforderten Records mit dem, was live im DNS steht. */
export function evaluateDnsAlignment(
  required: readonly ResendRecord[],
  liveByRecord: Readonly<Record<string, readonly string[]>>,
): DnsAlignment {
  if (required.length === 0) {
    return { severity: "warn", detail: "Resend liefert keine DNS-Record-Vorgaben", missing: [], present: [] };
  }
  const missing: string[] = [];
  const present: string[] = [];
  for (const record of required) {
    const key = `${record.type}:${record.name}`;
    const liveValues = liveByRecord[key] ?? [];
    const label = `${record.type} ${record.name}`;
    if (dnsRecordIsPresent(record, liveValues)) present.push(label);
    else missing.push(label);
  }
  if (missing.length === 0) {
    return {
      severity: "pass",
      detail: `alle ${required.length} Resend-DNS-Records live vorhanden`,
      missing,
      present,
    };
  }
  return {
    severity: "fail",
    detail: `${missing.length}/${required.length} DNS-Records fehlen: ${missing.join(", ")}`,
    missing,
    present,
  };
}

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

/**
 * Bewertet den Client-Credentials-Aufruf gegen
 * `POST https://open.tiktokapis.com/v2/oauth/token/`.
 *
 * TikTok beantwortet falsche Client-Daten mit `invalid_client`; ein
 * `unsupported_grant_type` bedeutet dagegen, dass der Grant fuer diese App
 * nicht freigeschaltet ist — dann ist der Key nicht widerlegt, nur
 * unpruefbar. Das darf keinen roten Audit erzeugen.
 */
export function evaluateTikTokClientProbe(httpStatus: number, body: unknown): ProbeResult {
  const record = asRecord(body);
  const error = asString(record?.error)?.toLowerCase() ?? null;
  const description = asString(record?.error_description) ?? asString(record?.message) ?? "";

  if (error === "invalid_client" || error === "invalid_client_id" || error === "invalid_client_key") {
    return {
      name: "TikTok Client-Credentials",
      severity: "fail",
      detail: `TikTok lehnt Client-Key/Secret ab (${error}${description ? `: ${description}` : ""})`,
    };
  }
  if (asString(record?.access_token)) {
    return { name: "TikTok Client-Credentials", severity: "pass", detail: "Client-Credentials akzeptiert" };
  }
  if (error === "unsupported_grant_type") {
    return {
      name: "TikTok Client-Credentials",
      severity: "skip",
      detail: "client_credentials fuer diese App nicht freigeschaltet — Key nicht pruefbar",
    };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { name: "TikTok Client-Credentials", severity: "fail", detail: `HTTP ${httpStatus} bei Client-Pruefung` };
  }
  return {
    name: "TikTok Client-Credentials",
    severity: "warn",
    detail: `HTTP ${httpStatus}${error ? ` (${error})` : ""} — Pruefung nicht eindeutig`,
  };
}

/** Bewertet `GET /v2/user/info/` mit dem hinterlegten Access-Token. */
export function evaluateTikTokTokenProbe(httpStatus: number, body: unknown): ProbeResult {
  const record = asRecord(body);
  const errorCode = asString(asRecord(record?.error)?.code)?.toLowerCase() ?? null;
  if (httpStatus === 401 || errorCode === "access_token_invalid" || errorCode === "access_token_expired") {
    return { name: "TikTok Access-Token", severity: "fail", detail: `Token ungueltig (HTTP ${httpStatus})` };
  }
  const data = asRecord(record?.data);
  const user = asRecord(data?.user);
  const displayName = asString(user?.display_name);
  if (httpStatus === 200 && data) {
    return {
      name: "TikTok Access-Token",
      severity: "pass",
      detail: displayName ? `lesend bestaetigt (${displayName})` : "lesend bestaetigt",
    };
  }
  return { name: "TikTok Access-Token", severity: "warn", detail: `HTTP ${httpStatus} — Token nicht bestaetigt` };
}

// ---------------------------------------------------------------------------
// Meta / Instagram
// ---------------------------------------------------------------------------

/** Bewertet `GET https://graph.facebook.com/v21.0/me` mit dem hinterlegten Token. */
export function evaluateMetaTokenProbe(httpStatus: number, body: unknown): ProbeResult {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const errorCode = typeof error?.code === "number" ? error.code : null;
  const errorMessage = asString(error?.message) ?? "";

  if (httpStatus === 200 && asString(record?.id)) {
    return {
      name: "Meta Access-Token",
      severity: "pass",
      detail: asString(record?.name) ? `lesend bestaetigt (${asString(record?.name)})` : "lesend bestaetigt",
    };
  }
  // 190 = invalid/expired OAuth token, 102 = session expired, 100 = invalid parameter.
  if (errorCode === 190 || errorCode === 102 || httpStatus === 401) {
    return {
      name: "Meta Access-Token",
      severity: "fail",
      detail: `Token abgelehnt (Code ${errorCode ?? httpStatus}${errorMessage ? `: ${errorMessage}` : ""})`,
    };
  }
  return { name: "Meta Access-Token", severity: "warn", detail: `HTTP ${httpStatus} — Token nicht bestaetigt` };
}

/** Bewertet `GET /{app-id}` mit App-ID|App-Secret zur Key-Pruefung ohne Nutzer-Token. */
export function evaluateMetaAppProbe(httpStatus: number, body: unknown): ProbeResult {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const errorCode = typeof error?.code === "number" ? error.code : null;
  if (httpStatus === 200 && asString(record?.id)) {
    return { name: "Meta App-Credentials", severity: "pass", detail: "App-ID/Secret akzeptiert" };
  }
  if (errorCode !== null || httpStatus === 401 || httpStatus === 400) {
    return {
      name: "Meta App-Credentials",
      severity: "fail",
      detail: `Meta lehnt App-Credentials ab (Code ${errorCode ?? httpStatus})`,
    };
  }
  return { name: "Meta App-Credentials", severity: "warn", detail: `HTTP ${httpStatus} — nicht bestaetigt` };
}

// ---------------------------------------------------------------------------
// Zusammenfassung / Exit-Code
// ---------------------------------------------------------------------------

export type ProbeSummary = {
  total: number;
  passed: number;
  warned: number;
  skipped: number;
  failed: number;
  exitCode: number;
};

/**
 * `--strict` macht Warnungen zu Fehlern (fuer Release-Gates).
 * Standard ist absichtlich tolerant: fehlende Schluessel erzeugen Skip,
 * aber alles, was live widerlegt wurde, bleibt rot.
 */
export function summarizeProbes(results: readonly ProbeResult[], strict = false): ProbeSummary {
  const count = (severity: ProbeSeverity) => results.filter((result) => result.severity === severity).length;
  const failed = count("fail");
  const warned = count("warn");
  return {
    total: results.length,
    passed: count("pass"),
    warned,
    skipped: count("skip"),
    failed,
    exitCode: failed > 0 || (strict && warned > 0) ? 1 : 0,
  };
}

/**
 * Gesamturteil einer Pruefliste. "Alles uebersprungen" ist bewusst `warn`
 * und nicht `pass`: ein Lauf ohne eine einzige echte Pruefung darf nicht
 * wie ein gruener Haken aussehen.
 */
export function computeProbeOverall(results: readonly ProbeResult[]): "pass" | "warn" | "fail" {
  if (results.some((result) => result.severity === "fail")) return "fail";
  if (results.some((result) => result.severity === "warn")) return "warn";
  if (results.length === 0 || results.every((result) => result.severity === "skip")) return "warn";
  return "pass";
}
