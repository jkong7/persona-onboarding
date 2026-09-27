import { describe, expect, it } from 'vitest';
import type { ModelClient, ModelRequest, ModelResponse } from '../src/agent/model.ts';
import { createApp, type AppOptions } from '../src/http/app.ts';
import { describeGap } from '../src/http/opening.ts';
import { Publisher } from '../src/http/publisher.ts';
import type { Snapshot } from '../src/http/snapshot.ts';
import { TurnQueue } from '../src/http/turnQueue.ts';
import { scriptedModel, type ScriptedStep } from './agentHelpers.ts';
import { memoryService, T0 } from './helpers.ts';

interface SseEvent {
  event: string;
  data: unknown;
}

interface DonePayload {
  text: string;
  ending: string;
  signals: { type: string }[];
  snapshot: Snapshot;
}

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('event: '))
    .map((block) => {
      const [first = '', second = ''] = block.split('\n');
      return { event: first.slice('event: '.length), data: JSON.parse(second.slice('data: '.length)) };
    });
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  done: (buffer: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  while (!done(buffer)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`stream did not produce the expected output in time: ${buffer}`);
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('stream read timed out')), remaining)),
    ]);
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
  }
  return buffer;
}

function setup(steps: ScriptedStep[], extra: Partial<AppOptions> = {}) {
  const { service, db } = memoryService();
  const model = scriptedModel(steps);
  const publisher = new Publisher();
  const app = createApp({
    service,
    models: { text: model, voice: model },
    publisher,
    now: () => new Date(Date.parse(T0) + 60_000),
    ...extra,
  });
  return { app, service, db, model, publisher };
}

