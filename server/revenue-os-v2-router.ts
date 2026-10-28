import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  commercialEvaluation, createContentFactory, createOneClickBusiness, createRevenueExperiment, evaluateRevenueExperiment,
  recordRevenueAttribution, recordRevenueCost, revenueOsV2Overview, runRevenueMission, upsertRevenueOffer,
} from "./revenue-os-v2";

const personaId=z.enum(["nova","mira","juno","lina","kaya","zara"]);
const attributionPersonaId=z.union([personaId,z.literal("automationsklar-editorial")]);
export const revenueOsV2Router=router({
  overview: adminProcedure.query(revenueOsV2Overview),
  command: adminProcedure.input(z.object({command:z.string().trim().min(4).max(600),dedupeKey:z.string().trim().min(4).max(180).optional()})).mutation(({input})=>runRevenueMission(input)),
  contentFactory: adminProcedure.input(z.object({personaId,topic:z.string().trim().min(3).max(500),maxAssets:z.number().int().min(1).max(30).default(30)})).mutation(({input})=>createContentFactory(input)),
  oneClickBusiness: adminProcedure.input(z.object({idea:z.string().trim().min(5).max(800),audience:z.string().trim().max(500).optional(),goal:z.string().trim().max(500).optional()})).mutation(({input})=>createOneClickBusiness(input)),
  attribution: adminProcedure.input(z.object({eventKey:z.string().min(4).max(200),personaId:attributionPersonaId,contentId:z.string().min(1).max(120),platform:z.string().min(1).max(40),eventType:z.enum(["impression","view","click","lead","purchase","refund"]),valueCents:z.number().int().min(0).optional()})).mutation(({input})=>recordRevenueAttribution(input)),
  cost: adminProcedure.input(z.object({eventKey:z.string().min(4).max(200),category:z.enum(["api","ads","variable","refund"]),amountCents:z.number().int().min(0),metadata:z.record(z.string(),z.unknown()).optional()})).mutation(({input})=>recordRevenueCost(input)),
  offer: adminProcedure.input(z.object({id:z.number().int().positive().optional(),kind:z.enum(["affiliate","digital","subscription","b2b","lead-magnet"]),name:z.string().trim().min(2).max(220),status:z.enum(["draft","active","paused"]),priceCents:z.number().int().min(0).optional(),marginPct:z.number().int().min(0).max(100).optional(),targetUrl:z.string().url().max(800).optional(),metadata:z.record(z.string(),z.unknown()).optional()})).mutation(({input})=>upsertRevenueOffer(input)),
  commercialEvaluation: adminProcedure.input(z.object({priceCents:z.number().int().min(0),marginPct:z.number().min(0).max(100),conversionProbability:z.number().min(0).max(1),effortScore:z.number().min(0),riskScore:z.number().min(0).max(100),expectedReach:z.number().min(0)})).query(({input})=>commercialEvaluation(input)),
  evaluateExperiment: adminProcedure.input(z.object({id:z.number().int().positive(),metrics:z.array(z.object({variantId:z.string().min(1).max(80),exposures:z.number().int().min(0),conversions:z.number().int().min(0),revenueCents:z.number().int().min(0)})).min(2).max(8)})).mutation(({input})=>evaluateRevenueExperiment(input)),
  experiment: adminProcedure.input(z.object({name:z.string().trim().min(3).max(220),dimension:z.enum(["hook","visual","time","persona","cta","price"]),variants:z.array(z.record(z.string(),z.unknown())).min(2).max(8)})).mutation(({input})=>createRevenueExperiment(input)),
});
