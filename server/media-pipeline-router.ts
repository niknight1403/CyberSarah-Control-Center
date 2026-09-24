import { z } from "zod";

import { TTS_VOICES } from "../lib/tts-logic";
import { generateVideoForUser, mediaPipelineStatus } from "./media-pipeline";
import { synthesizeSpeech } from "./tts";
import { protectedProcedure, router } from "./_core/trpc";

const videoInputSchema = z.object({
  text: z.string().min(10).max(1200),
  voice: z.enum(TTS_VOICES).optional(),
  approved: z.boolean(),
});

const ttsInputSchema = z.object({
  text: z.string().min(1).max(1500),
  voice: z.enum(TTS_VOICES).optional(),
});

export const mediaPipelineRouter = router({
  /** Ehrlicher Status: ist Video hier überhaupt möglich (ffmpeg vorhanden)? */
  status: protectedProcedure.query(async () => {
    return mediaPipelineStatus();
  }),
  /** Einzelne Sprach-Synthese (kostenlos, cachebar). */
  tts: protectedProcedure.input(ttsInputSchema).mutation(async ({ input, ctx }) => {
    return synthesizeSpeech(input.text, input.voice);
  }),
  /** Kompletter Video-Render — nur mit ausdrücklicher Freigabe. */
  generate: protectedProcedure.input(videoInputSchema).mutation(async ({ input, ctx }) => {
    return generateVideoForUser(ctx.user.openId, input);
  }),
});
