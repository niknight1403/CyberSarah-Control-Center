/**
 * Sprint 296 — Tests fuer Template-Galerie.
 */
import { describe, it, expect } from "vitest";
import {
  PROJECT_TEMPLATES,
  TEMPLATE_CATEGORIES,
  categoryDisplayName,
  filterTemplatesByCategory,
  countTemplatesByCategory,
  findTemplateById,
  hasMinimumTemplates,
  type TemplateCategory,
} from "@/lib/template-gallery-logic";

describe("Sprint 296 — Template Gallery Logic", () => {
  describe("PROJECT_TEMPLATES", () => {
    it("has at least 5 templates (Sprint requirement)", () => {
      expect(PROJECT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    });
    it("every template has an honestLimit", () => {
      for (const t of PROJECT_TEMPLATES) {
        expect(t.honestLimit).toBeTruthy();
        expect(t.honestLimit.length).toBeGreaterThan(10);
      }
    });
    it("every template has a unique id", () => {
      const ids = PROJECT_TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it("every template has a valid category", () => {
      for (const t of PROJECT_TEMPLATES) {
        expect(TEMPLATE_CATEGORIES).toContain(t.category);
      }
    });
  });

  describe("categoryDisplayName", () => {
    it("returns display name for each category", () => {
      expect(categoryDisplayName("blank")).toBe("Leer");
      expect(categoryDisplayName("dashboard")).toBe("Dashboard");
      expect(categoryDisplayName("chat")).toBe("Chat");
      expect(categoryDisplayName("media")).toBe("Medien");
    });
  });

  describe("filterTemplatesByCategory", () => {
    it("returns all templates for 'all'", () => {
      const result = filterTemplatesByCategory(PROJECT_TEMPLATES, "all");
      expect(result.length).toBe(PROJECT_TEMPLATES.length);
    });
    it("filters by 'blank' category", () => {
      const result = filterTemplatesByCategory(PROJECT_TEMPLATES, "blank");
      for (const t of result) {
        expect(t.category).toBe("blank");
      }
    });
    it("filters by 'dashboard' category", () => {
      const result = filterTemplatesByCategory(PROJECT_TEMPLATES, "dashboard");
      for (const t of result) {
        expect(t.category).toBe("dashboard");
      }
    });
    it("returns empty array for category with no templates", () => {
      const empty: [] = [];
      const result = filterTemplatesByCategory(empty, "chat");
      expect(result.length).toBe(0);
    });
  });

  describe("countTemplatesByCategory", () => {
    it("counts all templates in 'all'", () => {
      const counts = countTemplatesByCategory(PROJECT_TEMPLATES);
      expect(counts.all).toBe(PROJECT_TEMPLATES.length);
    });
    it("counts per category correctly", () => {
      const counts = countTemplatesByCategory(PROJECT_TEMPLATES);
      for (const cat of TEMPLATE_CATEGORIES) {
        const expected = PROJECT_TEMPLATES.filter((t) => t.category === cat).length;
        expect(counts[cat]).toBe(expected);
      }
    });
  });

  describe("findTemplateById", () => {
    it("finds an existing template", () => {
      const t = findTemplateById(PROJECT_TEMPLATES, "blank-minimal");
      expect(t).toBeDefined();
      expect(t!.name).toBe("Leeres Projekt");
    });
    it("returns undefined for unknown id", () => {
      const t = findTemplateById(PROJECT_TEMPLATES, "does-not-exist");
      expect(t).toBeUndefined();
    });
  });

  describe("hasMinimumTemplates", () => {
    it("returns true for the default registry", () => {
      expect(hasMinimumTemplates(PROJECT_TEMPLATES)).toBe(true);
    });
    it("returns false for fewer than 5", () => {
      expect(hasMinimumTemplates([])).toBe(false);
      expect(hasMinimumTemplates([PROJECT_TEMPLATES[0]])).toBe(false);
    });
  });
});
