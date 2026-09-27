import type Anthropic from '@anthropic-ai/sdk';

export type ModelMessage = Anthropic.Beta.BetaMessageParam;
export type ModelBlock = Anthropic.Beta.BetaContentBlock;
export type ModelTool = Anthropic.Beta.BetaTool;
export type ModelToolUse = Anthropic.Beta.BetaToolUseBlock;
export type ModelToolResult = Anthropic.Beta.BetaToolResultBlockParam;
export type ModelStopReason = Anthropic.Beta.BetaStopReason | null;

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: ModelTool[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}

export interface ModelResponse {
  content: ModelBlock[];
  stopReason: ModelStopReason;
  usage: ModelUsage;
  firstTextMs: number | null;
  totalMs: number;
}

export interface ModelClient {
  respond(request: ModelRequest): Promise<ModelResponse>;
}

export const EMPTY_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function addUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}