function post(body?: unknown): RequestInit {
  return body === undefined
    ? { method: 'POST' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function agentMessages(snapshot: Snapshot): string[] {
  return snapshot.transcript.filter((entry) => entry.role === 'agent').map((entry) => entry.text);
}

describe('creating and reading an onboarding', () => {
  it('creates a record and returns the same snapshot on read', async () => {
    const { app } = setup([]);
    const created = await app.request('/api/onboardings', post());
    expect(created.status).toBe(201);
    const snapshot = (await created.json()) as Snapshot;
    expect(snapshot.phase).toBe('onboarding');
    expect(snapshot.transcript).toEqual([]);
    expect(snapshot.interface).toEqual({
      gmailButtonShown: false,
      gmailConnected: false,
      gmailMode: null,
      ringing: false,
      activeCallId: null,
      mayOfferCall: true,
    });
    expect(snapshot.state.missing.map((entry) => entry.field)).toContain('helpTopic');

    const read = await app.request(`/api/onboardings/${snapshot.id}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as Snapshot).id).toBe(snapshot.id);
  });
});

describe('opening the thread', () => {
  it('greets once across repeated opens', async () => {
    const { app, service, model } = setup([{ text: "I'm Persona. What should I call myself?" }]);
    const id = service.create().id;
    const first = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as {
      opened: string;
      reply: { text: string } | null;
      snapshot: Snapshot;
    };
    expect(first.opened).toBe('first_visit');
    expect(first.reply?.text).toBe("I'm Persona. What should I call myself?");

    for (let round = 0; round < 3; round += 1) {
      const again = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as {
        opened: string;
        reply: unknown;
        snapshot: Snapshot;
      };
      expect(again.opened).toBe('none');
      expect(again.reply).toBeNull();
      expect(agentMessages(again.snapshot)).toHaveLength(1);
    }
    expect(model.requests).toHaveLength(1);
    const notes = service.events(id).filter((stored) => stored.event.type === 'note');
    expect(notes).toHaveLength(1);
  });

  it('greets once when several tabs open at the same moment', async () => {
    const { app, service, model } = setup([{ text: 'Hello there.' }]);
    const id = service.create().id;
    const responses = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const response = await app.request(`/api/onboardings/${id}/open`, post());
        return (await response.json()) as { opened: string };
      }),
    );
    expect(responses.map((response) => response.opened).sort()).toEqual([
      'first_visit',
      'none',
      'none',
      'none',
    ]);
    expect(model.requests).toHaveLength(1);
    expect(service.transcript(id).filter((entry) => entry.role === 'agent')).toHaveLength(1);
  });

  it('welcomes someone back after a long gap, and only once per return', async () => {
    let current = new Date(T0);
    const { app, service, model } = setup(
      [{ text: 'Hi.' }, { text: 'Welcome back.' }, { text: 'Sure.' }, { text: 'Back again.' }],
      { now: () => current },
    );
    const id = service.create().id;
    await app.request(`/api/onboardings/${id}/open`, post());

    current = new Date(Date.parse(T0) + 10 * 60 * 1000);
    const soon = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as { opened: string };
    expect(soon.opened).toBe('none');

    current = new Date(Date.parse(T0) + 45 * 60 * 1000);
    const back = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as {
      opened: string;
      reply: { text: string };
    };
    expect(back.opened).toBe('returned');
    expect(back.reply.text).toBe('Welcome back.');
    const note = service
      .events(id)
      .map((stored) => stored.event)
      .find((event) => event.type === 'note' && event.kind === 'returned');
    expect(note).toMatchObject({ detail: 'The person is back after about 45 minutes away.' });

    const refresh = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as {
      opened: string;
    };
    expect(refresh.opened).toBe('none');
    expect(model.requests).toHaveLength(2);

    await (await app.request(`/api/onboardings/${id}/messages`, post({ text: 'ok' }))).text();
    current = new Date(Date.parse(T0) + 5 * 60 * 60 * 1000);
    const later = (await (await app.request(`/api/onboardings/${id}/open`, post())).json()) as {
      opened: string;
    };
    expect(later.opened).toBe('returned');
    expect(model.requests).toHaveLength(4);
  });

  it('describes gaps in plain words', () => {
    expect(describeGap(31 * 60 * 1000)).toBe('about 31 minutes');
    expect(describeGap(60 * 60 * 1000)).toBe('about 60 minutes');
    expect(describeGap(3 * 60 * 60 * 1000)).toBe('about 3 hours');
    expect(describeGap(50 * 60 * 60 * 1000)).toBe('about 2 days');
  });
});

describe('sending a message', () => {
  it('streams deltas, then signals, then done, and records what the tools did', async () => {
    const { app, service } = setup([
      {
        text: 'Good to meet you, Jon. Connect button is on your screen.',
        tools: [
          { name: 'update_profile', input: { updates: [{ field: 'userName', op: 'set', value: 'Jon' }] } },
          { name: 'offer_gmail_connect', input: { userRequested: false } },
        ],
      },
    ]);
    const id = service.create().id;
    const response = await app.request(`/api/onboardings/${id}/messages`, post({ text: "I'm Jon" }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = parseSse(await response.text());
    const kinds = events.map((event) => event.event);
    expect(kinds[0]).toBe('delta');
    expect(kinds.at(-1)).toBe('done');
    expect(kinds.indexOf('signal')).toBeGreaterThan(kinds.lastIndexOf('delta'));
    expect(kinds.filter((kind) => kind === 'done')).toHaveLength(1);

    const streamed = events
      .filter((event) => event.event === 'delta')
      .map((event) => (event.data as { text: string }).text)
      .join('');
    const done = events.at(-1)!.data as DonePayload;
    expect(streamed).toBe(done.text);
    expect(done.ending).toBe('completed');
    expect(done.signals).toEqual([{ type: 'show_gmail_connect' }]);
    expect(done.snapshot.interface.gmailButtonShown).toBe(true);
    expect(done.snapshot.interface.gmailConnected).toBe(false);
    expect(done.snapshot.transcript.map((entry) => entry.role)).toEqual(['user', 'agent']);

    const record = service.get(id);
    expect(record.fields.userName).toMatchObject({ value: 'Jon', status: 'confirmed' });
    expect(record.fields.gmail.value).toBeNull();
  });

  it('runs concurrent messages to one onboarding one after another in arrival order', async () => {
    const { service } = memoryService();
    let active = 0;
    let peak = 0;
    let served = 0;
    const slow: ModelClient = {
      async respond(request: ModelRequest): Promise<ModelResponse> {
        active += 1;
        peak = Math.max(peak, active);
        served += 1;
        const text = `reply ${served}`;
        await new Promise((resolve) => setTimeout(resolve, 15));
        request.onText?.(text);
        active -= 1;
        return {
          content: [{ type: 'text', text, citations: null }] as ModelResponse['content'],
          stopReason: 'end_turn',
          usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
          firstTextMs: 1,
          totalMs: 15,
        };
      },
    };
    const app = createApp({ service, models: { text: slow, voice: slow } });
    const id = service.create().id;
    const other = service.create().id;

    const responses = await Promise.all([
      app.request(`/api/onboardings/${id}/messages`, post({ text: 'first' })),
      app.request(`/api/onboardings/${id}/messages`, post({ text: 'second' })),
      app.request(`/api/onboardings/${id}/messages`, post({ text: 'third' })),
    ]);
    await Promise.all(responses.map((response) => response.text()));

    expect(peak).toBe(1);
    expect(service.transcript(id).map((entry) => [entry.role, entry.text])).toEqual([
      ['user', 'first'],
      ['agent', 'reply 1'],
      ['user', 'second'],
      ['agent', 'reply 2'],
      ['user', 'third'],
      ['agent', 'reply 3'],
    ]);

    active = 0;
    peak = 0;
    const parallel = await Promise.all([
      app.request(`/api/onboardings/${id}/messages`, post({ text: 'a' })),
      app.request(`/api/onboardings/${other}/messages`, post({ text: 'b' })),
    ]);
    await Promise.all(parallel.map((response) => response.text()));
    expect(peak).toBe(2);
  });

  it('caps very long messages at four thousand characters', async () => {
    const { app, service } = setup([{ text: 'That was a lot.' }]);
    const id = service.create().id;
    const response = await app.request(`/api/onboardings/${id}/messages`, post({ text: 'x'.repeat(5000) }));
    await response.text();
    expect(service.transcript(id)[0]?.text).toHaveLength(4000);
  });

  it('answers with a fallback line when the model fails, never a server error', async () => {
    const { app, service } = setup([{ fail: new Error('upstream exploded at secret/path.ts:12') }]);
    const id = service.create().id;
    const response = await app.request(`/api/onboardings/${id}/messages`, post({ text: 'hello' }));
    expect(response.status).toBe(200);
    const body = await response.text();
    const done = parseSse(body).at(-1)!.data as DonePayload;
    expect(done.ending).toBe('failed');
    expect(done.text).toContain('lost my thread');
    expect(body).not.toContain('secret/path.ts');
    expect(body).not.toContain('exploded');
    expect(agentMessages(done.snapshot)).toEqual([done.text]);
  });
});

describe('declining a call', () => {
  it('counts the decline and carries on in text', async () => {
    const { app, service, model } = setup([{ text: 'No problem, we can do this here.' }]);
    const id = service.create().id;
    service.callTool(id, { name: 'place_call', input: { userRequested: false }, channel: 'text' });

    const response = await app.request(`/api/onboardings/${id}/call/decline`, post());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { declined: boolean; reply: { text: string }; snapshot: Snapshot };
    expect(body.declined).toBe(true);
    expect(body.reply.text).toBe('No problem, we can do this here.');
    expect(body.snapshot.interface.ringing).toBe(false);
    expect(service.get(id).calls.declined).toBe(1);

    const again = (await (await app.request(`/api/onboardings/${id}/call/decline`, post())).json()) as {
      declined: boolean;
      reply: unknown;
    };
    expect(again.declined).toBe(false);
    expect(again.reply).toBeNull();
    expect(service.get(id).calls.declined).toBe(1);
    expect(model.requests).toHaveLength(1);
  });
});

describe('choosing the sample inbox', () => {
  it('connects the sample inbox and replies', async () => {
    const { app, service, model } = setup([{ text: 'You are on the sample inbox now.' }]);
    const id = service.create().id;
    const body = (await (await app.request(`/api/onboardings/${id}/gmail/sample`, post())).json()) as {
      applied: boolean;
      reply: { text: string };
      snapshot: Snapshot;
    };
    expect(body.applied).toBe(true);
    expect(body.reply.text).toBe('You are on the sample inbox now.');
    expect(body.snapshot.interface).toMatchObject({ gmailConnected: true, gmailMode: 'sample' });

    const again = (await (await app.request(`/api/onboardings/${id}/gmail/sample`, post())).json()) as {
      applied: boolean;
      reason: string;
    };
    expect(again).toMatchObject({ applied: false, reason: 'already_on_sample' });
    expect(model.requests).toHaveLength(1);
  });

  it('leaves a connected real account alone', async () => {
    const { app, service, model } = setup([]);
    const id = service.create().id;
    service.applyGmail(id, { type: 'connected', mode: 'real', account: 'jon@example.com' });
    const body = (await (await app.request(`/api/onboardings/${id}/gmail/sample`, post())).json()) as {
      applied: boolean;
      reason: string;
      reply: unknown;
    };
    expect(body).toMatchObject({ applied: false, reason: 'real_account_connected', reply: null });
    expect(service.get(id).fields.gmail).toMatchObject({ value: 'jon@example.com', mode: 'real' });
    expect(model.requests).toHaveLength(0);
  });
});

describe('bad requests', () => {
  it('returns 404 with a JSON error for an unknown onboarding', async () => {
    const { app } = setup([]);
    const requests: [string, RequestInit | undefined][] = [
      ['/api/onboardings/missing', undefined],
      ['/api/onboardings/missing/open', post()],
      ['/api/onboardings/missing/messages', post({ text: 'hi' })],
      ['/api/onboardings/missing/call/decline', post()],
      ['/api/onboardings/missing/gmail/sample', post()],
      ['/api/onboardings/missing/events', undefined],
    ];
    for (const [path, init] of requests) {
      const response = await app.request(path, init);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toMatchObject({ error: 'onboarding_not_found' });
    }
    const unknownRoute = await app.request('/api/nothing-here');
    expect(unknownRoute.status).toBe(404);
    expect(await unknownRoute.json()).toEqual({ error: 'not_found' });
  });

  it('returns 400 for malformed or empty message bodies', async () => {
    const { app, service, model } = setup([]);
    const id = service.create().id;
    const malformed = await app.request(`/api/onboardings/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"text": "unterminated',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'invalid_json' });

    const cases: [unknown, string][] = [
      [{}, 'text_required'],
      [{ text: 42 }, 'text_required'],
      [['hi'], 'text_required'],
      [{ text: '' }, 'empty_text'],
      [{ text: '   \n\t ' }, 'empty_text'],
    ];
    for (const [body, error] of cases) {
      const response = await app.request(`/api/onboardings/${id}/messages`, post(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect(model.requests).toHaveLength(0);
    expect(service.transcript(id)).toEqual([]);
  });

  it('hides internal failures behind a plain JSON error', async () => {
    const { app, service, db } = setup([]);
    const id = service.create().id;
    db.close();
    const response = await app.request(`/api/onboardings/${id}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
  });
});

describe('the events stream', () => {
  it('sends a snapshot on connect and another after a change, then cleans up', async () => {
    const { app, service, publisher } = setup([{ text: 'Sample inbox it is.' }]);
    const id = service.create().id;
    const response = await app.request(`/api/onboardings/${id}/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();

    const initial = parseSse(await readUntil(reader, (buffer) => parseSse(buffer).length >= 1));
    expect(initial[0]?.event).toBe('snapshot');
    expect((initial[0]?.data as Snapshot).interface.gmailConnected).toBe(false);
    expect(publisher.listenerCount(id)).toBe(1);

    await app.request(`/api/onboardings/${id}/gmail/sample`, post());
    const later = parseSse(
      await readUntil(reader, (buffer) =>
        parseSse(buffer).some((event) => (event.data as Snapshot).transcript.length > 0),
      ),
    );
    const last = later.at(-1)!.data as Snapshot;
    expect(last.interface).toMatchObject({ gmailConnected: true, gmailMode: 'sample' });
    expect(agentMessages(last)).toEqual(['Sample inbox it is.']);

    await reader.cancel();
    expect(publisher.listenerCount(id)).toBe(0);
  });

  it('keeps a second tab in sync while the first one sends a message', async () => {
    const { app, service } = setup([{ text: 'Got it.' }]);
    const id = service.create().id;
    const watcher = (await app.request(`/api/onboardings/${id}/events`)).body!.getReader();
    await readUntil(watcher, (buffer) => parseSse(buffer).length >= 1);

    await (await app.request(`/api/onboardings/${id}/messages`, post({ text: 'hello from tab one' }))).text();
    const seen = parseSse(
      await readUntil(watcher, (buffer) =>
        parseSse(buffer).some((event) => (event.data as Snapshot).transcript.length === 2),
      ),
    );
    const transcripts = seen.map((event) => (event.data as Snapshot).transcript.map((entry) => entry.text));
    expect(transcripts).toContainEqual(['hello from tab one']);
    expect(transcripts.at(-1)).toEqual(['hello from tab one', 'Got it.']);
    await watcher.cancel();
  });

  it('sends heartbeat comments', async () => {
    const { app, service } = setup([], { heartbeatMs: 10 });
    const id = service.create().id;
    const reader = (await app.request(`/api/onboardings/${id}/events`)).body!.getReader();
    const output = await readUntil(reader, (buffer) => buffer.includes(': heartbeat'));
    expect(output).toContain(': heartbeat\n\n');
    await reader.cancel();
  });
});

describe('the turn queue', () => {
  it('keeps running after a failed job and does not block other keys', async () => {
    const queue = new TurnQueue();
    const order: string[] = [];
    const failed = queue.run('a', async () => {
      order.push('a1');
      throw new Error('boom');
    });
    const next = queue.run('a', async () => {
      order.push('a2');
      return 'ok';
    });
    const other = queue.run('b', async () => {
      order.push('b1');
      return 'other';
    });
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
    await expect(other).resolves.toBe('other');
    expect(order.indexOf('a1')).toBeLessThan(order.indexOf('a2'));
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.pending('a')).toBe(false);
  });
});
