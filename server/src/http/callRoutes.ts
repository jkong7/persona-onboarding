import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { USER_TEXT_LIMIT } from '../agent/context.ts';
import type { AgentChannel } from '../agent/toolSchemas.ts';
import type { Trigger } from '../agent/turn.ts';
import type { StoredEvent } from '../domain/events.ts';
import { hasValue } from '../domain/record.ts';
import { isPlainObject } from '../domain/tools/input.ts';
import { unansweredAsks } from '../domain/tools/recordAsk.ts';
import type { CallEndReason, OnboardingRecord } from '../domain/types.ts';
import type { OnboardingService } from '../store/onboardingService.ts';
import { CALL_TOKEN_TTL_MS, type CallTokens } from '../voice/callToken.ts';
import { BRAIN_MODEL, BRAIN_PATH, type VoiceProvider, type VoiceUnavailable } from '../voice/deepgram.ts';
import { openingLine as defaultOpeningLine, type Greeting } from '../voice/greeting.ts';
import { parseConversation, plain, reconcile, trailingUtterance } from '../voice/reconcile.ts';
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
    silent?: boolean;
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
  openingLine?: (record: OnboardingRecord) => Greeting | null;
  reviewCalls?: boolean;
}

export const SILENCE_LIMIT = 3;
export const WAIT_LIMIT = 8;
export const HANGUP_GRACE_MS = 25_000;
const CLIENT_END_REASONS: readonly CallEndReason[] = ['user_hangup', 'tab_closed', 'network_drop', 'agent_ended'];
const DEFAULT_KEYTERMS = ['Persona', 'Gmail', 'sample inbox'];

