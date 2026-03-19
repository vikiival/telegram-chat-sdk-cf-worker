import { z } from "zod";

import type { AppBindings } from "./types.js";

const envSchema = z.object({
  AI: z.custom<AppBindings["AI"]>(
    (v) =>
      v != null && typeof (v as Record<string, unknown>).run === "function",
    {
      message: "AI binding must have a run() method",
    }
  ),
  ALLOWED_TELEGRAM_USERS: z.string().trim().min(1).optional(),
  DEBUG_API_SECRET: z.string().trim().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().trim().min(1),
  TELEGRAM_BOT_USERNAME: z.string().trim().min(1),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().trim().min(1),
});

export function getAppEnv(env: AppBindings): AppBindings {
  return envSchema.parse(env);
}
