/**
 * HubSpot-Service: Contacts, Companies, Deals und die Search-API.
 *
 * Der Service kapselt die CRM-v3-Pfade und ergaenzt sie um das, was im
 * Betrieb fehlt: idempotentes Anlegen (Upsert nach Email bzw. Domain),
 * Eingabepruefung und eine klare Fehlersemantik.
 */
import { HubspotClient, type HubspotAccountDetails } from "./client";
import {
  HubspotApiError,
  type ContactInput,
  type CompanyInput,
  type DealInput,
  type HubspotObject,
  type SearchRequest,
  type SearchResult,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTACT_PROPERTIES = ["email", "firstname", "lastname", "lifecyclestage", "phone"];
const COMPANY_PROPERTIES = ["name", "domain", "industry", "city"];

function cleanProperties(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    out[key] = text;
  }
  return out;
}

function normalizeEmail(email: string): string {
  const value = String(email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(value)) throw new Error(`Ungueltige E-Mail-Adresse: ${email}`);
  return value;
}

function normalizeDomain(domain: string): string {
  const value = String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) throw new Error(`Ungueltige Domain: ${domain}`);
  return value;
}

export interface HubspotServiceLike {
  createContact(input: ContactInput): Promise<HubspotObject>;
  findContactByEmail(email: string): Promise<HubspotObject | null>;
  upsertContact(input: ContactInput): Promise<{ created: boolean; contact: HubspotObject }>;
  upsertCompany(input: CompanyInput): Promise<{ created: boolean; company: HubspotObject }>;
  createDeal(input: DealInput): Promise<HubspotObject>;
  updateDealStage(dealId: string, input: Partial<DealInput> & { dealstage: string }): Promise<HubspotObject>;
  search(request: SearchRequest): Promise<SearchResult>;
  getObject(objectType: string, id: string, properties?: string[]): Promise<HubspotObject>;
  getAccountDetails(): Promise<HubspotAccountDetails>;
}

export class HubspotService implements HubspotServiceLike {
  constructor(private readonly client: HubspotClient) {}

  async createContact(input: ContactInput): Promise<HubspotObject> {
    const properties = cleanProperties({ ...input, email: normalizeEmail(input.email) });
    return this.client.request<HubspotObject>("/crm/v3/objects/contacts", {
      method: "POST",
      body: { properties },
    });
  }

  async findContactByEmail(email: string): Promise<HubspotObject | null> {
    const result = await this.search({
      objectType: "contacts",
      filters: [{ propertyName: "email", operator: "EQ", value: normalizeEmail(email) }],
      properties: CONTACT_PROPERTIES,
      limit: 1,
    });
    return result.results[0] ?? null;
  }

  /** Legt den Kontakt an oder aktualisiert ihn (idempotent nach E-Mail). */
  async upsertContact(input: ContactInput): Promise<{ created: boolean; contact: HubspotObject }> {
    const properties = cleanProperties({ ...input, email: normalizeEmail(input.email) });
    try {
      const contact = await this.createContact(input);
      return { created: true, contact };
    } catch (error) {
      if (!(error instanceof HubspotApiError) || error.status !== 409) throw error;
      const existing = await this.findContactByEmail(input.email);
      if (!existing) throw error;
      const updated = await this.client.request<HubspotObject>(
        `/crm/v3/objects/contacts/${existing.id}`,
        { method: "PATCH", body: { properties } },
      );
      return { created: false, contact: updated };
    }
  }

  async upsertCompany(input: CompanyInput): Promise<{ created: boolean; company: HubspotObject }> {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Firmenname ist erforderlich.");
    const properties = cleanProperties({
      ...input,
      name,
      domain: input.domain ? normalizeDomain(input.domain) : undefined,
    });
    if (properties.domain) {
      const found = await this.search({
        objectType: "companies",
        filters: [{ propertyName: "domain", operator: "EQ", value: properties.domain }],
        properties: COMPANY_PROPERTIES,
        limit: 1,
      });
      const existing = found.results[0];
      if (existing) {
        const company = await this.client.request<HubspotObject>(
          `/crm/v3/objects/companies/${existing.id}`,
          { method: "PATCH", body: { properties } },
        );
        return { created: false, company };
      }
    }
    const company = await this.client.request<HubspotObject>("/crm/v3/objects/companies", {
      method: "POST",
      body: { properties },
    });
    return { created: true, company };
  }

  async createDeal(input: DealInput): Promise<HubspotObject> {
    const dealname = String(input.dealname ?? "").trim();
    if (!dealname) throw new Error("Dealname ist erforderlich.");
    if (!String(input.dealstage ?? "").trim()) throw new Error("dealstage ist erforderlich.");
    if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0)) {
      throw new Error("amount muss eine nicht-negative Zahl sein.");
    }
    const properties = cleanProperties({
      dealname,
      dealstage: input.dealstage,
      amount: input.amount === undefined ? undefined : String(input.amount),
      pipeline: input.pipeline,
      closedate: input.closedate,
      hubspot_owner_id: input.hubspotOwnerId,
    });
    const associations = input.contactId
      ? [
          {
            to: { id: input.contactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 3,
              },
            ],
          },
        ]
      : undefined;
    return this.client.request<HubspotObject>("/crm/v3/objects/deals", {
      method: "POST",
      body: { properties, ...(associations ? { associations } : {}) },
    });
  }

  async updateDealStage(
    dealId: string,
    input: Partial<DealInput> & { dealstage: string },
  ): Promise<HubspotObject> {
    const id = String(dealId ?? "").trim();
    if (!id) throw new Error("dealId ist erforderlich.");
    if (!String(input.dealstage ?? "").trim()) throw new Error("dealstage ist erforderlich.");
    const properties = cleanProperties({
      dealstage: input.dealstage,
      hubspot_owner_id: input.hubspotOwnerId,
      amount: input.amount === undefined ? undefined : String(input.amount),
      closedate: input.closedate,
    });
    return this.client.request<HubspotObject>(`/crm/v3/objects/deals/${id}`, {
      method: "PATCH",
      body: { properties },
    });
  }

  async search(request: SearchRequest): Promise<SearchResult> {
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);
    const body = {
      limit,
      properties: request.properties ?? [],
      filterGroups: request.filters.length
        ? [
            {
              filters: request.filters.map((filter) => ({
                propertyName: filter.propertyName,
                operator: filter.operator,
                ...(filter.value === undefined || filter.value === "" ? {} : { value: filter.value }),
              })),
            },
          ]
        : [],
    };
    const data = await this.client.request<{ total?: number; results?: HubspotObject[] }>(
      `/crm/v3/objects/${request.objectType}/search`,
      { method: "POST", body },
    );
    return { total: Number(data.total ?? 0), results: Array.isArray(data.results) ? data.results : [] };
  }

  /** Kontostammdaten (Portal, Zeitzone, Waehrung) fuer Auswertungen. */
  async getAccountDetails(): Promise<Awaited<ReturnType<HubspotClient["getAccountDetails"]>>> {
    return this.client.getAccountDetails();
  }

  async getObject(objectType: string, id: string, properties?: string[]): Promise<HubspotObject> {
    const params = properties?.length ? `?properties=${properties.join(",")}` : "";
    return this.client.request<HubspotObject>(`/crm/v3/objects/${objectType}/${id}${params}`);
  }
}
