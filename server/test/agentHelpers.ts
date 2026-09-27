import type {
  ModelBlock,
  ModelClient,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
} from '../src/agent/model.ts';

export interface ScriptedToolCall {
  name: string;
  input: unknown;
}

export interface ScriptedStep {
  text?: string;
  tools?: ScriptedToolCall[];
  stopReason?: ModelStopReason;
  fail?: Error;
  abortAfterText?: AbortController;
}

export interface ScriptedModel extends ModelClient {
  requests: ModelRequest[];
  remaining: () => number;
}

function textBlock(text: string): ModelBlock {
  return { type: 'text', text, citations: null } as ModelBlock;
}

function toolBlock(call: ScriptedToolCall, id: string): ModelBlock {
  return { type: 'tool_use', id, name: call.name, input: call.input } as ModelBlock;
}

export function scriptedModel(steps: ScriptedStep[]): ScriptedModel {
  const queue = [...steps];
  const requests: ModelRequest[] = [];
  let counter = 0;
  return {
    requests,
    remaining: () => queue.length,
    async respond(request: ModelRequest): Promise<ModelResponse> {
      requests.push({ ...request, messages: structuredClone(request.messages) });
      const step = queue.shift();
      if (step === undefined) {
        throw new Error('scripted model ran out of steps');
      }
      if (step.fail !== undefined) {
        throw step.fail;
      }
      const content: ModelBlock[] = [];
      if (step.text !== undefined && step.text.length > 0) {
        request.onText?.(step.text);
        content.push(textBlock(step.text));
      }
      if (step.abortAfterText !== undefined) {
        step.abortAfterText.abort();
        const aborted = new Error('Request was aborted.');
        aborted.name = 'APIUserAbortError';
        throw aborted;
      }
      for (const call of step.tools ?? []) {
        counter += 1;
        content.push(toolBlock(call, `toolu_${counter}`));
      }
      const hasTools = (step.tools ?? []).length > 0;
      return {
        content,
        stopReason: step.stopReason ?? (hasTools ? 'tool_use' : 'end_turn'),
        usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 },
        firstTextMs: step.text === undefined ? null : 5,
        totalMs: 10,
      };
    },
  };
}

export function messageText(message: ModelMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return message.content
    .map((block) => {
      if (block.type === 'text') {
        return block.text;
      }
      if (block.type === 'tool_result') {
        return typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
      }
      return '';
    })
    .join('\n');
}

export function lastUserText(request: ModelRequest): string {
  const last = request.messages.at(-1);
  return last === undefined ? '' : messageText(last);
}

export function allText(request: ModelRequest): string {
  return request.messages.map(messageText).join('\n');
}
