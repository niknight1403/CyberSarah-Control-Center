/**
 * Sprint 122 — MCP-Transport: duenne tRPC-Schnittstelle fuer die MCP-
 * Transportschicht (Streamable HTTP + HTTP/SSE-Fallback) aufbauend auf der
 * reinen Logik in lib/mcp-transport-logic.ts und der Registry aus
 * lib/mcp-registry-logic.ts. Admin-geschuetzt wie die gesamte Betriebs-
 *Konfiguration; keine Secrets, alle Meldungen tokenfrei.
 */
import { z } from "zod";

import {
  buildTransportEndpoints,
  MCP_TRANSPORTS,
  negotiateTransport,
} from "../lib/mcp-transport-logic";
import { adminProcedure, router } from "./_core/trpc";

export const mcpRouter = router({
  /** Verfuegbare Transporte (statisch, rein) + konfigurierte Endpunkte. */
  transports: adminProcedure.query(() => {
    const baseUrl = process.env.MCP_SERVER_URL?.trim().replace(/\/+$/, "") ?? null;
    const transports = Object.values(MCP_TRANSPORTS).map((descriptor) => {
      // Ohne konfigurierte Basis-URL bleiben die Endpunkte ehrlich null —
      // der Transport existiert, ist aber nicht angeschlossen.
      const endpoints = baseUrl
        ? buildTransportEndpoints(baseUrl, descriptor.kind)
        : null;
      return {
        ...descriptor,
        configured: endpoints !== null && endpoints.ok,
        endpoints: endpoints && endpoints.ok ? endpoints.endpoints : null,
        invalidReason: endpoints && !endpoints.ok ? endpoints.reason : null,
      };
    });
    return {
      baseUrl,
      transports,
    };
  }),
  /** Verhandelt den Transport fuer einen Server (reine Logik, deterministisch). */
  negotiate: adminProcedure
    .input(
      z
        .object({
          preferred: z.enum(["streamable-http", "sse"]).optional(),
          serverCapabilities: z
            .object({
              streamableHttp: z.boolean().optional(),
              sse: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => negotiateTransport(input)),
});
