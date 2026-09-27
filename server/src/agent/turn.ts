import type { StateDescription } from '../domain/describe.ts';
import type { ToolResult } from '../domain/tools/index.ts';
import type { Committed, OnboardingService } from '../store/onboardingService.ts';
import { buildMessages, eventTag, USER_TEXT_LIMIT } from './context.ts';
import {
  INBOX_TOOLS,
  isInboxTool,
  runInboxTool,
  type InboxResolver,
  type InboxToolResult,
} from './inboxTools.ts';
import { INSTRUCTIONS } from './instructions.ts';
import {
  addUsage,
  EMPTY_USAGE,
  type ModelClient,
  type ModelMessage,
  type ModelResponse,
  type ModelToolResult,
  type ModelToolUse,
  type ModelUsage,
} from './model.ts';
import { recordAsk } from '../domain/tools/recordAsk.ts';
import { plainPunctuation, PunctuationStream } from './plainPunctuation.ts';
import { SpokenLimiter, THREAD_BRIDGE } from './spokenLimit.ts';
import { SEND_TEXT_TOOL, toolsFor, WAIT_TOOL, type AgentChannel } from './toolSchemas.ts';

export const MAX_STEPS = 6;

export type Trigger =
  | { type: 'user_message'; text: string }
  | { type: 'event'; kind: string; detail?: string | null }
  | { type: 'logged' };

export type UiSignal =
  | { type: 'show_gmail_connect' }
  | { type: 'ring' }
  | { type: 'graduated' }
  | { type: 'end_call'; intent: 'completed' | 'callback_later' | 'switch_to_text' };

export interface TurnInput {
  onboardingId: string;
  channel: AgentChannel;
  inputChannel?: AgentChannel;
  trigger: Trigger;
  callId?: string | null;
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onCommit?: (committed: Committed<ToolResult>) => void;
  inbox?: InboxResolver;
}

export interface ToolTrace {
  name: string;
  input: unknown;
  result: ToolResult | InboxToolResult | SendTextResult | WaitResult;
  changed: boolean;
}

export interface WaitResult {
  tool: 'wait_quietly';
  ok: boolean;
  reason: 'no_call_in_progress' | null;
}

export interface SendTextResult {
  tool: 'send_text';
  ok: boolean;
  reason: 'no_call_in_progress' | 'empty_text' | null;
}

export type TurnEnding = 'completed' | 'interrupted' | 'refused' | 'failed' | 'step_limit';

export interface TurnResult {
  text: string;
  messageSeq: number | null;
  tools: ToolTrace[];
  signals: UiSignal[];
  state: StateDescription;
  ending: TurnEnding;
  steps: number;
  usage: ModelUsage;
  firstTextMs: number | null;
}

const FALLBACK_LINES: Record<AgentChannel, string> = {
  voice: 'Sorry, I lost my thread for a second. Could you say that again?',
  text: 'Sorry, I lost my thread for a second. Mind sending that again?',
};

const REFUSAL_LINES: Record<AgentChannel, string> = {
  voice: "That's not one I can help with. What else is on your plate?",
  text: "That's not one I can help with. What else is on your plate?",
};

function toolUses(response: ModelResponse): ModelToolUse[] {
  return response.content.filter((block): block is ModelToolUse => block.type === 'tool_use');
}

function textOf(response: ModelResponse): string {
  return plainPunctuation(
    response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim(),
  );
}

function signalFor(result: ToolResult): UiSignal | null {
  if (result.ok !== true) {
    return null;
  }
  switch (result.tool) {
    case 'offer_gmail_connect':
      return { type: 'show_gmail_connect' };
    case 'place_call':
      return { type: 'ring' };
    case 'graduate':
      return 'alreadyGraduated' in result && result.alreadyGraduated ? null : { type: 'graduated' };
    case 'end_call':
      return 'intent' in result ? { type: 'end_call', intent: result.intent } : null;
    default:
      return null;
  }
}

const SENT_TEXT_LIMIT = 2000;

