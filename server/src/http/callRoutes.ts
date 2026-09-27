import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { USER_TEXT_LIMIT } from '../agent/context.ts';
import type { AgentChannel } from '../agent/toolSchemas.ts';
import type { Trigger } from '../agent/turn.ts';
import type { StoredEvent } from '../domain/events.ts';
import { hasValue } from '../domain/record.ts';
import { isPlainObject } from '../domain/tools/input.ts';
import type { CallEndReason } from '../domain/types.ts';
import type { OnboardingService } from '../store/onboardingService.ts';
import { CALL_TOKEN_TTL_MS, type CallTokens } from '../voice/callToken.ts';
import { BRAIN_MODEL, BRAIN_PATH, type VoiceProvider, type VoiceUnavailable } from '../voice/deepgram.ts';
import type { Publisher } from './publisher.ts';
import { buildSnapshot, type Snapshot } from './snapshot.ts';
import { SSE_HEADERS } from './sse.ts';
import type { TurnQueue } from './turnQueue.ts';

export interface SpokenReply {
  text: string;
  ending: string;
  signals: unknown[];
  spoken: boolean;
}

export type AgentTurn = (
  id: string,
  channel: AgentChannel,
  trigger: Trigger,
  extras?: {
    callId?: string | null;
    inputChannel?: AgentChannel;
    signal?: AbortSignal;
    onText?: (delta: string) => void;
  },
) => Promise<SpokenReply>;

export type VoiceAvailability = { ok: true; provider: VoiceProvider } | { ok: false; reason: VoiceUnavailable };

export interface CallRouteDeps {
  service: OnboardingService;
  publisher: Publisher;
  turns: TurnQueue;
  tokens: CallTokens;
  voice: VoiceAvailability;
  agentTurn: AgentTurn;
  now: () => Date;
}

export const SILENCE_LIMIT = 3;
export const WAIT_LIMIT = 8;
const CLIENT_END_REASONS: readonly CallEndReason[] = ['user_hangup', 'tab_closed', 'network_drop', 'agent_ended'];
const DEFAULT_KEYTERMS = ['Persona', 'Gmail', 'sample inbox'];

interface CallMemory {
  typed: string[];
  silences: number;
  waits: number;
}

function isClientEndReason(value: unknown): value is CallEndReason {
  return typeof value === 'string' && (CLIENT_END_REASONS as readonly string[]).includes(value);
}

async function readBody(c: Context): Promise<unknown> {
  try {
    const raw = await c.req.text();
    return raw.trim().length === 0 ? {} : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function stringField(body: unknown, key: string): string | null {
  if (!isPlainObject(body)) {
    return null;
  }
  const value = body[key];
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => (isPlainObject(part) && typeof part['text'] === 'string' ? part['text'] : ''))
    .join(' ');
}

export function lastUserUtterance(body: unknown): string | null {
  if (!isPlainObject(body) || !Array.isArray(body['messages'])) {
    return null;
  }
  const messages = body['messages'] as unknown[];
  const last = messages.at(-1);
  if (!isPlainObject(last) || last['role'] !== 'user') {
    return null;
  }
  const text = contentText(last['content']).replace(/\s+/g, ' ').trim();
  return text.length === 0 ? null : text.slice(0, USER_TEXT_LIMIT);
}

function lastAgentMessageOfCall(events: readonly StoredEvent[], callId: string): StoredEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const stored = events[index]!;
    if (stored.event.type === 'message' && stored.event.callId === callId) {
      return stored.event.role === 'agent' ? stored : null;
    }
  }
  return null;
}

function alreadyLogged(events: readonly StoredEvent[], callId: string, text: string): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!.event;
    if (event.type !== 'message') {
      continue;
    }
    return event.role === 'user' && event.callId === callId && event.text === text;
  }
  return false;
}

