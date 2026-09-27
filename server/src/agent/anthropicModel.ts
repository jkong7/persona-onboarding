import Anthropic from '@anthropic-ai/sdk';
import type { ModelClient, ModelRequest, ModelResponse } from './model.ts';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type Thinking = 'adaptive' | 'disabled';

export interface AnthropicModelOptions {
  model: string;
  effort: Effort | null;
  thinking: Thinking;
  maxTokens: number;
  client?: Anthropic;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_MODELS = ['claude-opus-5', 'claude-fable-5'];
const NO_EFFORT_MODELS = ['claude-haiku-4-5'];
const NO_THINKING_SWITCH_MODELS = ['claude-haiku-4-5', 'claude-fable-5', 'claude-opus-5-5'];

function matches(model: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => model === prefix || model.startsWith(`${prefix}-`));
}

export function isEffort(value: unknown): value is Effort {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max';
}

export function modelOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AnthropicModelOptions {
  const model = env['AGENT_MODEL']?.trim() || 'claude-opus-5-5';
  const effort = env['AGENT_EFFORT']?.trim();
  const maxTokens = Number(env['AGENT_MAX_TOKENS']);
  return {
    model,
    effort: isEffort(effort) ? effort : 'low',
    thinking: env['AGENT_THINKING']?.trim() === 'disabled' ? 'disabled' : 'adaptive',
    maxTokens: Number.isInteger(maxTokens) && maxTokens > 0 ? maxTokens : 4000,
  };
}

export class AnthropicModel implements ModelClient {
  readonly #client: Anthropic;
  readonly #options: AnthropicModelOptions;

  constructor(options: AnthropicModelOptions) {
    this.#client = options.client ?? new Anthropic();
    this.#options = options;
  }

  get model(): string {
    return this.#options.model;
  }

  async respond(request: ModelRequest): Promise<ModelResponse> {
    const { model, effort, maxTokens, thinking } = this.#options;
    const useThinking = !matches(model, NO_THINKING_SWITCH_MODELS);
    const useFallbacks = matches(model, FALLBACK_MODELS);
    const useEffort = effort !== null && !matches(model, NO_EFFORT_MODELS);
    const started = performance.now();
    let firstTextMs: number | null = null;

    const stream = this.#client.beta.messages.stream(
      {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: request.messages,
        tools: request.tools,
        ...(useThinking ? { thinking: { type: thinking } } : {}),
        ...(useEffort ? { output_config: { effort } } : {}),
        ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      },
      request.signal === undefined ? {} : { signal: request.signal },
    );

    stream.on('text', (delta) => {
      if (firstTextMs === null) {
        firstTextMs = performance.now() - started;
      }
      request.onText?.(delta);
    });

    const message = await stream.finalMessage();
    return {
      content: message.content,
      stopReason: message.stop_reason,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      firstTextMs,
      totalMs: performance.now() - started,
    };
  }
}
