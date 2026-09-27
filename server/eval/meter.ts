import type { ModelClient, ModelRequest, ModelResponse, ModelUsage } from '../src/agent/model.ts';

export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const FALLBACK_PRICE: Price = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };

export function priceFor(model: string): Price {
  return PRICES[model] ?? FALLBACK_PRICE;
}

export function costOf(model: string, usage: ModelUsage): number {
  const price = priceFor(model);
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  );
}

export class Meter {
  costUsd = 0;
  requests = 0;
  firstWordsMs: number[] = [];

  byModel: Record<string, ModelUsage & { requests: number; costUsd: number }> = {};

  add(model: string, usage: ModelUsage): void {
    const cost = costOf(model, usage);
    this.costUsd += cost;
    this.requests += 1;
    const total = this.byModel[model] ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      requests: 0,
      costUsd: 0,
    };
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    total.cacheReadTokens += usage.cacheReadTokens;
    total.cacheWriteTokens += usage.cacheWriteTokens;
    total.requests += 1;
    total.costUsd += cost;
    this.byModel[model] = total;
  }
}

export function metered(model: ModelClient, name: string, meter: Meter): ModelClient {
  return {
    async respond(request: ModelRequest): Promise<ModelResponse> {
      const response = await model.respond(request);
      meter.add(name, response.usage);
      if (response.firstTextMs !== null) {
        meter.firstWordsMs.push(Math.round(response.firstTextMs));
      }
      return response;
    },
  };
}