function chunk(id: string, created: number, delta: Record<string, unknown>, finish: string | null): string {
  const payload = {
    id,
    object: 'chat.completion.chunk',
    created,
    model: BRAIN_MODEL,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function switchedToText(reply: SpokenReply): boolean {
  return reply.signals.some(
    (signal) => isPlainObject(signal) && signal['type'] === 'end_call' && signal['intent'] === 'switch_to_text',
  );
}

export function registerCallRoutes(app: Hono, deps: CallRouteDeps): void {
  const { service, publisher, turns, tokens, voice, agentTurn, now } = deps;
  const memory = new Map<string, CallMemory>();

  const remember = (callId: string): CallMemory => {
    const existing = memory.get(callId);
    if (existing !== undefined) {
      return existing;
    }
    const created: CallMemory = { typed: [], silences: 0, waits: 0 };
    memory.set(callId, created);
    return created;
  };

  const notFound = (c: Context, id: string): Response =>
    c.json({ error: 'onboarding_not_found', onboardingId: id.slice(0, 64) }, 404);

  const keytermsFor = (id: string): string[] => {
    const fields = service.get(id).fields;
    const names = [fields.agentName, fields.userName].flatMap((field) => (hasValue(field) ? [field.value] : []));
    return [...names, ...DEFAULT_KEYTERMS];
  };

  const finishCall = async (
    id: string,
    callId: string,
    reason: CallEndReason,
  ): Promise<{ ended: boolean; reply: SpokenReply | null; snapshot: Snapshot }> => {
    const committed = service.endCall(id, { callId, reason });
    memory.delete(callId);
    publisher.publish(id);
    if (!committed.result.ended) {
      return { ended: false, reply: null, snapshot: buildSnapshot(service, id) };
    }
    const followUp = committed.result.unplanned || reason === 'silence_timeout';
    const reply = followUp ? await agentTurn(id, 'text', { type: 'logged' }) : null;
    return { ended: true, reply, snapshot: buildSnapshot(service, id) };
  };

  app.post('/api/onboardings/:id/call/start', async (c) => {
    const id = c.req.param('id');
    if (service.find(id) === null) {
      return notFound(c, id);
    }
    if (!voice.ok) {
      return c.json({ error: 'call_unavailable', reason: voice.reason }, 409);
    }
    const provider = voice.provider;
    const outcome = await turns.run(id, async () => {
      let granted;
      try {
        granted = await provider.grantToken();
      } catch {
        return null;
      }
      const callId = randomUUID();
      service.startCall(id, callId);
      remember(callId);
      publisher.publish(id);
      const greeting = await agentTurn(id, 'voice', { type: 'logged' }, { callId });
      const brainToken = tokens.sign({
        onboardingId: id,
        callId,
        expiresAt: now().getTime() + CALL_TOKEN_TTL_MS,
      });
      return {
        callId,
        token: granted.token,
        expiresIn: granted.expiresIn,
        greeting: greeting.text,
        settings: provider.buildSettings({
          brainToken,
          greeting: greeting.text,
          keyterms: keytermsFor(id),
        }),
        snapshot: buildSnapshot(service, id),
      };
    });
    if (outcome === null) {
      return c.json({ error: 'call_unavailable', reason: 'voice_provider_failed' }, 409);
    }
    return c.json(outcome);
  });

  app.post('/api/onboardings/:id/call/end', async (c) => {
    const id = c.req.param('id');
    if (service.find(id) === null) {
      return notFound(c, id);
    }
    const body = await readBody(c);
    const callId = stringField(body, 'callId');
    const reason = isPlainObject(body) ? body['reason'] : undefined;
    if (callId === null || !isClientEndReason(reason)) {
      return c.json({ error: 'invalid_call_end' }, 400);
    }
    return c.json(await turns.run(id, () => finishCall(id, callId, reason)));
  });

  app.post('/api/onboardings/:id/call/heard', async (c) => {
    const id = c.req.param('id');
    if (service.find(id) === null) {
      return notFound(c, id);
    }
    const body = await readBody(c);
    const callId = stringField(body, 'callId');
    const fraction = isPlainObject(body) ? body['playedFraction'] : undefined;
    if (callId === null || typeof fraction !== 'number' || !Number.isFinite(fraction)) {
      return c.json({ error: 'invalid_heard_report' }, 400);
    }
    const applied = await turns.run(id, async () => {
      const target = lastAgentMessageOfCall(service.events(id), callId);
      if (target === null) {
        return false;
      }
      service.markHeard(id, { messageSeq: target.seq, playedFraction: Math.min(1, Math.max(0, fraction)) });
      publisher.publish(id);
      return true;
    });
    return c.json({ applied });
  });

  app.post('/api/onboardings/:id/call/typed', async (c) => {
    const id = c.req.param('id');
    const record = service.find(id);
    if (record === null) {
      return notFound(c, id);
    }
    const body = await readBody(c);
    const callId = stringField(body, 'callId');
    const raw = isPlainObject(body) ? body['text'] : undefined;
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, USER_TEXT_LIMIT) : '';
    if (callId === null || text.length === 0) {
      return c.json({ error: 'invalid_typed_text' }, 400);
    }
    if (record.calls.activeCallId !== callId) {
      return c.json({ accepted: false, text });
    }
    remember(callId).typed.push(text);
    return c.json({ accepted: true, text });
  });

  app.post('/api/onboardings/:id/call/silence', async (c) => {
    const id = c.req.param('id');
    const record = service.find(id);
    if (record === null) {
      return notFound(c, id);
    }
    const body = await readBody(c);
    const callId = stringField(body, 'callId');
    if (callId === null) {
      return c.json({ error: 'invalid_silence_report' }, 400);
    }
    const outcome = await turns.run(id, async () => {
      if (service.get(id).calls.activeCallId !== callId) {
        return { ended: false, reply: null, snapshot: buildSnapshot(service, id) };
      }
      const call = remember(callId);
      call.silences += 1;
      if (call.silences >= SILENCE_LIMIT) {
        return finishCall(id, callId, 'silence_timeout');
      }
      const mayWait = call.waits < WAIT_LIMIT;
      const advice =
        call.silences === 1
          ? 'The person has said nothing for a while. Check in once, briefly.'
          : 'Still nothing from the person. Offer to carry on by text instead.';
      const reply = await agentTurn(
        id,
        'voice',
        {
          type: 'event',
          kind: 'silence',
          detail: mayWait
            ? `${advice} If they asked you for a moment, use wait_quietly instead and say nothing.`
            : `${advice} They have had a good while now, so do not wait quietly this time.`,
        },
        { callId },
      );
      if (reply.text.trim().length === 0 && service.get(id).calls.activeCallId === callId) {
        call.silences -= 1;
        call.waits += 1;
        return { ended: false, reply: null, snapshot: buildSnapshot(service, id) };
      }
      return { ended: false, reply, snapshot: buildSnapshot(service, id) };
    });
    return c.json(outcome);
  });

  app.post(BRAIN_PATH, async (c) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.replace(/^Bearer\s+/i, '');
    const claims = tokens.verify(token, now().getTime());
    if (claims === null) {
      return c.json({ error: { message: 'invalid call token', type: 'invalid_request_error' } }, 401);
    }
    const { onboardingId: id, callId } = claims;
    const record = service.find(id);
    if (record === null || record.calls.activeCallId !== callId) {
      return c.json({ error: { message: 'call is not active', type: 'invalid_request_error' } }, 409);
    }
    const body = await readBody(c);
    if (body === null) {
      return c.json({ error: { message: 'invalid json', type: 'invalid_request_error' } }, 400);
    }
    const utterance = lastUserUtterance(body);
    const wantsStream = !isPlainObject(body) || body['stream'] !== false;
    if (process.env['VOICE_DEBUG'] === '1' && isPlainObject(body)) {
      const roles = Array.isArray(body['messages'])
        ? (body['messages'] as unknown[]).map((message) => (isPlainObject(message) ? String(message['role']) : '?'))
        : [];
      console.log(
        `voice request: keys [${Object.keys(body).join(', ')}], roles [${roles.join(', ')}], stream ${String(body['stream'])}, utterance ${utterance === null ? 'none' : `${utterance.length} chars`}`,
      );
    }
    const call = remember(callId);
    call.silences = 0;
    call.waits = 0;

    let inputChannel: AgentChannel = 'voice';
    let trigger: Trigger = { type: 'logged' };
    if (utterance !== null) {
      const typedIndex = call.typed.indexOf(utterance);
      if (typedIndex >= 0) {
        call.typed.splice(typedIndex, 1);
        inputChannel = 'text';
      }
      if (!alreadyLogged(service.events(id), callId, utterance)) {
        trigger = { type: 'user_message', text: utterance };
      }
    }

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(now().getTime() / 1000);
    const abort = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => abort.abort(), { once: true });

    if (!wantsStream) {
      const reply = await turns.run(id, () =>
        agentTurn(id, 'voice', trigger, { callId, inputChannel, signal: abort.signal }),
      );
      if (switchedToText(reply)) {
        void turns.run(id, () => agentTurn(id, 'text', { type: 'logged' })).catch(() => undefined);
      }
      return c.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model: BRAIN_MODEL,
        choices: [{ index: 0, message: { role: 'assistant', content: reply.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const write = (text: string): void => {
          if (!open) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            open = false;
          }
        };
        write(chunk(completionId, created, { role: 'assistant', content: '' }, null));
        void turns
          .run(id, () =>
            agentTurn(id, 'voice', trigger, {
              callId,
              inputChannel,
              signal: abort.signal,
              onText: (delta) => write(chunk(completionId, created, { content: delta }, null)),
            }),
          )
          .then((reply) => {
            if (switchedToText(reply)) {
              void turns.run(id, () => agentTurn(id, 'text', { type: 'logged' })).catch(() => undefined);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            write(chunk(completionId, created, {}, 'stop'));
            write('data: [DONE]\n\n');
            if (open) {
              open = false;
              try {
                controller.close();
              } catch {
                return;
              }
            }
          });
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  });
}
