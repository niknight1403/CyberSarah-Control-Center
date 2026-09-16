import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { deleteDesignAsset, generateDesignAsset, listDesignAssets } from "./design-agent";
import { DESIGN_ASSET_TYPES, normalizeDesignAssetType } from "../../lib/designer-logic";

/**
 * AI-Grafik-Designer-Router (Admin-gated).
 *
 * Endpunkte des Designer-Agenten: Asset generieren, Galerie einsehen,
 * Einzelnes Asset loeschen. Validiert Asset-Typen gegen die Allowlist aus
 * designer-logic (kein freier String durchschlagen).
 */
export const designRouter = router({
  /** Generiert ein Design-Asset (SVG/Theme-Tokens) und legt es ab. */
  generate: adminProcedure
    .input(
      z.object({
        type: z.string().min(2).max(30),
        description: z.string().min(3).max(2000),
        brandName: z.string().min(1).max(80).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const type = normalizeDesignAssetType(input.type);
      if (!type) {
        throw new Error(`Unbekannter Asset-Typ "${input.type}" — erlaubt: ${DESIGN_ASSET_TYPES.join(", ")}`);
      }
      const record = await generateDesignAsset({
        type,
        description: input.description,
        brandName: input.brandName,
      });
      return record;
    }),

  /** Galerie gespeicherter Assets (neueste zuerst). */
  gallery: adminProcedure
    .input(
      z
        .object({
          includeContent: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      listDesignAssets({
        includeContent: input?.includeContent ?? false,
        limit: input?.limit ?? 50,
      }),
    ),

  /** Einzelnes Asset abrufen (inkl. Inhalt, z. B. fuer Vorschau/Download). */
  asset: adminProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input }) => {
    const assets = await listDesignAssets({ includeContent: true, limit: 100 });
    const found = assets.find((a) => a.id === input.id);
    if (!found) throw new Error("Asset nicht gefunden.");
    return found;
  }),

  /** Asset loeschen. */
  delete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => ({ deleted: await deleteDesignAsset(input.id) })),
});
