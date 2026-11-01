/** Typen fuer die HubSpot-CRM-Anbindung: Contacts, Companies, Deals. */

export type HubspotObjectType = "contacts" | "companies" | "deals";

export interface HubspotObject {
  id: string;
  properties: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactInput {
  email: string;
  firstname?: string;
  lastname?: string;
  lifecyclestage?: string;
  phone?: string;
}

export interface CompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  city?: string;
}

export interface DealInput {
  dealname: string;
  amount?: number;
  dealstage: string;
  pipeline?: string;
  closedate?: string;
  /** Owner-Zuordnung; ohne sie landet der Deal im MRR unter "Nicht zugewiesen". */
  hubspotOwnerId?: string;
  /** Verknuepfter Kontakt (optional, wird als Assoziation angelegt). */
  contactId?: string;
}

export type SearchOperator =
  | "EQ"
  | "NEQ"
  | "CONTAINS_TOKEN"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "HAS_PROPERTY";

export interface SearchRequest {
  objectType: HubspotObjectType;
  filters: Array<{
    propertyName: string;
    operator: SearchOperator;
    value?: string;
  }>;
  properties?: string[];
  limit?: number;
}

export interface SearchResult {
  total: number;
  results: HubspotObject[];
}

/** Fehler mit HubSpot-Statuscode, damit Aufrufer 429/404 unterscheiden koennen. */
export class HubspotApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, body: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "HubspotApiError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Konfigurationsfehler: Token fehlt oder hat ein ungueltiges Format. */
export class HubspotConfigError extends Error {
  readonly field: string;

  constructor(message: string, field = "HUBSPOT_ACCESS_TOKEN") {
    super(message);
    this.name = "HubspotConfigError";
    this.field = field;
  }
}
