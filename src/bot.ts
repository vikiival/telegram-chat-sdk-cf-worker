import { createMemoryState } from '@chat-adapter/state-memory'
import { createTelegramAdapter } from '@chat-adapter/telegram'
import { Chat } from 'chat'

import { StateSessionStore } from './session-store.js'
import type { AppBindings, BotRuntime, ChatResponder, SessionStore } from './types.js'

function normalizeIncomingText(text: string, botUserName: string): string {
  const withoutCommandSuffix = text.replace(
    new RegExp(`/(start|help|reset)@${botUserName}\\b`, 'gi'),
    (_match, command) => `/${String(command).toLowerCase()}`,
  )

  return withoutCommandSuffix.replace(new RegExp(`@${botUserName}\\b`, 'gi'), '').trim()
}

function parseCommand(text: string): 'help' | 'reset' | 'start' | null {
  const normalized = text.trim().toLowerCase()
  if (normalized === '/start') {
    return 'start'
  }
  if (normalized === '/help') {
    return 'help'
  }
  if (normalized === '/reset') {
    return 'reset'
  }
  return null
}

function createHelpText(): string {
  return [
    'Available commands:',
    '/start - subscribe this thread and start chatting',
    '/help - show this help',
    '/reset - clear the in-memory session for this thread',
  ].join('\n')
}

async function generateAndPostReply(args: {
  message: {
    author: {
      fullName: string
      userName: string
    }
    isMention?: boolean
    text: string
  }
  responder: ChatResponder
  sessionStore: SessionStore
  thread: {
    id: string
    isDM: boolean
    post(message: string): Promise<unknown>
    subscribe(): Promise<void>
    unsubscribe(): Promise<void>
  }
  userName: string
}): Promise<void> {
  const normalizedText = normalizeIncomingText(args.message.text, args.userName)
  const command = parseCommand(normalizedText)

  if (command === 'start') {
    await args.thread.subscribe()
    await args.sessionStore.setSubscribed(args.thread.id, true)
    await args.thread.post('Bot is ready. Send a message and I will reply with a short AI response.')
    return
  }

  if (command === 'help') {
    await args.thread.post(createHelpText())
    return
  }

  if (command === 'reset') {
    await Promise.all([
      args.thread.unsubscribe(),
      args.sessionStore.reset(args.thread.id),
    ])
    await args.thread.post('Session reset. Send a new message or mention me again to start over.')
    return
  }

  if (!normalizedText) {
    await args.thread.post('Send some text and I will respond.')
    return
  }

  await args.thread.subscribe()
  await args.sessionStore.setSubscribed(args.thread.id, true)

  const existingSession = await args.sessionStore.get(args.thread.id)
  const result = await args.responder.generateReply({
    authorName: args.message.author.fullName || args.message.author.userName || 'Telegram user',
    history: existingSession?.history ?? [],
    isDirectMessage: args.thread.isDM,
    isMention: Boolean(args.message.isMention),
    messageText: normalizedText,
    threadId: args.thread.id,
  })

  await args.thread.post(result.text)
  await args.sessionStore.recordExchange(args.thread.id, {
    replyText: result.text,
    userMessage: normalizedText,
  })
}

export function createTelegramBotRuntime(
  env: AppBindings,
  responder: ChatResponder,
): BotRuntime {
  const state = createMemoryState()
  const sessionStore = new StateSessionStore(state)
  const bot = new Chat({
    adapters: {
      telegram: createTelegramAdapter({
        botToken: env.TELEGRAM_BOT_TOKEN,
        secretToken: env.TELEGRAM_WEBHOOK_SECRET_TOKEN,
        userName: env.TELEGRAM_BOT_USERNAME,
      }),
    },
    state,
    userName: env.TELEGRAM_BOT_USERNAME,
  })

  const handleMessage = async (
    thread: {
      id: string
      isDM: boolean
      post(message: string): Promise<unknown>
      subscribe(): Promise<void>
      unsubscribe(): Promise<void>
    },
    message: {
      author: {
        fullName: string
        userName: string
      }
      isMention?: boolean
      text: string
    },
  ) => {
    await generateAndPostReply({
      message,
      responder,
      sessionStore,
      thread,
      userName: env.TELEGRAM_BOT_USERNAME,
    })
  }

  bot.onDirectMessage(handleMessage)
  bot.onNewMention(handleMessage)
  bot.onSubscribedMessage(handleMessage)

  return {
    bot,
    sessionStore,
  }
}

export {
  createHelpText,
  generateAndPostReply,
  normalizeIncomingText,
  parseCommand,
}
