import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { createRuntimeMock } from './helpers.js'

describe('app routes', () => {
  it('returns health status', async () => {
    const app = createApp({
      runtime: createRuntimeMock(),
    })

    const response = await app.request('/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      services: {
        ai: true,
        telegram: true,
      },
    })
  })

  it('delegates webhook handling and forwards waitUntil', async () => {
    const waitUntil = vi.fn()
    const runtime = createRuntimeMock({
      bot: {
        getState: () => runtime.state,
        initialize: async () => undefined,
        webhooks: {
          telegram: async (_request, options) => {
            options?.waitUntil?.(Promise.resolve())
            return new Response('accepted', { status: 202 })
          },
        },
      },
    })
    const app = createApp({ runtime })

    const response = await app.fetch(
      new Request('http://localhost/webhooks/telegram', {
        method: 'POST',
      }),
      runtime.env,
      {
        waitUntil,
      } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(202)
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('protects debug endpoints with the shared secret', async () => {
    const app = createApp({
      runtime: createRuntimeMock(),
    })

    const response = await app.request('/debug/session/telegram:chat:1')

    expect(response.status).toBe(401)
  })

  it('returns debug session snapshots when authorized', async () => {
    const app = createApp({
      runtime: createRuntimeMock(),
    })

    const response = await app.request('/debug/session/telegram:chat:1', {
      headers: {
        authorization: 'Bearer debug-secret',
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      subscribed: true,
      threadId: 'telegram:chat:1',
    })
  })

  it('clears session state through the debug reset route', async () => {
    const unsubscribe = vi.fn(async () => undefined)
    const reset = vi.fn(async () => undefined)
    const baseRuntime = createRuntimeMock()
    const app = createApp({
      runtime: createRuntimeMock({
        sessionStore: {
          ...baseRuntime.sessionStore,
          reset,
        },
        state: {
          ...baseRuntime.state,
          unsubscribe,
        },
      }),
    })

    const response = await app.request('/debug/reset/telegram:chat:1', {
      headers: {
        authorization: 'Bearer debug-secret',
      },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(unsubscribe).toHaveBeenCalledWith('telegram:chat:1')
    expect(reset).toHaveBeenCalledWith('telegram:chat:1')
  })

  it('returns structured 404 responses', async () => {
    const app = createApp({
      runtime: createRuntimeMock(),
    })

    const response = await app.request('/missing')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ message: 'Not Found' })
  })
})
