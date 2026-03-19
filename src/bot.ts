import { createMemoryState } from "@chat-adapter/state-memory";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { Chat } from "chat";

import { StateSessionStore } from "./session-store.js";
import type {
  AppBindings,
  BotRuntime,
  ChatResponder,
  IncomingMessage,
  SessionStore,
  ThreadHandle,
} from "./types.js";

function parseAllowedUsers(raw?: string): Set<string> | null {
  if (!raw) {
    return null;
  }
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function createMentionPatterns(botUserName: string) {
  return {
    commandSuffix: new RegExp(`/(start|help|reset)@${botUserName}\\b`, "gi"),
    mention: new RegExp(`@${botUserName}\\b`, "gi"),
  };
}

function normalizeIncomingText(
  text: string,
  patterns: ReturnType<typeof createMentionPatterns>
): string {
  return text
    .replace(
      patterns.commandSuffix,
      (_match, command) => `/${String(command).toLowerCase()}`
    )
    .replace(patterns.mention, "")
    .trim();
}

function parseCommand(text: string): "help" | "reset" | "start" | null {
  const normalized = text.trim().toLowerCase();
  if (normalized === "/start") {
    return "start";
  }
  if (normalized === "/help") {
    return "help";
  }
  if (normalized === "/reset") {
    return "reset";
  }
  return null;
}

const HELP_TEXT = [
  "Available commands:",
  "/start - subscribe this thread and start chatting",
  "/help - show this help",
  "/reset - clear the in-memory session for this thread",
].join("\n");

async function generateAndPostReply(args: {
  allowedUsers: Set<string> | null;
  message: IncomingMessage;
  patterns: ReturnType<typeof createMentionPatterns>;
  responder: ChatResponder;
  sessionStore: SessionStore;
  thread: ThreadHandle;
}): Promise<void> {
  if (args.allowedUsers && !args.allowedUsers.has(args.message.author.userId)) {
    await args.thread.post("Sorry, you are not allowed to use this bot.");
    return;
  }

  const normalizedText = normalizeIncomingText(
    args.message.text,
    args.patterns
  );
  const command = parseCommand(normalizedText);

  if (command === "start") {
    await args.thread.subscribe();
    await args.thread.post(
      "Bot is ready. Send a message and I will reply with a short AI response."
    );
    return;
  }

  if (command === "help") {
    await args.thread.post(HELP_TEXT);
    return;
  }

  if (command === "reset") {
    await Promise.all([
      args.thread.unsubscribe(),
      args.sessionStore.reset(args.thread.id),
    ]);
    await args.thread.post(
      "Session reset. Send a new message or mention me again to start over."
    );
    return;
  }

  if (!normalizedText) {
    await args.thread.post("Send some text and I will respond.");
    return;
  }

  const [, existingSession] = await Promise.all([
    args.thread.subscribe(),
    args.sessionStore.get(args.thread.id),
  ]);

  const result = await args.responder.generateReply({
    authorName:
      args.message.author.fullName ||
      args.message.author.userName ||
      "Telegram user",
    history: existingSession?.history ?? [],
    isDirectMessage: args.thread.isDM,
    isMention: Boolean(args.message.isMention),
    messageText: normalizedText,
    threadId: args.thread.id,
  });

  await args.thread.post(result.text);
  await args.sessionStore.recordExchange(args.thread.id, {
    replyText: result.text,
    userMessage: normalizedText,
  });
}

export function createTelegramBotRuntime(
  env: AppBindings,
  responder: ChatResponder
): BotRuntime {
  const state = createMemoryState();
  const sessionStore = new StateSessionStore(state);
  const patterns = createMentionPatterns(env.TELEGRAM_BOT_USERNAME);
  const allowedUsers = parseAllowedUsers(env.ALLOWED_TELEGRAM_USERS);

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
  });

  const handleMessage = async (
    thread: ThreadHandle,
    message: IncomingMessage
  ) => {
    await generateAndPostReply({
      allowedUsers,
      message,
      patterns,
      responder,
      sessionStore,
      thread,
    });
  };

  bot.onDirectMessage(handleMessage);
  bot.onNewMention(handleMessage);
  bot.onSubscribedMessage(handleMessage);

  return { bot, sessionStore };
}

export {
  createMentionPatterns,
  generateAndPostReply,
  HELP_TEXT,
  normalizeIncomingText,
  parseAllowedUsers,
  parseCommand,
};