function sendText(
  service: OnboardingService,
  onboardingId: string,
  channel: AgentChannel,
  callId: string | null,
  input: unknown,
): SendTextResult {
  if (channel !== 'voice' || callId === null) {
    return { tool: 'send_text', ok: false, reason: 'no_call_in_progress' };
  }
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['text'] : undefined;
  const text = typeof raw === 'string' ? plainPunctuation(raw.trim()).slice(0, SENT_TEXT_LIMIT) : '';
  if (text.length === 0) {
    return { tool: 'send_text', ok: false, reason: 'empty_text' };
  }
  service.logMessage(onboardingId, { role: 'agent', channel: 'text', text, callId: null });
  return { tool: 'send_text', ok: true, reason: null };
}

const SILENT_TOOLS = new Set(['end_call', WAIT_TOOL.name]);

function needsFollowUp(spoken: string, traces: readonly ToolTrace[]): boolean {
  if (traces.some((trace) => SILENT_TOOLS.has(trace.name) && trace.result.ok === true)) {
    return false;
  }
  if (spoken.length === 0) {
    return true;
  }
  if (traces.some((trace) => isInboxTool(trace.name))) {
    return true;
  }
  return traces.some((trace) => trace.name !== 'record_ask' && trace.result.ok !== true);
}

function joinParts(parts: readonly string[], channel: AgentChannel): string {
  const kept = parts.map((part) => part.trim()).filter((part) => part.length > 0);
  return kept.join(channel === 'text' ? '\n\n' : ' ');
}

