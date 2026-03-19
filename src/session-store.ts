import type { StateAdapter } from "chat";

import { MAX_SESSION_TURNS, SESSION_KEY_PREFIX } from "./constants.js";
import type { ConversationSession, SessionStore } from "./types.js";

function sessionKey(threadId: string): string {
  return `${SESSION_KEY_PREFIX}${threadId}`;
}

export class StateSessionStore implements SessionStore {
  private readonly state: StateAdapter;

  constructor(state: StateAdapter) {
    this.state = state;
  }

  get(threadId: string): Promise<ConversationSession | null> {
    return this.state.get<ConversationSession>(sessionKey(threadId));
  }

  async getDebugSnapshot(threadId: string) {
    const [session, subscribed] = await Promise.all([
      this.get(threadId),
      this.state.isSubscribed(threadId),
    ]);

    return { session, subscribed, threadId };
  }

  async recordExchange(
    threadId: string,
    exchange: { replyText: string; userMessage: string },
    existing?: ConversationSession | null
  ): Promise<ConversationSession> {
    const now = new Date().toISOString();
    const current = existing ?? (await this.get(threadId));
    const history = [
      ...(current?.history ?? []),
      { role: "user" as const, text: exchange.userMessage, timestamp: now },
      { role: "assistant" as const, text: exchange.replyText, timestamp: now },
    ].slice(-MAX_SESSION_TURNS);

    const nextSession: ConversationSession = { history, updatedAt: now };
    await this.state.set(sessionKey(threadId), nextSession);
    return nextSession;
  }

  async reset(threadId: string): Promise<void> {
    await this.state.delete(sessionKey(threadId));
  }
}
