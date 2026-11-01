export type AvatarProfile = {
  referenceId: string;
  age: number;
  presentation: string;
  signatureLook: string;
};

export type VisualPromptInput = {
  topic: string;
  setting?: string;
  format: "9:16" | "1:1" | "4:5";
  avatar: AvatarProfile;
};

export function buildVisualPrompt(input: VisualPromptInput): string {
  const age = Math.max(35, Math.min(60, Math.round(input.avatar.age)));
  const setting = input.setting?.trim() || "helles, modernes europäisches Health-Studio";
  return [
    `Reference avatar ID: ${input.avatar.referenceId}`,
    `same person across all frames, age ${age}, ${input.avatar.presentation}, trusted health educator`,
    `signature look: ${input.avatar.signatureLook}`,
    `scene: ${setting}; topic: ${input.topic.trim()}`,
    `composition: ${input.format}, social-first, clean background, natural skin texture, realistic hands`,
    "no medical coat unless contextually justified, no product logo fabrication, no before-after deception",
    "leave safe text space in upper third, EU wellness editorial aesthetic, photorealistic",
  ].join("; ");
}
