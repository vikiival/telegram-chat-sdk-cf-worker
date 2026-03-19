import type { StateAdapter } from 'chat'

import {
  MAX_SESSION_TURNS,
  SESSION_KEY_PREFIX,
  type ConversationSession,
  type SessionStore,
} from './types.js'

function sessionKey(threadId: string): string {
  return `${SESSION_KEY_PREFIX}${threadId}`
}

function trimHistory(history: ConversationSession['history']): ConversationSession['history'] {
  return history.slice(-MAX_SESSION_TURNS)
}

export class StateSessionStore implements SessionStore {
  constructor(private readonly state: StateAdapter) {}

  async get(threadId: string): Promise<ConversationSession | null> {
    return this.state.get<ConversationSession>(sessionKey(threadId))
  }

  async getDebugSnapshot(threadId: string) {
    const [session, subscribed] = await Promise.all([
      this.get(threadId),
      this.state.isSubscribed(threadId),
    ])

    return {
      session,
      subscribed,
      threadId,
    }
  }

  async recordExchange(
    threadId: string,
    exchange: {
      replyText: string
      userMessage: string
    },
  ): Promise<ConversationSession> {
    const now = new Date().toISOString()
    const current = await this.get(threadId)
    const nextSession: ConversationSession = {
      history: trimHistory([
        ...(current?.history ?? []),
        {
          role: 'user',
          text: exchange.userMessage,
          timestamp: now,
        },
        {
          role: 'assistant',
          text: exchange.replyText,
          timestamp: now,
        },
      ]),
      lastReplyAt: now,
      lastReplyText: exchange.replyText,
      lastUserMessage: exchange.userMessage,
      subscribed: true,
      threadId,
      updatedAt: now,
    }

    await this.state.set(sessionKey(threadId), nextSession)
    return nextSession
  }

  async reset(threadId: string): Promise<void> {
    await this.state.delete(sessionKey(threadId))
  }

  async setSubscribed(threadId: string, subscribed: boolean): Promise<void> {
    const current = await this.get(threadId)
    const now = new Date().toISOString()

    if (!current) {
      if (!subscribed) {
        return
      }

      await this.state.set(sessionKey(threadId), {
        history: [],
        lastReplyAt: now,
        lastReplyText: '',
        lastUserMessage: '',
        subscribed,
        threadId,
        updatedAt: now,
      } satisfies ConversationSession)
      return
    }

    await this.state.set(sessionKey(threadId), {
      ...current,
      subscribed,
      updatedAt: now,
    } satisfies ConversationSession)
  }
}
