/**
 * Sandbox-Umsetzung des HubSpot-Service.
 *
 * Zweck: Tests, lokale Entwicklung und Demos laufen ohne Live-Token.
 * Der Zustand liegt nur im Speicher; nichts verlaesst den Prozess.
 */
import type { HubspotServiceLike } from "./service";
import type {
  CompanyInput,
  ContactInput,
  DealInput,
  HubspotObject,
  SearchRequest,
  SearchResult,
} from "./types";

function toObject(id: string, properties: Record<string, unknown>): HubspotObject {
  const cleaned: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    cleaned[key] = value === undefined || value === null ? null : String(value);
  }
  return { id, properties: cleaned };
}

export class SandboxHubspotService implements HubspotServiceLike {
  private sequence = 0;
  private readonly contacts = new Map<string, HubspotObject>();
  private readonly companies = new Map<string, HubspotObject>();
  private readonly deals = new Map<string, HubspotObject>();

  /** Zaehler fuer erzeugte Datensaetze, in Tests pruefbar. */
  get counters(): { contacts: number; companies: number; deals: number } {
    return {
      contacts: this.contacts.size,
      companies: this.companies.size,
      deals: this.deals.size,
    };
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${String(this.sequence).padStart(6, "0")}`;
  }

  async createContact(input: ContactInput): Promise<HubspotObject> {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!email) throw new Error("E-Mail ist erforderlich.");
    const contact = toObject(this.nextId("contact"), { ...input, email });
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async findContactByEmail(email: string): Promise<HubspotObject | null> {
    const wanted = String(email ?? "").trim().toLowerCase();
    for (const contact of this.contacts.values()) {
      if (contact.properties.email === wanted) return contact;
    }
    return null;
  }

  async upsertContact(input: ContactInput): Promise<{ created: boolean; contact: HubspotObject }> {
    const existing = await this.findContactByEmail(input.email);
    if (!existing) return { created: true, contact: await this.createContact(input) };
    const merged = toObject(existing.id, { ...existing.properties, ...input });
    this.contacts.set(existing.id, merged);
    return { created: false, contact: merged };
  }

  async upsertCompany(input: CompanyInput): Promise<{ created: boolean; company: HubspotObject }> {
    const domain = input.domain ? String(input.domain).trim().toLowerCase() : "";
    for (const company of this.companies.values()) {
      if (domain && company.properties.domain === domain) {
        const merged = toObject(company.id, { ...company.properties, ...input });
        this.companies.set(company.id, merged);
        return { created: false, company: merged };
      }
    }
    const company = toObject(this.nextId("company"), { ...input });
    this.companies.set(company.id, company);
    return { created: true, company };
  }

  async createDeal(input: DealInput): Promise<HubspotObject> {
    const deal = toObject(this.nextId("deal"), {
      dealname: input.dealname,
      dealstage: input.dealstage,
      amount: input.amount,
      pipeline: input.pipeline,
      closedate: input.closedate,
      contactId: input.contactId,
    });
    this.deals.set(deal.id, deal);
    return deal;
  }

  async updateDealStage(
    dealId: string,
    input: Partial<DealInput> & { dealstage: string },
  ): Promise<HubspotObject> {
    const existing = this.deals.get(dealId);
    if (!existing) throw new Error(`Deal ${dealId} existiert in der Sandbox nicht.`);
    const merged = toObject(dealId, { ...existing.properties, ...input });
    this.deals.set(dealId, merged);
    return merged;
  }

  async search(request: SearchRequest): Promise<SearchResult> {
    const pool =
      request.objectType === "contacts"
        ? [...this.contacts.values()]
        : request.objectType === "companies"
          ? [...this.companies.values()]
          : [...this.deals.values()];
    const matches = pool.filter((item) =>
      request.filters.every((filter) => {
        const actual = item.properties[filter.propertyName] ?? "";
        switch (filter.operator) {
          case "EQ":
            return actual === (filter.value ?? "");
          case "NEQ":
            return actual !== (filter.value ?? "");
          case "CONTAINS_TOKEN":
            return actual.toLowerCase().includes(String(filter.value ?? "").toLowerCase());
          case "HAS_PROPERTY":
            return actual !== "";
          default:
            return false;
        }
      }),
    );
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);
    return { total: matches.length, results: matches.slice(0, limit) };
  }

  async getObject(objectType: string, id: string): Promise<HubspotObject> {
    const pool =
      objectType === "contacts" ? this.contacts : objectType === "companies" ? this.companies : this.deals;
    const found = pool.get(id);
    if (!found) throw new Error(`${objectType}/${id} existiert in der Sandbox nicht.`);
    return found;
  }
}
