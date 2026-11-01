import { z } from "zod";

import { IMAGE_SIZES } from "../lib/image-generation-logic";
import { generateImageForUser } from "./image-generation";
import { protectedProcedure, router } from "./_core/trpc";

const imageInputSchema = z.object({
  prompt: z.string().min(5).max(600),
  size: z.enum(IMAGE_SIZES).optional(),
  seed: z.number().int().nonnegative().nullable().optional(),
  approved: z.boolean(),
});

export const imageGenerationRouter = router({
  generate: protectedProcedure.input(imageInputSchema).mutation(async ({ input, ctx }) => {
    return generateImageForUser(ctx.user.openId, input);
  }),
});
