import { WORKERS_AI_MODEL } from "../constants.js";
import type {
  AiBindingLike,
  ChatResponder,
  GenerateReplyInput,
} from "../types.js";

const SYSTEM_PROMPT =
  "You are a concise Telegram assistant. Reply in plain text only. Keep replies helpful, concrete, and short. Do not use markdown tables, XML, or long disclaimers.";

function normalizeAssistantText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const key of ["response", "result", "output_text"] as const) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "string" && field.trim()) {
      return field.trim();
    }
  }

  return null;
}

export class WorkersAiResponder implements ChatResponder {
  private readonly ai: AiBindingLike;

  constructor(ai: AiBindingLike) {
    this.ai = ai;
  }

  async generateReply(input: GenerateReplyInput) {
    const response = await this.ai.run(WORKERS_AI_MODEL, {
      max_tokens: 300,
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        ...input.history.map((turn) => ({
          content: turn.text,
          role: turn.role,
        })),
        {
          content: [
            input.isDirectMessage
              ? "Context: direct message."
              : "Context: group thread.",
            input.isMention
              ? "The bot was explicitly mentioned."
              : "No explicit mention in this turn.",
            `User: ${input.authorName}`,
            `Message: ${input.messageText}`,
          ].join("\n"),
          role: "user",
        },
      ],
      temperature: 0.4,
    });

    const text = normalizeAssistantText(response);
    if (!text) {
      throw new Error("Workers AI returned an empty reply.");
    }

    return { model: WORKERS_AI_MODEL, text };
  }
}
