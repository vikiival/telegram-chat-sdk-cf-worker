import { z } from 'zod'

import type { AppBindings } from './types.js'

const envSchema = z.object({
  AI: z.object({
    run: z.function({
      input: [z.string(), z.record(z.string(), z.unknown())],
      output: z.promise(z.unknown()),
    }),
  }),
  DEBUG_API_SECRET: z.string().trim().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().trim().min(1),
  TELEGRAM_BOT_USERNAME: z.string().trim().min(1),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().trim().min(1),
})

export function getAppEnv(env: AppBindings): AppBindings {
  return envSchema.parse(env)
}
