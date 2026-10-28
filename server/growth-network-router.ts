import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { b2bNetworkOverview,influencerLearningOverview,refreshInfluencerLearning,upsertB2BEdge,upsertB2BNode } from "./growth-network-service";
import { getInfluencerLearningLoopStatus, runInfluencerLearningTick } from "./influencer-learning-loop";

export const growthNetworkRouter=router({
  b2bOverview:adminProcedure.query(b2bNetworkOverview),
  b2bNode:adminProcedure.input(z.object({
    nodeKey:z.string().trim().min(2).max(180),kind:z.enum(["lead","customer","partner","creator","company"]),
    name:z.string().trim().min(2).max(220),domain:z.string().trim().max(255).optional(),
    fit:z.number().min(0).max(100),intent:z.number().min(0).max(100),trust:z.number().min(0).max(100),relationshipStrength:z.number().min(0).max(100),
    estimatedValueCents:z.number().int().min(0).optional(),optedOut:z.boolean().optional(),metadata:z.record(z.string(),z.unknown()).optional(),
  })).mutation(({input})=>upsertB2BNode(input)),
  b2bEdge:adminProcedure.input(z.object({
    edgeKey:z.string().trim().min(3).max(220),fromNodeKey:z.string().trim().min(2).max(180),toNodeKey:z.string().trim().min(2).max(180),
    relation:z.string().trim().min(2).max(40),stage:z.enum(["discovered","qualified","engaged","customer","partner","paused"]),strength:z.number().min(0).max(100),
    evidence:z.record(z.string(),z.unknown()).optional(),
  })).mutation(({input})=>upsertB2BEdge(input)),
  influencerLearning:adminProcedure.query(influencerLearningOverview),
  learningLoopStatus:adminProcedure.query(getInfluencerLearningLoopStatus),
  learnNow:adminProcedure.mutation(runInfluencerLearningTick),
});