export async function runTurn(
  service: OnboardingService,
  model: ModelClient,
  input: TurnInput,
): Promise<TurnResult> {
  const { onboardingId, channel } = input;
  const inputChannel = input.inputChannel ?? channel;
  const callId = input.callId ?? null;

  if (input.trigger.type === 'user_message') {
    service.logMessage(onboardingId, {
      role: 'user',
      channel: inputChannel,
      text: input.trigger.text.slice(0, USER_TEXT_LIMIT),
      callId,
    });
  } else if (input.trigger.type === 'event') {
    service.logNote(onboardingId, input.trigger.kind, input.trigger.detail ?? null);
  }

  const base = buildMessages(service.events(onboardingId), service.describe(onboardingId, channel), channel);
  const turnTools = [...toolsFor(), ...INBOX_TOOLS];
  const exchange: ModelMessage[] = [];
  const parts: string[] = [];
  const tools: ToolTrace[] = [];
  const signals: UiSignal[] = [];
  let streamed = '';
  let usage = EMPTY_USAGE;
  let firstTextMs: number | null = null;
  let ending: TurnEnding = 'step_limit';
  let steps = 0;
  let nudged = false;
  const asked: unknown[] = [];
  const limiter =
    channel === 'voice'
      ? new SpokenLimiter((text) => input.onText?.(text), { bridge: callId === null ? null : THREAD_BRIDGE })
      : null;

  try {
    while (steps < MAX_STEPS) {
      steps += 1;
      streamed = '';
      const needsGap = parts.length > 0;
      let gapSent = false;
      const forward = (clean: string): void => {
        if (limiter !== null) {
          if (needsGap && !gapSent) {
            gapSent = true;
            limiter.breakBetweenReplies();
          }
          limiter.push(clean);
          return;
        }
        if (needsGap && !gapSent) {
          gapSent = true;
          input.onText?.('\n\n');
        }
        input.onText?.(clean);
      };
      const punctuation = new PunctuationStream(forward);
      const response = await model.respond({
        system: INSTRUCTIONS,
        messages: [...base, ...exchange],
        tools: turnTools,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        onText: (delta) => {
          streamed += delta;
          punctuation.push(delta);
        },
      });
      punctuation.flush();
      usage = addUsage(usage, response.usage);
      if (firstTextMs === null && response.firstTextMs !== null) {
        firstTextMs = response.firstTextMs;
      }

      const spoken = textOf(response);
      if (spoken.length > 0) {
        parts.push(spoken);
      }
      streamed = '';

      if (response.stopReason === 'refusal') {
        ending = 'refused';
        break;
      }
      const calls = toolUses(response);
      if (calls.length === 0 && parts.length === 0 && !nudged && steps < MAX_STEPS) {
        nudged = true;
        exchange.push({
          role: 'user',
          content: eventTag(
            'nothing_sent',
            {},
            'Nothing has reached the person yet in this turn. Write your reply to them now.',
          ),
        });
        continue;
      }
      if (calls.length === 0 || response.stopReason === 'max_tokens') {
        ending = 'completed';
        break;
      }

      const traces: ToolTrace[] = [];
      const results: ModelToolResult[] = [];
      for (const call of calls) {
        if (call.name === WAIT_TOOL.name) {
          const waiting: WaitResult =
            channel === 'voice' && callId !== null
              ? { tool: 'wait_quietly', ok: true, reason: null }
              : { tool: 'wait_quietly', ok: false, reason: 'no_call_in_progress' };
          traces.push({ name: call.name, input: call.input, result: waiting, changed: false });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: !waiting.ok,
            content: JSON.stringify(waiting),
          });
          continue;
        }
        if (call.name === 'record_ask') {
          const preview = recordAsk(service.get(onboardingId), call.input, {
            channel: inputChannel,
            now: new Date().toISOString(),
          });
          asked.push(call.input);
          traces.push({ name: call.name, input: call.input, result: preview.result, changed: false });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            content: JSON.stringify({ result: preview.result }),
          });
          continue;
        }
        if (call.name === SEND_TEXT_TOOL.name) {
          const outcome = sendText(service, onboardingId, channel, callId, call.input);
          traces.push({ name: call.name, input: call.input, result: outcome, changed: outcome.ok });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: !outcome.ok,
            content: JSON.stringify(outcome),
          });
          continue;
        }
        if (isInboxTool(call.name)) {
          const provider = input.inbox?.(service.get(onboardingId)) ?? null;
          const result = await runInboxTool(call.name, call.input, provider);
          service.logLookup(onboardingId, {
            name: call.name,
            channel: inputChannel,
            input: call.input,
            ok: result.ok,
            reason: result.reason,
          });
          traces.push({ name: call.name, input: call.input, result, changed: false });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: !result.ok,
            content: JSON.stringify(result),
          });
          continue;
        }
        const committed = service.callTool(onboardingId, {
          name: call.name,
          input: call.input,
          channel: inputChannel,
        });
        input.onCommit?.(committed);
        const trace: ToolTrace = {
          name: call.name,
          input: call.input,
          result: committed.result,
          changed: committed.changed,
        };
        traces.push(trace);
        const signal = signalFor(committed.result);
        if (signal !== null) {
          signals.push(signal);
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: committed.result.ok !== true,
          content: JSON.stringify({ result: committed.result, state: committed.state.text }),
        });
      }
      tools.push(...traces);

      if (!needsFollowUp(joinParts(parts, channel), traces)) {
        ending = 'completed';
        break;
      }
      exchange.push({ role: 'assistant', content: response.content }, { role: 'user', content: results });
    }
  } catch (error) {
    if (input.signal?.aborted === true) {
      ending = 'interrupted';
      if (streamed.trim().length > 0) {
        parts.push(plainPunctuation(streamed));
      }
      if (limiter !== null) {
        parts.length = 0;
        parts.push(limiter.spokenSoFar());
      }
    } else {
      ending = 'failed';
      const name = error instanceof Error ? error.name : 'unknown';
      service.logNote(onboardingId, 'model_error', name);
    }
  }

  let text = joinParts(parts, channel);
  let overflow = '';
  if (limiter !== null && ending !== 'interrupted' && text.length > 0) {
    const limited = limiter.finish();
    text = limited.spoken;
    overflow = callId === null ? '' : limited.overflow;
  }
  if (text.includes('?') || overflow.includes('?')) {
    const seen = new Set<string>();
    for (const ask of asked) {
      const key = JSON.stringify(ask);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const committed = service.callTool(onboardingId, { name: 'record_ask', input: ask, channel: inputChannel });
      input.onCommit?.(committed);
    }
  }
  if (text.length === 0 && ending !== 'interrupted') {
    const silentEnd = tools.some((trace) => SILENT_TOOLS.has(trace.name) && trace.result.ok === true);
    if (!silentEnd) {
      text = ending === 'refused' ? REFUSAL_LINES[channel] : FALLBACK_LINES[channel];
      input.onText?.(text);
    }
  }

  const logged =
    text.length === 0 ? null : service.logMessage(onboardingId, { role: 'agent', channel, text, callId });
  if (overflow.length > 0) {
    service.logMessage(onboardingId, { role: 'agent', channel: 'text', text: overflow, callId: null });
  }

  return {
    text,
    messageSeq: logged?.seq ?? null,
    tools,
    signals,
    state: service.describe(onboardingId, channel),
    ending,
    steps,
    usage,
    firstTextMs,
  };
}