interface CallMemory {
  typed: string[];
  silences: number;
  waits: number;
  inflight: AbortController | null;
  hangupTimer: ReturnType<typeof setTimeout> | null;
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

export function lastUserUtterance(body: unknown): string | null {
  return trailingUtterance(parseConversation(body));
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

function askedToHangUp(reply: SpokenReply): boolean {
  return reply.signals.some((signal) => isPlainObject(signal) && signal['type'] === 'end_call');
}

export function registerCallRoutes(app: Hono, deps: CallRouteDeps): void {
  const { service, publisher, turns, tokens, voice, agentTurn, now } = deps;
  const openingLine = deps.openingLine ?? defaultOpeningLine;
  const reviewCalls = deps.reviewCalls ?? true;
  const memory = new Map<string, CallMemory>();

  const remember = (callId: string): CallMemory => {
    const existing = memory.get(callId);
    if (existing !== undefined) {
      return existing;
    }
    const created: CallMemory = { typed: [], silences: 0, waits: 0, inflight: null, hangupTimer: null };
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
    const intent = service.get(id).calls.hangupIntent;
    const unanswered = unansweredAsks(service.events(id), callId);
    const committed = service.endCall(id, { callId, reason });
    if (committed.result.ended && committed.result.unplanned) {
      for (const field of unanswered) {
        service.refundAsk(id, field);
      }
    }
    const call = memory.get(callId);
    if (call !== undefined) {
      call.inflight?.abort();
      if (call.hangupTimer !== null) {
        clearTimeout(call.hangupTimer);
      }
    }
    memory.delete(callId);
    publisher.publish(id);
    if (!committed.result.ended) {
      return { ended: false, reply: null, snapshot: buildSnapshot(service, id) };
    }
    const followUp =
      committed.result.unplanned ||
      reason === 'silence_timeout' ||
      (reason === 'agent_ended' && intent === 'switch_to_text');
    if (followUp) {
      const reply = await agentTurn(id, 'text', { type: 'logged' }, { inputChannel: 'voice' });
      return { ended: true, reply, snapshot: buildSnapshot(service, id) };
    }
    if (!reviewCalls) {
      return { ended: true, reply: null, snapshot: buildSnapshot(service, id) };
    }
    await agentTurn(
      id,
      'text',
      {
        type: 'event',
        kind: 'call_review',
        detail:
          'The call is over. Check what the person said on it against the state. Record anything they told you that is not saved yet. Write no reply: nothing you write here is sent.',
      },
      { silent: true, inputChannel: 'voice' },
    );
    return { ended: true, reply: null, snapshot: buildSnapshot(service, id) };
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
      if (provider.reachable !== undefined && !(await provider.reachable())) {
        return 'unreachable' as const;
      }
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
      const opening = openingLine(service.get(id));
      let greeting: { text: string };
      if (opening === null) {
        greeting = await agentTurn(id, 'voice', { type: 'logged' }, { callId });
      } else {
        service.logMessage(id, { role: 'agent', channel: 'voice', text: opening.text, callId });
        service.callTool(id, { name: 'record_ask', input: { field: opening.asks }, channel: 'voice' });
        publisher.publish(id);
        greeting = { text: opening.text };
      }
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
    if (outcome === 'unreachable' || outcome === null) {
      const reply = await turns.run(id, async () => {
        service.cancelRing(id);
        publisher.publish(id);
        return agentTurn(id, 'text', {
          type: 'event',
          kind: 'call_could_not_connect',
          detail:
            'The call failed to connect because of a technical problem on our side, not because of anything the person did. Say so in a few words and carry on in text.',
        });
      });
      return c.json(
        {
          error: 'call_unavailable',
          reason: outcome === null ? 'voice_provider_failed' : 'public_url_unreachable',
          reply,
          snapshot: buildSnapshot(service, id),
        },
        409,
      );
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
    const conversation = parseConversation(body);
    const utterance = trailingUtterance(conversation);
    const abort = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => abort.abort(), { once: true });
    const wantsStream = !isPlainObject(body) || body['stream'] !== false;
    if (process.env['VOICE_DEBUG'] === '1') {
      console.log(
        `voice request: ${conversation.length} turns, stream ${String(wantsStream)}, utterance ${utterance === null ? 'none' : `${utterance.length} chars`}`,
      );
    }
    const call = remember(callId);
    call.silences = 0;
    call.waits = 0;
    call.inflight?.abort();
    call.inflight = abort;

    const voiceTurn = (onText?: (delta: string) => void): Promise<SpokenReply> =>
      turns.run(id, async () => {
        const silent: SpokenReply = { text: '', ending: 'interrupted', signals: [], spoken: true };
        if (abort.signal.aborted || service.get(id).calls.activeCallId !== callId) {
          return silent;
        }
        const outcome = reconcile(service.events(id), callId, conversation);
        for (const seq of outcome.supersede) {
          service.supersedeMessage(id, seq);
        }
        for (const entry of outcome.heard) {
          service.markHeard(id, { messageSeq: entry.seq, heardText: entry.text });
        }
        if (outcome.discardedReply || outcome.utterance !== null) {
          service.cancelHangup(id);
          if (call.hangupTimer !== null) {
            clearTimeout(call.hangupTimer);
            call.hangupTimer = null;
          }
        }
        if (outcome.supersede.length > 0 || outcome.heard.length > 0) {
          publisher.publish(id);
        }
        let inputChannel: AgentChannel = 'voice';
        if (outcome.utterance !== null) {
          const wanted = plain(outcome.utterance);
          const typedIndex = call.typed.findIndex((text) => plain(text) === wanted);
          if (typedIndex >= 0) {
            call.typed.splice(typedIndex, 1);
            inputChannel = 'text';
          }
        }
        const trigger: Trigger =
          outcome.utterance === null || outcome.alreadyLogged
            ? { type: 'logged' }
            : { type: 'user_message', text: outcome.utterance };
        const reply = await agentTurn(id, 'voice', trigger, {
          callId,
          inputChannel,
          signal: abort.signal,
          ...(onText === undefined ? {} : { onText }),
        });
        if (call.inflight === abort) {
          call.inflight = null;
        }
        if (askedToHangUp(reply) && !abort.signal.aborted) {
          if (call.hangupTimer !== null) {
            clearTimeout(call.hangupTimer);
          }
          call.hangupTimer = setTimeout(() => {
            call.hangupTimer = null;
            void turns
              .run(id, async () => {
                const calls = service.get(id).calls;
                if (calls.activeCallId === callId && calls.hangupIntent !== null) {
                  await finishCall(id, callId, 'agent_ended');
                }
              })
              .catch(() => undefined);
          }, HANGUP_GRACE_MS);
          call.hangupTimer.unref();
        }
        return reply;
      });

    const completionId = `chatcmpl-${randomUUID()}`;
    const created = Math.floor(now().getTime() / 1000);

    if (!wantsStream) {
      const reply = await voiceTurn();
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
        void voiceTurn((delta) => write(chunk(completionId, created, { content: delta }, null)))
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
