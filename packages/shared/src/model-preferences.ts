import { z } from "zod";

export const modelPreferenceKinds = [
  "text",
  "audio",
  "image",
  "video",
] as const;
export const modelPreferencesSchema = z.object({
  text: z.string().min(1).nullable().default(null),
  audio: z.string().min(1).nullable().default(null),
  image: z.string().min(1).nullable().default(null),
  video: z.string().min(1).nullable().default(null),
});
export const modelPreferencesResponseSchema = z.object({
  preferences: modelPreferencesSchema,
});
export type ModelPreferences = z.infer<typeof modelPreferencesSchema>;

/** A missing preference means first available, never an administrator's default. */
export function resolvePreferredModel<T extends { id: string }>(
  models: readonly T[],
  preference: string | null | undefined,
): T | undefined {
  return preference
    ? models.find((model) => model.id === preference)
    : models[0];
}
