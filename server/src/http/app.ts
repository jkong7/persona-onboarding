import { Hono, type Context } from 'hono';
import { USER_TEXT_LIMIT } from '../agent/context.ts';
import { refusesCall } from '../agent/cues.ts';
import type { ModelClient } from '../agent/model.ts';
import type { AgentChannel } from '../agent/toolSchemas.ts';
import { runTurn, type Trigger, type TurnEnding, type UiSignal } from '../agent/turn.ts';
import { hasValue } from '../domain/record.ts';
import { isPlainObject } from '../domain/tools/input.ts';
import type { InboxResolver } from '../agent/inboxTools.ts';
import { GMAIL_SCOPE } from '../gmail/config.ts';
import { GmailInbox } from '../gmail/gmailInbox.ts';
import type { GoogleAccounts } from '../gmail/google.ts';
import { SampleInbox } from '../inbox/provider.ts';
import { OnboardingNotFoundError } from '../store/errors.ts';
import type { OnboardingService } from '../store/onboardingService.ts';
import type { OnboardingRecord } from '../domain/types.ts';
import { CallTokens } from '../voice/callToken.ts';
import type { Greeting } from '../voice/greeting.ts';
import { registerCallRoutes, type AgentTurn, type VoiceAvailability } from './callRoutes.ts';
import { decideOpening, type OpenDecision } from './opening.ts';
import { Publisher } from './publisher.ts';
import { buildSnapshot, type Snapshot } from './snapshot.ts';
import { SSE_HEADERS, sseStream, type SseChannel } from './sse.ts';
import { TurnQueue } from './turnQueue.ts';

export type ModelsByChannel = Record<AgentChannel, ModelClient>;

export interface AppOptions {
  service: OnboardingService;
  models: ModelsByChannel;
  now?: () => Date;
  heartbeatMs?: number;
  publisher?: Publisher;
  turns?: TurnQueue;
  voice?: VoiceAvailability;
  tokens?: CallTokens;
  inbox?: InboxResolver;
  google?: GoogleAccounts | null;
  realGmail?: boolean;
  openingLine?: (record: OnboardingRecord) => Greeting | null;
  firstText?: () => string;
  reviewCalls?: boolean;
}

export interface Reply {
  text: string;
  ending: TurnEnding;
  signals: UiSignal[];
  spoken: boolean;
}

export interface ActionResponse {
  snapshot: Snapshot;
  reply: Reply | null;
}

export const DEFAULT_HEARTBEAT_MS = 20_000;

const UNEXPECTED_FAILURE_LINE = 'Sorry, something went wrong on my side. Mind sending that again?';

type BodyResult = { ok: true; value: unknown } | { ok: false };

async function readJson(c: Context): Promise<BodyResult> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false };
  }
}

