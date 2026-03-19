import type { RuntimeServices } from "../src/types.js";

export function createAiBindingMock(
  response: unknown = { response: "AI reply" }
) {
  return {
    run: async () => response,
  };
}

export function createRuntimeMock(
  overrides: Partial<RuntimeServices> = {}
): RuntimeServices {
  const session = {
    history: [],
    updatedAt: "2026-03-18T00:00:00.000Z",
  };

  return {
    bot: {
      getState: () => ({
        acquireLock: async () => null,
        appendToList: async () => undefined,
        connect: async () => undefined,
        delete: async () => undefined,
        disconnect: async () => undefined,
        extendLock: async () => false,
        forceReleaseLock: async () => undefined,
        get: async () => null,
        getList: async () => [],
        isSubscribed: async () => false,
        releaseLock: async () => undefined,
        set: async () => undefined,
        setIfNotExists: async () => true,
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
      }),
      initialize: async () => undefined,
      webhooks: {
        telegram: (_request, options) => {
          options?.waitUntil?.(Promise.resolve());
          return Promise.resolve(new Response("ok"));
        },
      },
    },
    env: {
      AI: createAiBindingMock(),
      DEBUG_API_SECRET: "debug-secret",
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_BOT_USERNAME: "test_bot",
      TELEGRAM_WEBHOOK_SECRET_TOKEN: "secret",
    },
    responder: {
      generateReply: async () => ({
        model: "test-model",
        text: "AI reply",
      }),
    },
    sessionStore: {
      get: async () => session,
      getDebugSnapshot: async (threadId: string) => ({
        session,
        subscribed: true,
        threadId,
      }),
      recordExchange: async (_threadId: string, exchange) => ({
        history: [
          {
            role: "user" as const,
            text: exchange.userMessage,
            timestamp: "2026-03-18T00:00:00.000Z",
          },
          {
            role: "assistant" as const,
            text: exchange.replyText,
            timestamp: "2026-03-18T00:00:00.000Z",
          },
        ],
        updatedAt: "2026-03-18T00:00:00.000Z",
      }),
      reset: async () => undefined,
    },
    state: {
      acquireLock: async () => null,
      appendToList: async () => undefined,
      connect: async () => undefined,
      delete: async () => undefined,
      disconnect: async () => undefined,
      extendLock: async () => false,
      forceReleaseLock: async () => undefined,
      get: async () => null,
      getList: async () => [],
      isSubscribed: async () => false,
      releaseLock: async () => undefined,
      set: async () => undefined,
      setIfNotExists: async () => true,
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
    },
    ...overrides,
  };
}
