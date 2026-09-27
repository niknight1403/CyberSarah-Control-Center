import os from "node:os";
import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      }),
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      }),
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Sprint 371 — Ressourcen-Snapshot des Server-Prozesses (admin-only,
   * keine Kosten, keine Netzaufrufe): Memory, CPU-Zeit, Uptime, Load.
   * Bewusst ein ehrlicher Ist-Zustand — keine geglaetteten Fake-Werte.
   */
  getResourceUsage: adminProcedure.query(() => {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system,
      },
      loadAverage: {
        m1: os.loadavg()[0],
        m5: os.loadavg()[1],
        m15: os.loadavg()[2],
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      },
    };
  }),
});
