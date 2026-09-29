import type { StateDescription } from '../domain/describe.ts';
import type { ToolResult } from '../domain/tools/index.ts';
import type { InboxProvider } from '../inbox/types.ts';
import type { Committed, OnboardingService } from '../store/onboardingService.ts';
import { DEFAULT_AGENT_NAME, isFieldName } from '../domain/fields.ts';
import { hasValue } from '../domain/record.ts';
import {
  askedForSample,
  ASK_NAME_HINT,
  cuesFor,
  INBOX_QUIET_HINT,
  SAMPLE_CHOSEN_HINT,
  shouldAskName,
  staysOnSample,
  staysQuietAboutInbox,
} from './cues.ts';
import { buildMessages, eventTag, renderInboxPreview, USER_TEXT_LIMIT, type InboxPreview } from './context.ts';
import {
  INBOX_TOOLS,
  isInboxTool,
  runInboxTool,
  type InboxResolver,
  type InboxToolResult,
} from './inboxTools.ts';
import { instructionsFor } from './instructions.ts';
import {
  addUsage,
  EMPTY_USAGE,
  type ModelClient,
  type ModelMessage,
  type ModelTool,
  type ModelResponse,
  type ModelToolResult,
  type ModelToolUse,
  type ModelUsage,
} from './model.ts';
import { nameTheyHeard, soundsLikeCorrection } from '../domain/names.ts';
import { recordAsk } from '../domain/tools/recordAsk.ts';
import { plainPunctuation, PunctuationStream } from './plainPunctuation.ts';
import { CALL_WORD_BUDGET, isInboxNudge, SpokenLimiter, THREAD_BRIDGE } from './spokenLimit.ts';
import { SEND_TEXT_TOOL, toolsFor, WAIT_TOOL, type AgentChannel } from './toolSchemas.ts';

export const MAX_STEPS = 6;
export const GRADUATE_AFTER_REPLIES = 3;

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
  realGmail?: boolean;
  silent?: boolean;
}

export interface ToolTrace {
  name: string;
  input: unknown;
  result: ToolResult | InboxToolResult | SendTextResult | WaitResult | GoodbyeFirstResult | SampleNotAskedResult;
  changed: boolean;
}

export interface SampleNotAskedResult {
  tool: 'use_sample_inbox';
  ok: false;
  reason: 'not_asked_for';
}

export interface GoodbyeFirstResult {
  tool: 'end_call';
  ok: false;
  reason: 'say_goodbye_first';
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
  firstWordMs: number | null;
  totalMs: number;
  stepMs: number[];
}

const FALLBACK_LINES: Record<AgentChannel, string> = {
  voice: 'Sorry, I lost my thread for a second. Could you say that again?',
  text: 'Sorry, I lost my thread for a second. Mind sending that again?',
};

const OUTAGE_LINES: Record<AgentChannel, string> = {
  voice: "Something's wrong on my side right now, not yours. Let's pick this up by text in a few minutes.",
  text: "Something's wrong on my side right now, not yours. Everything so far is saved. Give me a few minutes and try again.",
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
const PREVIEW_SIZE = 12;
const PREVIEW_TIMEOUT_MS = 1500;

const PREVIEW_FRESH_MS = 90_000;
const PREVIEW_CACHE_LIMIT = 200;
const previews = new Map<string, { at: number; preview: InboxPreview }>();

async function previewInbox(provider: InboxProvider | null, key: string | null = null): Promise<InboxPreview | null> {
  if (provider === null) {
    return null;
  }
  const cacheKey = key === null ? null : `${key}:${provider.kind}`;
  const cached = cacheKey === null ? undefined : previews.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < PREVIEW_FRESH_MS) {
    return cached.preview;
  }
  const fresh = await loadPreview(provider);
  if (fresh !== null && cacheKey !== null) {
    if (previews.size >= PREVIEW_CACHE_LIMIT) {
      previews.clear();
    }
    previews.set(cacheKey, { at: Date.now(), preview: fresh });
  }
  return fresh;
}

async function loadPreview(provider: InboxProvider): Promise<InboxPreview | null> {
  try {
    const emails = await Promise.race([
      provider.search({ query: null, unreadOnly: false, limit: PREVIEW_SIZE }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PREVIEW_TIMEOUT_MS)),
    ]);
    return emails === null ? null : { inbox: provider.kind, emails };
  } catch {
    return null;
  }
}

