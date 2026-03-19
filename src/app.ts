import { HTTPException } from 'hono/http-exception'
import { Hono } from 'hono'
import { z } from 'zod'

import { createTelegramBotRuntime } from './bot.js'
import { getAppEnv } from './config.js'
import { WorkersAiResponder } from './services/responders.js'
import type { AppBindings, RuntimeServices } from './types.js'

interface CreateAppOptions {
  runtime?: RuntimeServices
}

const debugThreadParamsSchema = z.object({
  threadId: z.string().trim().min(1),
})

let runtimePromise: Promise<RuntimeServices> | null = null

function getWaitUntil(c: {
  executionCtx?: {
    waitUntil(task: Promise<unknown>): void
  }
}) {
  try {
    return c.executionCtx?.waitUntil.bind(c.executionCtx)
  } catch {
    return undefined
  }
}

function assertDebugAccess(authHeader: string | undefined, expectedSecret: string | undefined): void {
  if (!expectedSecret) {
    return
  }

  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (token !== expectedSecret) {
    throw new HTTPException(401, { message: 'Unauthorized debug access' })
  }
}

async function buildRuntime(env: AppBindings): Promise<RuntimeServices> {
  const parsedEnv = getAppEnv(env)
  const responder = new WorkersAiResponder(parsedEnv.AI)
  const botRuntime = createTelegramBotRuntime(parsedEnv, responder)

  await botRuntime.bot.initialize()

  return {
    ...botRuntime,
    env: parsedEnv,
    responder,
    state: botRuntime.bot.getState(),
  }
}

async function getRuntime(env: AppBindings): Promise<RuntimeServices> {
  if (!runtimePromise) {
    runtimePromise = buildRuntime(env)
  }

  return runtimePromise
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<{ Bindings: AppBindings }>()

  app.get('/', (c) => c.text('Telegram Chat SDK Worker PoC is running.'))

  app.get('/health', async (c) => {
    const runtime = options.runtime ?? (await getRuntime(c.env))

    return c.json({
      ok: true,
      services: {
        ai: Boolean(runtime.env.AI),
        telegram: true,
      },
    })
  })

  app.post('/webhooks/telegram', async (c) => {
    const runtime = options.runtime ?? (await getRuntime(c.env))
    return runtime.bot.webhooks.telegram(c.req.raw, {
      waitUntil: getWaitUntil(c),
    })
  })

  app.get('/debug/session/:threadId', async (c) => {
    const runtime = options.runtime ?? (await getRuntime(c.env))
    assertDebugAccess(c.req.header('authorization'), runtime.env.DEBUG_API_SECRET)
    const params = debugThreadParamsSchema.parse(c.req.param())

    return c.json(await runtime.sessionStore.getDebugSnapshot(params.threadId))
  })

  app.post('/debug/reset/:threadId', async (c) => {
    const runtime = options.runtime ?? (await getRuntime(c.env))
    assertDebugAccess(c.req.header('authorization'), runtime.env.DEBUG_API_SECRET)
    const params = debugThreadParamsSchema.parse(c.req.param())

    await Promise.all([
      runtime.state.unsubscribe(params.threadId),
      runtime.sessionStore.reset(params.threadId),
    ])

    return c.json({
      ok: true,
      threadId: params.threadId,
    })
  })

  app.notFound((c) => {
    return c.json({ message: 'Not Found' }, 404)
  })

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ message: error.message }, error.status)
    }

    if (error instanceof z.ZodError) {
      return c.json(
        {
          issues: error.issues,
          message: 'Invalid request payload',
        },
        400,
      )
    }

    console.error('Unhandled application error.', error)
    return c.json({ message: 'Internal server error' }, 500)
  })

  return app
}
