import type { StateAdapter } from 'chat'

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.2-3b-instruct'
export const MAX_SESSION_TURNS = 12
export const SESSION_KEY_PREFIX = 'session:'

export interface AiBindingLike {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>
}

export interface AppBindings {
  AI: AiBindingLike
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_BOT_USERNAME: string
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string
  DEBUG_API_SECRET?: string
}

export interface SessionTurn {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface ConversationSession {
  history: SessionTurn[]
  lastReplyAt: string
  lastReplyText: string
  lastUserMessage: string
  subscribed: boolean
  threadId: string
  updatedAt: string
}

export interface GenerateReplyInput {
  authorName: string
  history: SessionTurn[]
  isDirectMessage: boolean
  isMention: boolean
  messageText: string
  threadId: string
}

export interface GenerateReplyResult {
  model: string
  text: string
}

export interface ChatResponder {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>
}

export interface SessionStore {
  get(threadId: string): Promise<ConversationSession | null>
  getDebugSnapshot(threadId: string): Promise<{
    session: ConversationSession | null
    subscribed: boolean
    threadId: string
  }>
  recordExchange(
    threadId: string,
    exchange: {
      replyText: string
      userMessage: string
    },
  ): Promise<ConversationSession>
  reset(threadId: string): Promise<void>
  setSubscribed(threadId: string, subscribed: boolean): Promise<void>
}

export interface BotRuntime {
  bot: {
    getState(): StateAdapter
    initialize(): Promise<void>
    webhooks: {
      telegram(request: Request, options?: { waitUntil?: (task: Promise<unknown>) => void }): Promise<Response>
    }
  }
  sessionStore: SessionStore
}

export interface RuntimeServices extends BotRuntime {
  env: AppBindings
  responder: ChatResponder
  state: StateAdapter
}
