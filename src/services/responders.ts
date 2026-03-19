import { WORKERS_AI_MODEL, type ChatResponder, type GenerateReplyInput } from '../types.js'

const SYSTEM_PROMPT = [
  'You are a concise Telegram assistant.',
  'Reply in plain text only.',
  'Keep replies helpful, concrete, and short.',
  'Do not use markdown tables, XML, or long disclaimers.',
].join(' ')

function normalizeAssistantText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const response = 'response' in value ? value.response : undefined
  if (typeof response === 'string' && response.trim()) {
    return response.trim()
  }

  const result = 'result' in value ? value.result : undefined
  if (typeof result === 'string' && result.trim()) {
    return result.trim()
  }

  const outputText = 'output_text' in value ? value.output_text : undefined
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText.trim()
  }

  return null
}

export class WorkersAiResponder implements ChatResponder {
  constructor(
    private readonly ai: {
      run(model: string, inputs: Record<string, unknown>): Promise<unknown>
    },
  ) {}

  async generateReply(input: GenerateReplyInput) {
    const response = await this.ai.run(WORKERS_AI_MODEL, {
      max_tokens: 300,
      messages: [
        {
          content: SYSTEM_PROMPT,
          role: 'system',
        },
        ...input.history.map((turn) => ({
          content: turn.text,
          role: turn.role,
        })),
        {
          content: [
            input.isDirectMessage ? 'Context: direct message.' : 'Context: group thread.',
            input.isMention ? 'The bot was explicitly mentioned.' : 'No explicit mention in this turn.',
            `User: ${input.authorName}`,
            `Message: ${input.messageText}`,
          ].join('\n'),
          role: 'user',
        },
      ],
      temperature: 0.4,
    })

    const text = normalizeAssistantText(response)
    if (!text) {
      throw new Error('Workers AI returned an empty reply.')
    }

    return {
      model: WORKERS_AI_MODEL,
      text,
    }
  }
}
