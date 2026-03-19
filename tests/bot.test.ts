import { describe, expect, it, vi } from "vitest";

import {
  createMentionPatterns,
  generateAndPostReply,
  HELP_TEXT,
  normalizeIncomingText,
  parseAllowedUsers,
  parseCommand,
} from "../src/bot.js";
import { WorkersAiResponder } from "../src/services/responders.js";
import { StateSessionStore } from "../src/session-store.js";

const patterns = createMentionPatterns("test_bot");

function baseArgs(overrides: Record<string, unknown> = {}) {
  return {
    allowedUsers: null,
    message: {
      author: { fullName: "Test User", userId: "123", userName: "tester" },
      text: "Hello bot",
    },
    patterns,
    responder: {
      generateReply: async () => ({ model: "test-model", text: "Short reply" }),
    },
    sessionStore: {
      get: async () => null,
      getDebugSnapshot: async () => ({
        session: null,
        subscribed: false,
        threadId: "telegram:dm:1",
      }),
      recordExchange: vi.fn(async () => ({
        history: [],
        updatedAt: "2026-03-18T00:00:00.000Z",
      })),
      reset: async () => undefined,
    },
    thread: {
      id: "telegram:dm:1",
      isDM: true,
      post: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      unsubscribe: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

describe("bot helpers", () => {
  it("normalizes mentions and command suffixes", () => {
    expect(normalizeIncomingText("Hello @test_bot", patterns)).toBe("Hello");
    expect(normalizeIncomingText("/help@test_bot", patterns)).toBe("/help");
  });

  it("parses supported commands", () => {
    expect(parseCommand("/start")).toBe("start");
    expect(parseCommand("/help")).toBe("help");
    expect(parseCommand("/reset")).toBe("reset");
    expect(parseCommand("hello")).toBeNull();
  });

  it("builds deterministic help text", () => {
    expect(HELP_TEXT).toContain("/reset");
  });
});

describe("parseAllowedUsers", () => {
  it("returns null when no value is provided", () => {
    expect(parseAllowedUsers()).toBeNull();
    expect(parseAllowedUsers("")).toBeNull();
    expect(parseAllowedUsers("  ")).toBeNull();
  });

  it("parses comma-separated Telegram IDs", () => {
    const result = parseAllowedUsers("111,222, 333 ");
    expect(result).toBeInstanceOf(Set);
    expect(result?.has("111")).toBe(true);
    expect(result?.has("222")).toBe(true);
    expect(result?.has("333")).toBe(true);
    expect(result?.size).toBe(3);
  });

  it("handles a single ID", () => {
    const result = parseAllowedUsers("42");
    expect(result?.has("42")).toBe(true);
    expect(result?.size).toBe(1);
  });
});

describe("allowlist", () => {
  it("rejects users not in the allowlist", async () => {
    const args = baseArgs({
      allowedUsers: new Set(["999"]),
    });

    await generateAndPostReply(args);

    expect(args.thread.post).toHaveBeenCalledWith(
      "Sorry, you are not allowed to use this bot."
    );
    expect(args.thread.subscribe).not.toHaveBeenCalled();
  });

  it("allows users in the allowlist", async () => {
    const args = baseArgs({
      allowedUsers: new Set(["123"]),
    });

    await generateAndPostReply(args);

    expect(args.thread.post).toHaveBeenCalledWith("Short reply");
  });

  it("allows all users when allowlist is null", async () => {
    const args = baseArgs({ allowedUsers: null });

    await generateAndPostReply(args);

    expect(args.thread.post).toHaveBeenCalledWith("Short reply");
  });
});

describe("message handling", () => {
  it("subscribes and replies to a first DM", async () => {
    const args = baseArgs();

    await generateAndPostReply(args);

    expect(args.thread.subscribe).toHaveBeenCalledTimes(1);
    expect(args.thread.post).toHaveBeenCalledWith("Short reply");
    expect(args.sessionStore.recordExchange).toHaveBeenCalledWith(
      "telegram:dm:1",
      { replyText: "Short reply", userMessage: "Hello bot" },
      null
    );
  });

  it("handles subscribed follow-up messages using session history", async () => {
    const responder = vi.fn(async () => ({
      model: "test-model",
      text: "Follow-up reply",
    }));

    const existingSession = {
      history: [
        {
          role: "user" as const,
          text: "Earlier",
          timestamp: "2026-03-18T00:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-18T00:00:00.000Z",
    };

    const args = baseArgs({
      message: {
        author: { fullName: "Test User", userId: "123", userName: "tester" },
        isMention: true,
        text: "Another question",
      },
      responder: { generateReply: responder },
      sessionStore: {
        get: async () => existingSession,
        getDebugSnapshot: async () => ({
          session: null,
          subscribed: true,
          threadId: "telegram:thread:1",
        }),
        recordExchange: async () => ({
          history: [],
          updatedAt: "2026-03-18T00:00:00.000Z",
        }),
        reset: async () => undefined,
      },
      thread: {
        id: "telegram:thread:1",
        isDM: false,
        post: vi.fn(async () => undefined),
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
      },
    });

    await generateAndPostReply(args);

    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        history: existingSession.history,
        isMention: true,
        messageText: "Another question",
        threadId: "telegram:thread:1",
      })
    );
    expect(args.thread.post).toHaveBeenCalledWith("Follow-up reply");
  });

  it("resets the session for /reset", async () => {
    const args = baseArgs({
      message: {
        author: { fullName: "Test User", userId: "123", userName: "tester" },
        text: "/reset",
      },
      thread: {
        id: "telegram:thread:1",
        isDM: false,
        post: vi.fn(async () => undefined),
        subscribe: async () => undefined,
        unsubscribe: vi.fn(async () => undefined),
      },
      sessionStore: {
        get: async () => null,
        getDebugSnapshot: async () => ({
          session: null,
          subscribed: false,
          threadId: "telegram:thread:1",
        }),
        recordExchange: async () => ({
          history: [],
          updatedAt: "2026-03-18T00:00:00.000Z",
        }),
        reset: vi.fn(async () => undefined),
      },
    });

    await generateAndPostReply(args);

    expect(args.thread.unsubscribe).toHaveBeenCalledTimes(1);
    expect(args.sessionStore.reset).toHaveBeenCalledWith("telegram:thread:1");
    expect(args.thread.post).toHaveBeenCalledWith(
      "Session reset. Send a new message or mention me again to start over."
    );
  });
});

describe("session store and responder", () => {
  it("stores and returns debug snapshots", async () => {
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
    });

    await expect(store.getDebugSnapshot("telegram:thread:1")).resolves.toEqual({
      session: null,
      subscribed: true,
      threadId: "telegram:thread:1",
    });
  });

  it("extracts text from Workers AI responses", async () => {
    const responder = new WorkersAiResponder({
      run: async () => ({ response: "Worker AI reply" }),
    });

    await expect(
      responder.generateReply({
        authorName: "Test User",
        history: [],
        isDirectMessage: true,
        isMention: false,
        messageText: "Hello",
        threadId: "telegram:thread:1",
      })
    ).resolves.toMatchObject({ text: "Worker AI reply" });
  });
});
