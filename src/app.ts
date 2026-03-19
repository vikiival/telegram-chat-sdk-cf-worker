import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

const BEARER_PREFIX = /^Bearer\s+/i;

import { createTelegramBotRuntime } from "./bot.js";
import { getAppEnv } from "./config.js";
import { WorkersAiResponder } from "./services/responders.js";
import type { AppBindings, RuntimeServices } from "./types.js";

interface CreateAppOptions {
  runtime?: RuntimeServices;
}

const debugThreadParamsSchema = z.object({
  threadId: z.string().trim().min(1),
});

let runtimePromise: Promise<RuntimeServices> | null = null;

async function buildRuntime(env: AppBindings): Promise<RuntimeServices> {
  const parsedEnv = getAppEnv(env);
  const responder = new WorkersAiResponder(parsedEnv.AI);
  const botRuntime = createTelegramBotRuntime(parsedEnv, responder);
  await botRuntime.bot.initialize();
  return {
    ...botRuntime,
    env: parsedEnv,
    responder,
    state: botRuntime.bot.getState(),
  };
}

function getRuntime(env: AppBindings): Promise<RuntimeServices> {
  if (!runtimePromise) {
    runtimePromise = buildRuntime(env).catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

function assertDebugAccess(
  authHeader: string | undefined,
  expectedSecret: string | undefined
): void {
  if (!expectedSecret) {
    return;
  }
  const token = authHeader?.replace(BEARER_PREFIX, "").trim();
  if (token !== expectedSecret) {
    throw new HTTPException(401, { message: "Unauthorized debug access" });
  }
}

interface AppContext {
  Bindings: AppBindings;
  Variables: { runtime: RuntimeServices };
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<AppContext>();

  const resolveRuntime = async (
    c: { env: AppBindings },
    next: () => Promise<void>
  ) => {
    c.set("runtime", options.runtime ?? (await getRuntime(c.env)));
    await next();
  };

  app.get("/", (c) => c.text("Telegram Chat SDK Worker PoC is running."));

  app.get("/health", resolveRuntime, (c) => {
    const runtime = c.get("runtime");
    return c.json({
      ok: true,
      services: { ai: Boolean(runtime.env.AI), telegram: true },
    });
  });

  app.post("/webhooks/telegram", resolveRuntime, (c) => {
    const runtime = c.get("runtime");
    const waitUntil = c.executionCtx?.waitUntil?.bind(c.executionCtx);
    return runtime.bot.webhooks.telegram(c.req.raw, { waitUntil });
  });

  app.get("/debug/session/:threadId", resolveRuntime, async (c) => {
    const runtime = c.get("runtime");
    assertDebugAccess(
      c.req.header("authorization"),
      runtime.env.DEBUG_API_SECRET
    );
    const params = debugThreadParamsSchema.parse(c.req.param());
    return c.json(await runtime.sessionStore.getDebugSnapshot(params.threadId));
  });

  app.post("/debug/reset/:threadId", resolveRuntime, async (c) => {
    const runtime = c.get("runtime");
    assertDebugAccess(
      c.req.header("authorization"),
      runtime.env.DEBUG_API_SECRET
    );
    const params = debugThreadParamsSchema.parse(c.req.param());
    await Promise.all([
      runtime.state.unsubscribe(params.threadId),
      runtime.sessionStore.reset(params.threadId),
    ]);
    return c.json({ ok: true, threadId: params.threadId });
  });

  app.notFound((c) => c.json({ message: "Not Found" }, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ message: error.message }, error.status);
    }
    if (error instanceof z.ZodError) {
      return c.json(
        { issues: error.issues, message: "Invalid request payload" },
        400
      );
    }
    console.error("Unhandled application error.", error);
    return c.json({ message: "Internal server error" }, 500);
  });

  return app;
}
