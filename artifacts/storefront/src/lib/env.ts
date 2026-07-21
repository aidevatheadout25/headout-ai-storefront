import { z } from "zod";

const envSchema = z.object({
  VITE_ORY_SDK_URL: z.string().url(),
});

export const env = envSchema.parse({
  VITE_ORY_SDK_URL: import.meta.env.VITE_ORY_SDK_URL,
});