export function createApp(options: AppOptions): Hono {
  const { service, models } = options;
  const now = options.now ?? (() => new Date());
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const publisher = options.publisher ?? new Publisher();
  const turns = options.turns ?? new TurnQueue();
  const app = new Hono();
  const sampleInbox = new SampleInbox(now);
  const google = options.google ?? null;
  const inbox: InboxResolver =
    options.inbox ??
    ((record) => {
      if (record.fields.gmail.mode === 'sample') {
        return sampleInbox;
      }
      if (record.fields.gmail.mode === 'real' && google !== null) {
        return new GmailInbox(() => google.accessToken(record.id), fetch, now);
      }
      return null;
    });

  const notFound = (c: Context, id: string): Response =>
    c.json({ error: 'onboarding_not_found', onboardingId: id.slice(0, 64) }, 404);

  const exists = (id: string): boolean => service.find(id) !== null;

  const agentTurn = async (
    id: string,
    channel: AgentChannel,
    trigger: Trigger,
    extras: Parameters<AgentTurn>[3] = {},
  ): Promise<Reply> => {
    const spoken = channel === 'voice';
    try {
      const running = runTurn(service, models[channel], {
        onboardingId: id,
        channel,
        trigger,
        ...(extras.callId === undefined ? {} : { callId: extras.callId }),
        ...(extras.inputChannel === undefined ? {} : { inputChannel: extras.inputChannel }),
        ...(extras.signal === undefined ? {} : { signal: extras.signal }),
        ...(extras.silent === undefined ? {} : { silent: extras.silent }),
        ...(extras.onText === undefined ? {} : { onText: extras.onText }),
        onCommit: () => publisher.publish(id),
        inbox,
        realGmail: options.realGmail ?? (options.google ?? null) !== null,
      });
      publisher.publish(id);
      const result = await running;
      publisher.publish(id);
      if (process.env['VOICE_DEBUG'] === '1') {
        const names = result.tools.map((trace) => `${trace.name}${trace.result.ok === true ? '' : '!'}`).join(',');
        console.log(
          `turn ${channel}: model ${result.firstTextMs === null ? 'none' : Math.round(result.firstTextMs)} ms, first word ${result.firstWordMs ?? 'none'} ms, total ${result.totalMs} ms, steps [${result.stepMs.join(', ')}], tools [${names}], in ${result.usage.inputTokens} cached ${result.usage.cacheReadTokens} written ${result.usage.cacheWriteTokens} out ${result.usage.outputTokens}`,
        );
      }
      return { text: result.text, ending: result.ending, signals: result.signals, spoken };
    } catch {
      publisher.publish(id);
      extras.onText?.(UNEXPECTED_FAILURE_LINE);
      return { text: UNEXPECTED_FAILURE_LINE, ending: 'failed', signals: [], spoken };
    }
  };

  const textTurn = (id: string, trigger: Trigger, onText?: (delta: string) => void): Promise<Reply> =>
    agentTurn(id, 'text', trigger, onText === undefined ? {} : { onText });

  registerCallRoutes(app, {
    service,
    publisher,
    turns,
    tokens: options.tokens ?? new CallTokens(),
    voice: options.voice ?? { ok: false, reason: 'missing_deepgram_key' },
    agentTurn,
    now,
    ...(options.openingLine === undefined ? {} : { openingLine: options.openingLine }),
    ...(options.reviewCalls === undefined ? {} : { reviewCalls: options.reviewCalls }),
  });

  const waitingTexts = new Map<string, number>();

  const triggerFor = (decision: OpenDecision): Trigger | null => {
    if (decision.type === 'first_visit') {
      return { type: 'event', kind: 'first_visit' };
    }
    if (decision.type === 'returned') {
      return { type: 'event', kind: 'returned', detail: decision.detail };
    }
    return null;
  };

  app.onError((error, c) => {
    if (error instanceof OnboardingNotFoundError) {
      return notFound(c, error.onboardingId);
    }
    return c.json({ error: 'internal_error' }, 500);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/onboardings', (c) => {
    const record = service.create();
    return c.json(buildSnapshot(service, record.id), 201);
  });

  app.get('/api/onboardings/:id', (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    return c.json(buildSnapshot(service, id));
  });

  app.post('/api/onboardings/:id/open', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    const response = await turns.run(id, async (): Promise<ActionResponse & { opened: OpenDecision['type'] }> => {
      const decision = decideOpening(service.events(id), service.get(id), now());
      if (decision.type === 'first_visit' && options.firstText !== undefined) {
        const text = options.firstText();
        service.logNote(id, 'first_visit', null);
        service.logMessage(id, { role: 'agent', channel: 'text', text, callId: null });
        service.callTool(id, { name: 'record_ask', input: { field: 'agentName' }, channel: 'text' });
        publisher.publish(id);
        const reply: Reply = { text, ending: 'completed', signals: [], spoken: false };
        return { opened: decision.type, reply, snapshot: buildSnapshot(service, id) };
      }
      const trigger = triggerFor(decision);
      const reply = trigger === null ? null : await textTurn(id, trigger);
      return { opened: decision.type, reply, snapshot: buildSnapshot(service, id) };
    });
    return c.json(response);
  });

  app.post('/api/onboardings/:id/messages', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    const body = await readJson(c);
    if (!body.ok) {
      return c.json({ error: 'invalid_json' }, 400);
    }
    const raw = isPlainObject(body.value) ? body.value['text'] : undefined;
    if (typeof raw !== 'string') {
      return c.json({ error: 'text_required' }, 400);
    }
    const text = raw.trim().slice(0, USER_TEXT_LIMIT);
    if (text.length === 0) {
      return c.json({ error: 'empty_text' }, 400);
    }

    waitingTexts.set(id, (waitingTexts.get(id) ?? 0) + 1);
    const stream = sseStream({
      onOpen: (channel: SseChannel) => {
        void turns
          .run(id, async () => {
            if (service.get(id).calls.ringing && refusesCall(text)) {
              service.declineCall(id);
              publisher.publish(id);
            }
            const behind = (waitingTexts.get(id) ?? 1) - 1;
            if (behind > 0) {
              waitingTexts.set(id, behind);
              service.logMessage(id, { role: 'user', channel: 'text', text, callId: null });
              publisher.publish(id);
              channel.send('done', {
                text: '',
                ending: 'completed',
                signals: [],
                spoken: false,
                snapshot: buildSnapshot(service, id),
              });
              return;
            }
            waitingTexts.delete(id);
            const reply = await textTurn(id, { type: 'user_message', text }, (delta) =>
              channel.send('delta', { text: delta }),
            );
            for (const signal of reply.signals) {
              channel.send('signal', signal);
            }
            channel.send('done', { ...reply, snapshot: buildSnapshot(service, id) });
          })
          .catch(() => {
            channel.send('done', {
              text: UNEXPECTED_FAILURE_LINE,
              ending: 'failed',
              signals: [],
              spoken: false,
              snapshot: null,
            });
          })
          .finally(() => channel.close());
      },
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  });

  app.post('/api/onboardings/:id/call/decline', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    const response = await turns.run(id, async (): Promise<ActionResponse & { declined: boolean }> => {
      const committed = service.declineCall(id);
      if (!committed.result.declined) {
        return { declined: false, reply: null, snapshot: buildSnapshot(service, id) };
      }
      publisher.publish(id);
      const reply = await textTurn(id, { type: 'logged' });
      return { declined: true, reply, snapshot: buildSnapshot(service, id) };
    });
    return c.json(response);
  });

  app.post('/api/onboardings/:id/gmail/sample', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    type SampleResponse = ActionResponse & {
      applied: boolean;
      reason: 'real_account_connected' | 'already_on_sample' | null;
    };
    const response = await turns.run(id, async (): Promise<SampleResponse> => {
      const gmail = service.get(id).fields.gmail;
      if (hasValue(gmail)) {
        return {
          applied: false,
          reason: gmail.mode === 'real' ? 'real_account_connected' : 'already_on_sample',
          reply: null,
          snapshot: buildSnapshot(service, id),
        };
      }
      service.applyGmail(id, { type: 'connected', mode: 'sample' });
      publisher.publish(id);
      const activeCallId = service.get(id).calls.activeCallId;
      const reply =
        activeCallId === null
          ? await textTurn(id, { type: 'logged' })
          : await agentTurn(id, 'voice', { type: 'logged' }, { callId: activeCallId });
      return { applied: true, reason: null, reply, snapshot: buildSnapshot(service, id) };
    });
    return c.json(response);
  });

  app.get('/api/gmail/config', (c) =>
    c.json({ enabled: google !== null, clientId: google?.clientId ?? null, scope: GMAIL_SCOPE }),
  );

  app.post('/api/onboardings/:id/gmail/exchange', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    if (google === null) {
      return c.json({ error: 'gmail_unavailable' }, 409);
    }
    if ((c.req.header('x-requested-with') ?? '').toLowerCase() !== 'xmlhttprequest') {
      return c.json({ error: 'missing_request_header' }, 400);
    }
    const body = await readJson(c);
    const code = body.ok && isPlainObject(body.value) ? body.value['code'] : undefined;
    if (typeof code !== 'string' || code.length === 0 || code.length > 2048) {
      return c.json({ error: 'code_required' }, 400);
    }
    const accounts = google;
    type ExchangeResponse = ActionResponse & { connected: boolean; reason: string | null };
    const response = await turns.run(id, async (): Promise<ExchangeResponse> => {
      const exchanged = await accounts.exchange(id, code);
      if (exchanged.ok) {
        service.applyGmail(id, { type: 'connected', mode: 'real', account: exchanged.tokens.account });
      } else {
        service.applyGmail(id, { type: 'failed', reason: exchanged.reason });
      }
      publisher.publish(id);
      const activeCallId = service.get(id).calls.activeCallId;
      const reply =
        activeCallId === null
          ? await textTurn(id, { type: 'logged' })
          : await agentTurn(id, 'voice', { type: 'logged' }, { callId: activeCallId });
      return {
        connected: exchanged.ok,
        reason: exchanged.ok ? null : exchanged.reason,
        reply,
        snapshot: buildSnapshot(service, id),
      };
    });
    return c.json(response);
  });

  app.post('/api/onboardings/:id/gmail/disconnect', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    const response = await turns.run(id, async () => {
      if (google !== null) {
        await google.disconnect(id);
      }
      const committed = service.applyGmail(id, { type: 'disconnected' });
      publisher.publish(id);
      return { disconnected: committed.result.applied, snapshot: buildSnapshot(service, id) };
    });
    return c.json(response);
  });

  app.post('/api/onboardings/:id/gmail/outcome', async (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    const body = await readJson(c);
    const outcome = body.ok && isPlainObject(body.value) ? body.value['outcome'] : undefined;
    if (outcome !== 'popup_closed' && outcome !== 'popup_blocked' && outcome !== 'access_denied') {
      return c.json({ error: 'invalid_outcome' }, 400);
    }
    const response = await turns.run(id, async (): Promise<ActionResponse & { applied: boolean }> => {
      if (service.get(id).fields.gmail.mode === 'real') {
        return { applied: false, reply: null, snapshot: buildSnapshot(service, id) };
      }
      service.applyGmail(id, { type: 'failed', reason: outcome });
      publisher.publish(id);
      const activeCallId = service.get(id).calls.activeCallId;
      const reply =
        activeCallId === null
          ? await textTurn(id, { type: 'logged' })
          : await agentTurn(id, 'voice', { type: 'logged' }, { callId: activeCallId });
      return { applied: true, reply, snapshot: buildSnapshot(service, id) };
    });
    return c.json(response);
  });

  app.get('/api/onboardings/:id/events', (c) => {
    const id = c.req.param('id');
    if (!exists(id)) {
      return notFound(c, id);
    }
    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    const release = (): void => {
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };
    const stream = sseStream({
      onOpen: (channel) => {
        const push = (): void => {
          try {
            channel.send('snapshot', buildSnapshot(service, id));
          } catch {
            channel.close();
          }
        };
        push();
        unsubscribe = publisher.subscribe(id, push);
        heartbeat = setInterval(() => channel.comment('heartbeat'), heartbeatMs);
        heartbeat.unref();
        c.req.raw.signal.addEventListener('abort', () => channel.close(), { once: true });
      },
      onClose: release,
    });
    return new Response(stream, { status: 200, headers: SSE_HEADERS });
  });

  return app;
}