function sendText(outbox: string[], channel: AgentChannel, callId: string | null, input: unknown): SendTextResult {
  if (channel !== 'voice' || callId === null) {
    return { tool: 'send_text', ok: false, reason: 'no_call_in_progress' };
  }
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)['text'] : undefined;
  const text =
    typeof raw === 'string'
      ? plainPunctuation(raw.trim())
          .replace(/\n\s*\n+/g, '\n')
          .slice(0, SENT_TEXT_LIMIT)
      : '';
  if (text.length === 0) {
    return { tool: 'send_text', ok: false, reason: 'empty_text' };
  }
  outbox.push(text);
  return { tool: 'send_text', ok: true, reason: null };
}

const SILENT_TOOLS = new Set(['end_call', WAIT_TOOL.name]);

const INBOX_REPAIR = eventTag(
  'inbox_not_asked',
  {},
  'You brought up the inbox again, which they did not ask about, so that part was not said. Add one short question about what they just told you. Do not mention Gmail, the inbox, the button or connecting.',
);

const TEXT_TOOLS: ModelTool[] = [...toolsFor(), ...INBOX_TOOLS];
const VOICE_TOOLS: ModelTool[] = TEXT_TOOLS.map(({ strict: _strict, ...tool }) => tool);

function needsFollowUp(spoken: string, traces: readonly ToolTrace[], asked: boolean): boolean {
  if (traces.some((trace) => SILENT_TOOLS.has(trace.name) && trace.result.ok === true)) {
    return false;
  }
  if (asked) {
    return false;
  }
  if (spoken.length === 0) {
    return true;
  }
  if (traces.some((trace) => isInboxTool(trace.name))) {
    return true;
  }
  if (traces.some((trace) => trace.name === 'use_sample_inbox' && trace.changed)) {
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
  const turnStarted = performance.now();
  let firstWordMs: number | null = null;
  const stepMs: number[] = [];
  const silent = input.silent === true;
  const emit = (text: string): void => {
    if (silent) {
      return;
    }
    if (firstWordMs === null && text.trim().length > 0) {
      firstWordMs = Math.round(performance.now() - turnStarted);
    }
    input.onText?.(text);
  };
  const inputChannel = input.inputChannel ?? channel;
  const callId = input.callId ?? null;

  const heardName =
    input.trigger.type === 'user_message' && !soundsLikeCorrection(input.trigger.text)
      ? nameTheyHeard(service.get(onboardingId), service.transcript(onboardingId))
      : null;

  const replies = service
    .transcript(onboardingId)
    .filter((entry) => entry.role === 'agent')
    .map((entry) => entry.text);

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

  const gmailBefore = service.get(onboardingId).fields.gmail;
  const quietAboutInbox =
    input.trigger.type === 'user_message' &&
    staysQuietAboutInbox({
      utterance: input.trigger.text,
      replies,
      offered: gmailBefore.offered,
      connected: hasValue(gmailBefore),
    });
  const sampleAllowed = input.trigger.type !== 'user_message' || askedForSample(input.trigger.text);
  const onSample = input.trigger.type === 'user_message' && staysOnSample(input.trigger.text, gmailBefore.mode);
  const recordBefore = service.get(onboardingId);
  const nameBefore = recordBefore.fields.userName;
  const askName =
    channel === 'text' &&
    input.trigger.type === 'user_message' &&
    recordBefore.calls.activeCallId === null &&
    !recordBefore.calls.ringing &&
    shouldAskName({
      known: hasValue(nameBefore),
      asks: nameBefore.askCount,
      mayAsk: nameBefore.status === 'empty',
      userTurns: service.transcript(onboardingId).filter((entry) => entry.role === 'user').length,
    });
  const preview = await previewInbox(
    input.inbox?.(service.get(onboardingId)) ?? null,
    channel === 'voice' ? onboardingId : null,
  );
  const base = buildMessages(
    service.events(onboardingId),
    service.describe(onboardingId, channel),
    channel,
    preview,
    {
      cues: [
        ...(quietAboutInbox ? [INBOX_QUIET_HINT] : []),
        ...(onSample ? [SAMPLE_CHOSEN_HINT] : []),
        ...(askName ? [ASK_NAME_HINT] : []),
        ...(channel === 'voice' && callId !== null && input.trigger.type === 'user_message'
          ? cuesFor(input.trigger.text)
          : []),
      ],
      ...(input.realGmail === undefined ? {} : { realGmail: input.realGmail }),
    },
  );
  const turnTools = channel === 'voice' ? VOICE_TOOLS : TEXT_TOOLS;
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
  let repaired = false;
  const asked: unknown[] = [];
  const outbox: string[] = [];
  const limiter =
    channel === 'voice'
      ? new SpokenLimiter(emit, {
          bridge: callId === null ? null : THREAD_BRIDGE,
          maxWords: CALL_WORD_BUDGET,
          quietAboutInbox,
          quietAboutRealInbox: onSample,
          agentName: service.get(onboardingId).fields.agentName.value ?? DEFAULT_AGENT_NAME,
        })
      : null;

  try {
    while (steps < MAX_STEPS) {
      steps += 1;
      streamed = '';
      const needsGap = parts.length > 0;
      let gapSent = false;
      if (steps > 1 && !needsGap) {
        limiter?.afterLookup();
      }
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
          emit('\n\n');
        }
        emit(clean);
      };
      const punctuation = new PunctuationStream(forward);
      const holdBack = limiter !== null && steps > 1 && parts.length > 0;
      let held = '';
      const response = await model.respond({
        system: instructionsFor(channel, input.realGmail !== false),
        messages: [...base, ...exchange],
        tools: turnTools,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        onText: (delta) => {
          streamed += delta;
          if (holdBack) {
            held += delta;
            return;
          }
          punctuation.push(delta);
        },
        onTextEnd: () => {
          if (limiter !== null && !holdBack) {
            punctuation.flush();
            limiter.settle();
          }
        },
      });
      const narration = holdBack && toolUses(response).some((call) => isInboxTool(call.name));
      if (holdBack && !narration) {
        punctuation.push(held);
      }
      punctuation.flush();
      limiter?.settle();
      stepMs.push(Math.round(response.totalMs));
      usage = addUsage(usage, response.usage);
      if (firstTextMs === null && response.firstTextMs !== null) {
        firstTextMs = response.firstTextMs;
      }

      const spoken = narration ? '' : textOf(response);
      if (spoken.length > 0) {
        parts.push(spoken);
      }
      streamed = '';

      if (response.stopReason === 'refusal') {
        ending = 'refused';
        break;
      }
      const calls = toolUses(response);
      if (calls.length === 0 && parts.length === 0 && !nudged && !silent && steps < MAX_STEPS) {
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
      const repair =
        limiter !== null &&
        !repaired &&
        !silent &&
        steps < MAX_STEPS &&
        limiter.droppedNudges > 0 &&
        !limiter.askedQuestion;
      if (calls.length === 0 && repair && response.stopReason !== 'max_tokens') {
        repaired = true;
        exchange.push({ role: 'assistant', content: response.content }, { role: 'user', content: INBOX_REPAIR });
        continue;
      }
      if (calls.length === 0 || response.stopReason === 'max_tokens') {
        ending = 'completed';
        break;
      }

      const traces: ToolTrace[] = [];
      const results: ModelToolResult[] = [];
      for (const call of calls) {
        if (call.name === 'end_call' && channel === 'voice' && joinParts(parts, channel).length === 0) {
          const refused: GoodbyeFirstResult = { tool: 'end_call', ok: false, reason: 'say_goodbye_first' };
          traces.push({ name: call.name, input: call.input, result: refused, changed: false });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: JSON.stringify({
              result: refused,
              note: 'Say goodbye out loud in the same reply as end_call. Nothing has been said yet.',
            }),
          });
          continue;
        }
        if (call.name === 'use_sample_inbox' && !sampleAllowed) {
          const refused: SampleNotAskedResult = { tool: 'use_sample_inbox', ok: false, reason: 'not_asked_for' };
          traces.push({ name: call.name, input: call.input, result: refused, changed: false });
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: true,
            content: JSON.stringify({
              result: refused,
              note: 'They have not asked for the sample inbox, so nothing was switched. If you said it was, correct that in a few words. Offer it and wait for a yes.',
            }),
          });
          continue;
        }
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
          const outcome = sendText(outbox, channel, callId, call.input);
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
        const justConnected =
          call.name === 'use_sample_inbox' && committed.changed
            ? await previewInbox(input.inbox?.(service.get(onboardingId)) ?? null)
            : null;
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: committed.result.ok !== true,
          content:
            justConnected === null
              ? JSON.stringify({ result: committed.result, state: committed.state.text })
              : `${JSON.stringify({ result: committed.result, state: committed.state.text })}\n${renderInboxPreview(justConnected)}`,
        });
      }
      tools.push(...traces);

      const ended = traces.some((trace) => SILENT_TOOLS.has(trace.name) && trace.result.ok === true);
      if (!needsFollowUp(joinParts(parts, channel), traces, limiter?.askedQuestion === true)) {
        if (!repair || ended) {
          ending = 'completed';
          break;
        }
        repaired = true;
        exchange.push(
          { role: 'assistant', content: response.content },
          { role: 'user', content: [...results, { type: 'text', text: INBOX_REPAIR }] },
        );
        continue;
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

  let text = silent ? '' : joinParts(parts, channel);
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
      const field = typeof ask === 'object' && ask !== null ? (ask as Record<string, unknown>)['field'] : null;
      if (isFieldName(field) && hasValue(service.get(onboardingId).fields[field])) {
        continue;
      }
      const committed = service.callTool(onboardingId, { name: 'record_ask', input: ask, channel: inputChannel });
      input.onCommit?.(committed);
    }
  }
  if (heardName !== null && ending !== 'failed') {
    const field = service.get(onboardingId).fields.userName;
    if (field.status === 'provisional' && field.value === heardName) {
      const committed = service.callTool(onboardingId, {
        name: 'update_profile',
        input: { updates: [{ field: 'userName', value: heardName, confirmed: true }] },
        channel: inputChannel,
      });
      input.onCommit?.(committed);
    }
  }
  if (!silent && ending !== 'interrupted' && ending !== 'failed') {
    const record = service.get(onboardingId);
    const topic = record.fields.helpTopic;
    if (record.phase === 'onboarding' && hasValue(topic) && topic.updatedAt !== null) {
      const since = Date.parse(topic.updatedAt);
      const repliesSince = service
        .transcript(onboardingId)
        .filter((entry) => entry.role === 'agent' && Date.parse(entry.createdAt) >= since).length;
      if (repliesSince + (text.length > 0 ? 1 : 0) >= GRADUATE_AFTER_REPLIES) {
        const committed = service.callTool(onboardingId, {
          name: 'graduate',
          input: { userRequestedSkip: false },
          channel: 'system',
        });
        input.onCommit?.(committed);
        const signal = signalFor(committed.result);
        if (signal !== null) {
          signals.push(signal);
        }
      }
    }
  }
  const reply = `${text} ${overflow}`;
  const offeredInWords =
    !silent &&
    ending !== 'interrupted' &&
    isInboxNudge(reply) &&
    !tools.some((trace) => trace.name === 'offer_gmail_connect' || trace.name === 'use_sample_inbox');
  if (offeredInWords && !hasValue(service.get(onboardingId).fields.gmail)) {
    const committed = service.callTool(onboardingId, {
      name: 'offer_gmail_connect',
      input: { userRequested: false },
      channel: inputChannel,
    });
    input.onCommit?.(committed);
    const signal = signalFor(committed.result);
    if (signal !== null) {
      signals.push(signal);
    }
  }
  if (text.length === 0 && ending !== 'interrupted' && !silent) {
    const silentEnd = tools.some((trace) => SILENT_TOOLS.has(trace.name) && trace.result.ok === true);
    if (!silentEnd) {
      const stumbledBefore = replies.at(-1) === FALLBACK_LINES.text || replies.at(-1) === FALLBACK_LINES.voice;
      text =
        ending === 'refused'
          ? REFUSAL_LINES[channel]
          : ending === 'failed' && stumbledBefore
            ? OUTAGE_LINES[channel]
            : FALLBACK_LINES[channel];
      emit(text);
    }
  }

  const logged =
    text.length === 0 ? null : service.logMessage(onboardingId, { role: 'agent', channel, text, callId });
  if (ending !== 'interrupted' || text.length > 0) {
    for (const sent of outbox) {
      service.logMessage(onboardingId, { role: 'agent', channel: 'text', text: sent, callId: null });
    }
  }
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
    firstWordMs,
    totalMs: Math.round(performance.now() - turnStarted),
    stepMs,
  };
}
