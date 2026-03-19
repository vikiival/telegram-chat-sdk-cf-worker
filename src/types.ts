import type { StateAdapter } from "chat";

export interface AiBindingLike {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface AppBindings {
  AI: AiBindingLike;
  ALLOWED_TELEGRAM_USERS?: string;
  DEBUG_API_SECRET?: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_WEBHOOK_SECRET_TOKEN: string;
}

export interface SessionTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface ConversationSession {
  history: SessionTurn[];
  updatedAt: string;
}

export interface GenerateReplyInput {
  authorName: string;
  history: SessionTurn[];
  isDirectMessage: boolean;
  isMention: boolean;
  messageText: string;
  threadId: string;
}

export interface GenerateReplyResult {
  model: string;
  text: string;
}

export interface ChatResponder {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}

export interface ThreadHandle {
  id: string;
  isDM: boolean;
  post(message: string): Promise<unknown>;
  subscribe(): Promise<void>;
  unsubscribe(): Promise<void>;
}

export interface IncomingMessage {
  author: { fullName: string; userId: string; userName: string };
  isMention?: boolean;
  text: string;
}

export interface SessionStore {
  get(threadId: string): Promise<ConversationSession | null>;
  getDebugSnapshot(threadId: string): Promise<{
    session: ConversationSession | null;
    subscribed: boolean;
    threadId: string;
  }>;
  recordExchange(
    threadId: string,
    exchange: { replyText: string; userMessage: string },
    existing?: ConversationSession | null
  ): Promise<ConversationSession>;
  reset(threadId: string): Promise<void>;
}

export interface BotRuntime {
  bot: {
    getState(): StateAdapter;
    initialize(): Promise<void>;
    webhooks: {
      telegram(
        request: Request,
        options?: { waitUntil?: (task: Promise<unknown>) => void }
      ): Promise<Response>;
    };
  };
  sessionStore: SessionStore;
}

export interface RuntimeServices extends BotRuntime {
  env: AppBindings;
  responder: ChatResponder;
  state: StateAdapter;
}
