import { describe, expect, it, vi } from 'vitest'

import {
  createHelpText,
  generateAndPostReply,
  normalizeIncomingText,
  parseCommand,
} from '../src/bot.js'
import { StateSessionStore } from '../src/session-store.js'
import { WorkersAiResponder } from '../src/services/responders.js'

describe('bot helpers', () => {
  it('normalizes mentions and command suffixes', () => {
    expect(normalizeIncomingText('Hello @test_bot', 'test_bot')).toBe('Hello')
    expect(normalizeIncomingText('/help@test_bot', 'test_bot')).toBe('/help')
  })

  it('parses supported commands', () => {
    expect(parseCommand('/start')).toBe('start')
    expect(parseCommand('/help')).toBe('help')
    expect(parseCommand('/reset')).toBe('reset')
    expect(parseCommand('hello')).toBeNull()
  })

  it('builds deterministic help text', () => {
    expect(createHelpText()).toContain('/reset')
  })
})

describe('message handling', () => {
  it('subscribes and replies to a first DM', async () => {
    const subscribe = vi.fn(async () => undefined)
    const post = vi.fn(async () => undefined)
    const setSubscribed = vi.fn(async () => undefined)
    const recordExchange = vi.fn(async () => ({
      history: [],
      lastReplyAt: '2026-03-18T00:00:00.000Z',
      lastReplyText: 'Short reply',
      lastUserMessage: 'Hello bot',
      subscribed: true,
      threadId: 'telegram:dm:1',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }))

    await generateAndPostReply({
      message: {
        author: {
          fullName: 'Test User',
          userName: 'tester',
        },
        text: 'Hello bot',
      },
      responder: {
        generateReply: async () => ({
          model: 'test-model',
          text: 'Short reply',
        }),
      },
      sessionStore: {
        get: async () => null,
        getDebugSnapshot: async () => ({
          session: null,
          subscribed: true,
          threadId: 'telegram:dm:1',
        }),
        recordExchange,
        reset: async () => undefined,
        setSubscribed,
      },
      thread: {
        id: 'telegram:dm:1',
        isDM: true,
        post,
        subscribe,
        unsubscribe: async () => undefined,
      },
      userName: 'test_bot',
    })

    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(setSubscribed).toHaveBeenCalledWith('telegram:dm:1', true)
    expect(post).toHaveBeenCalledWith('Short reply')
    expect(recordExchange).toHaveBeenCalledWith('telegram:dm:1', {
      replyText: 'Short reply',
      userMessage: 'Hello bot',
    })
  })

  it('handles subscribed follow-up messages using session history', async () => {
    const post = vi.fn(async () => undefined)
    const responder = vi.fn(async () => ({
      model: 'test-model',
      text: 'Follow-up reply',
    }))

    await generateAndPostReply({
      message: {
        author: {
          fullName: 'Test User',
          userName: 'tester',
        },
        isMention: true,
        text: 'Another question',
      },
      responder: {
        generateReply: responder,
      },
      sessionStore: {
        get: async () => ({
          history: [
            {
              role: 'user',
              text: 'Earlier',
              timestamp: '2026-03-18T00:00:00.000Z',
            },
          ],
          lastReplyAt: '2026-03-18T00:00:00.000Z',
          lastReplyText: 'Earlier reply',
          lastUserMessage: 'Earlier',
          subscribed: true,
          threadId: 'telegram:thread:1',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
        getDebugSnapshot: async () => ({
          session: null,
          subscribed: true,
          threadId: 'telegram:thread:1',
        }),
        recordExchange: async () => ({
          history: [],
          lastReplyAt: '2026-03-18T00:00:00.000Z',
          lastReplyText: 'Follow-up reply',
          lastUserMessage: 'Another question',
          subscribed: true,
          threadId: 'telegram:thread:1',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
        reset: async () => undefined,
        setSubscribed: async () => undefined,
      },
      thread: {
        id: 'telegram:thread:1',
        isDM: false,
        post,
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
      },
      userName: 'test_bot',
    })

    expect(responder).toHaveBeenCalledWith(expect.objectContaining({
      history: [
        {
          role: 'user',
          text: 'Earlier',
          timestamp: '2026-03-18T00:00:00.000Z',
        },
      ],
      isMention: true,
      messageText: 'Another question',
      threadId: 'telegram:thread:1',
    }))
    expect(post).toHaveBeenCalledWith('Follow-up reply')
  })

  it('resets the session for /reset', async () => {
    const unsubscribe = vi.fn(async () => undefined)
    const reset = vi.fn(async () => undefined)
    const post = vi.fn(async () => undefined)

    await generateAndPostReply({
      message: {
        author: {
          fullName: 'Test User',
          userName: 'tester',
        },
        text: '/reset',
      },
      responder: {
        generateReply: async () => ({
          model: 'test-model',
          text: 'unused',
        }),
      },
      sessionStore: {
        get: async () => null,
        getDebugSnapshot: async () => ({
          session: null,
          subscribed: false,
          threadId: 'telegram:thread:1',
        }),
        recordExchange: async () => ({
          history: [],
          lastReplyAt: '2026-03-18T00:00:00.000Z',
          lastReplyText: '',
          lastUserMessage: '',
          subscribed: false,
          threadId: 'telegram:thread:1',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
        reset,
        setSubscribed: async () => undefined,
      },
      thread: {
        id: 'telegram:thread:1',
        isDM: false,
        post,
        subscribe: async () => undefined,
        unsubscribe,
      },
      userName: 'test_bot',
    })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledWith('telegram:thread:1')
    expect(post).toHaveBeenCalledWith('Session reset. Send a new message or mention me again to start over.')
  })
})

describe('session store and responder', () => {
  it('stores and returns debug snapshots', async () => {
    const store = new StateSessionStore({
      acquireLock: async () => null,
      appendToList: async () => undefined,
      connect: async () => undefined,
      delete: async () => undefined,
      disconnect: async () => undefined,
      extendLock: async () => false,
      forceReleaseLock: async () => undefined,
      get: async () => null,
      getList: async () => [],
      isSubscribed: async () => true,
      releaseLock: async () => undefined,
      set: async () => undefined,
      setIfNotExists: async () => true,
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
    })

    await expect(store.getDebugSnapshot('telegram:thread:1')).resolves.toEqual({
      session: null,
      subscribed: true,
      threadId: 'telegram:thread:1',
    })
  })

  it('extracts text from Workers AI responses', async () => {
    const responder = new WorkersAiResponder({
      run: async () => ({
        response: 'Worker AI reply',
      }),
    })

    await expect(
      responder.generateReply({
        authorName: 'Test User',
        history: [],
        isDirectMessage: true,
        isMention: false,
        messageText: 'Hello',
        threadId: 'telegram:thread:1',
      }),
    ).resolves.toMatchObject({
      text: 'Worker AI reply',
    })
  })
})
