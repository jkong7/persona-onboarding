import { describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.ts';
import type { VoiceAvailability } from '../src/http/callRoutes.ts';
import { lastUserUtterance } from '../src/http/callRoutes.ts';
import type { Snapshot } from '../src/http/snapshot.ts';
import { CallTokens } from '../src/voice/callToken.ts';
import { BRAIN_PATH, cleanKeyterms, deepgramConfigFromEnv, DeepgramVoice } from '../src/voice/deepgram.ts';
import { allText, scriptedModel, type ScriptedStep } from './agentHelpers.ts';
import { memoryService, T0 } from './helpers.ts';

interface StartResponse {
  callId: string;
  token: string;
  expiresIn: number;
  greeting: string;
  settings: {
    agent: {
      greeting: string;
      listen: { provider: { keyterms?: string[] } };
      think: { endpoint: { url: string; headers: { authorization: string } } };
    };
  };
  snapshot: Snapshot;
}

interface EndResponse {
  ended: boolean;
  reply: { text: string; spoken: boolean } | null;
  snapshot: Snapshot;
}

const NOW = Date.parse(T0) + 60_000;

function voice(): VoiceAvailability {
  const result = deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'test-key', PUBLIC_URL: 'https://demo.example.com/' });
  if (!result.ok) {
    throw new Error('test voice config is invalid');
  }
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ access_token: 'short-lived-token', expires_in: 120 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
  return { ok: true, provider: new DeepgramVoice(result.config, fakeFetch) };
}

function setup(steps: ScriptedStep[], available = true) {
  const { service } = memoryService();
  const model = scriptedModel(steps);
  const tokens = new CallTokens('a-test-secret-that-is-long-enough');
  const app = createApp({
    service,
    models: { text: model, voice: model },
    now: () => new Date(NOW),
    tokens,
    ...(available ? { voice: voice() } : {}),
  });
  const id = service.create().id;
  return { app, service, model, tokens, id };
}

function post(body?: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function brainToken(start: StartResponse): string {
  return start.settings.agent.think.endpoint.headers.authorization;
}

function completion(text: string, stream = true): unknown {
  return {
    model: 'persona-brain',
    stream,
    messages: [
      { role: 'system', content: 'Replies are produced by the endpoint.' },
      { role: 'assistant', content: 'Hey.' },
      { role: 'user', content: text },
    ],
  };
}

function spokenText(sse: string): string {
  return sse
    .split('\n\n')
    .filter((block) => block.startsWith('data: {'))
    .map((block) => JSON.parse(block.slice('data: '.length)) as { choices: { delta: { content?: string } }[] })
    .map((payload) => payload.choices[0]?.delta.content ?? '')
    .join('');
}

async function startCall(app: ReturnType<typeof setup>['app'], id: string): Promise<StartResponse> {
  const response = await app.request(`/api/onboardings/${id}/call/start`, post());
  expect(response.status).toBe(200);
  return (await response.json()) as StartResponse;
}

describe('starting a call', () => {
  it('reports that calls are unavailable when voice is not configured', async () => {
    const { app, id, service } = setup([], false);
    const response = await app.request(`/api/onboardings/${id}/call/start`, post());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'call_unavailable', reason: 'missing_deepgram_key' });
    expect(service.get(id).calls.total).toBe(0);
  });

  it('returns a short-lived token, settings that point at the server, and a greeting', async () => {
    const { app, id, service, tokens } = setup([{ text: 'Hey, it is Max. What can I take off your plate?' }]);
    service.callTool(id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', op: 'set', value: 'Max' }] },
      channel: 'text',
    });
    const start = await startCall(app, id);
    expect(start.token).toBe('short-lived-token');
    expect(start.greeting).toBe('Hey, it is Max. What can I take off your plate?');
    expect(start.settings.agent.greeting).toBe(start.greeting);
    expect(start.settings.agent.think.endpoint.url).toBe(`https://demo.example.com${BRAIN_PATH}`);
    expect(start.settings.agent.listen.provider.keyterms).toContain('Max');
    expect(JSON.stringify(start.settings)).not.toContain('test-key');

    const claims = tokens.verify(brainToken(start).replace('Bearer ', ''), NOW);
    expect(claims).toMatchObject({ onboardingId: id, callId: start.callId });
    expect(service.get(id).calls).toMatchObject({ activeCallId: start.callId, total: 1, ringing: false });
    const transcript = service.transcript(id);
    expect(transcript.at(-1)).toMatchObject({ role: 'agent', channel: 'voice', callId: start.callId });
  });
});

describe('the reply endpoint Deepgram calls', () => {
  it('rejects a missing, forged or expired token', async () => {
    const { app, id, tokens } = setup([{ text: 'Hey.' }]);
    const start = await startCall(app, id);
    const missing = await app.request(BRAIN_PATH, post(completion('hello')));
    expect(missing.status).toBe(401);
    const forged = await app.request(BRAIN_PATH, post(completion('hello'), { authorization: 'Bearer a.b' }));
    expect(forged.status).toBe(401);
    const expired = tokens.sign({ onboardingId: id, callId: start.callId, expiresAt: NOW - 1 });
    const late = await app.request(BRAIN_PATH, post(completion('hello'), { authorization: `Bearer ${expired}` }));
    expect(late.status).toBe(401);
    const other = new CallTokens('another-secret-that-is-long-enough').sign({
      onboardingId: id,
      callId: start.callId,
      expiresAt: NOW + 1000,
    });
    const wrongKey = await app.request(BRAIN_PATH, post(completion('hello'), { authorization: `Bearer ${other}` }));
    expect(wrongKey.status).toBe(401);
  });

  it('streams the reply in the expected format and records what was said', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      {
        text: 'Jonathan, did I get that right?',
        tools: [
          {
            name: 'update_profile',
            input: {
              updates: [
                { field: 'userName', op: 'set', value: 'Jonathan' },
                { field: 'helpTopic', op: 'set', value: 'missing recruiter emails' },
              ],
            },
          },
        ],
      },
    ]);
    const start = await startCall(app, id);
    const response = await app.request(
      BRAIN_PATH,
      post(completion("it's Jonathan, I keep missing recruiter emails"), { authorization: brainToken(start) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(spokenText(body)).toBe('Jonathan, did I get that right?');
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);
    expect(body).toContain('"finish_reason":"stop"');

    const record = service.get(id);
    expect(record.fields.userName).toMatchObject({ value: 'Jonathan', status: 'provisional', source: 'voice' });
    expect(record.fields.helpTopic).toMatchObject({ value: 'missing recruiter emails', status: 'confirmed' });
    const last = service.transcript(id).slice(-2);
    expect(last[0]).toMatchObject({ role: 'user', channel: 'voice', callId: start.callId });
    expect(last[1]).toMatchObject({ role: 'agent', channel: 'voice', callId: start.callId });
  });

  it('answers without streaming when asked to', async () => {
    const { app, id } = setup([{ text: 'Hey.' }, { text: 'Sure.' }]);
    const start = await startCall(app, id);
    const response = await app.request(
      BRAIN_PATH,
      post(completion('ok', false), { authorization: brainToken(start) }),
    );
    const body = (await response.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0]?.message.content).toBe('Sure.');
  });

  it('treats text typed during a call as typed, so a name needs no read-back', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      {
        text: 'Got it, Siobhan.',
        tools: [{ name: 'update_profile', input: { updates: [{ field: 'userName', op: 'set', value: 'Siobhan' }] } }],
      },
    ]);
    const start = await startCall(app, id);
    const typed = await app.request(
      `/api/onboardings/${id}/call/typed`,
      post({ callId: start.callId, text: 'Siobhan' }),
    );
    expect(await typed.json()).toEqual({ accepted: true, text: 'Siobhan' });
    const response = await app.request(BRAIN_PATH, post(completion('Siobhan'), { authorization: brainToken(start) }));
    await response.text();
    expect(service.get(id).fields.userName).toMatchObject({ value: 'Siobhan', status: 'confirmed', source: 'text' });
    const user = service.transcript(id).filter((entry) => entry.role === 'user').at(-1);
    expect(user).toMatchObject({ channel: 'text', callId: start.callId });
  });

  it('does not log the same utterance twice when an unanswered request is repeated', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'Taxes, sure.' }]);
    const start = await startCall(app, id);
    service.logMessage(id, { role: 'user', channel: 'voice', text: 'help with taxes', callId: start.callId });
    const response = await app.request(
      BRAIN_PATH,
      post(completion('help with taxes'), { authorization: brainToken(start) }),
    );
    expect(spokenText(await response.text())).toBe('Taxes, sure.');
    const said = service.transcript(id).filter((entry) => entry.role === 'user');
    expect(said.map((entry) => entry.text)).toEqual(['help with taxes']);
  });

  it('stops answering once the call has ended', async () => {
    const { app, id } = setup([{ text: 'Hey.' }, { text: 'We got cut off.' }]);
    const start = await startCall(app, id);
    await app.request(`/api/onboardings/${id}/call/end`, post({ callId: start.callId, reason: 'user_hangup' }));
    const response = await app.request(BRAIN_PATH, post(completion('hello?'), { authorization: brainToken(start) }));
    expect(response.status).toBe(409);
  });

  it('lets the agent hang up', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      { text: 'Talk soon.', tools: [{ name: 'end_call', input: { intent: 'callback_later' } }] },
    ]);
    const start = await startCall(app, id);
    const response = await app.request(
      BRAIN_PATH,
      post(completion('call me back later'), { authorization: brainToken(start) }),
    );
    expect(spokenText(await response.text())).toBe('Talk soon.');
    expect(service.get(id).calls).toMatchObject({
      activeCallId: null,
      callbackRequested: true,
      unplannedHangups: 0,
    });
    const end = await app.request(
      `/api/onboardings/${id}/call/end`,
      post({ callId: start.callId, reason: 'agent_ended' }),
    );
    expect((await end.json()) as EndResponse).toMatchObject({ ended: false, reply: null });
  });
});

describe('hangups', () => {
  it('keeps everything that was said and follows up by text', async () => {
    const { app, id, service, model } = setup([
      { text: 'Hey, it is Persona.' },
      {
        text: 'Inbox triage, got it.',
        tools: [
          { name: 'update_profile', input: { updates: [{ field: 'helpTopic', op: 'set', value: 'inbox triage' }] } },
        ],
      },
      { text: 'Looks like we got cut off. I have inbox triage down. Call back, or carry on here?' },
    ]);
    const start = await startCall(app, id);
    await (
      await app.request(BRAIN_PATH, post(completion('help me triage my inbox'), { authorization: brainToken(start) }))
    ).text();
    const before = service.get(id).fields;

    const end = await app.request(
      `/api/onboardings/${id}/call/end`,
      post({ callId: start.callId, reason: 'user_hangup' }),
    );
    const ended = (await end.json()) as EndResponse;
    expect(ended.ended).toBe(true);
    expect(ended.reply).toMatchObject({ spoken: false });
    expect(ended.reply?.text).toContain('cut off');
    expect(service.get(id).fields).toEqual(before);
    expect(service.get(id).calls).toMatchObject({ activeCallId: null, unplannedHangups: 1 });
    expect(service.transcript(id).at(-1)).toMatchObject({ role: 'agent', channel: 'text' });
    expect(allText(model.requests.at(-1)!)).toContain('<event type="call_ended" reason="user_hangup" planned="false"');
  });

  it('counts a hangup once however many times it is reported', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'We got cut off.' }]);
    const start = await startCall(app, id);
    const path = `/api/onboardings/${id}/call/end`;
    const first = (await (await app.request(path, post({ callId: start.callId, reason: 'tab_closed' }))).json()) as EndResponse;
    const second = (await (await app.request(path, post({ callId: start.callId, reason: 'network_drop' }))).json()) as EndResponse;
    expect(first.ended).toBe(true);
    expect(second).toMatchObject({ ended: false, reply: null });
    expect(service.get(id).calls.unplannedHangups).toBe(1);
    expect(service.transcript(id).filter((entry) => entry.role === 'agent')).toHaveLength(2);
  });

  it('accepts a beacon sent as plain text', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'We got cut off.' }]);
    const start = await startCall(app, id);
    const response = await app.request(`/api/onboardings/${id}/call/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ callId: start.callId, reason: 'tab_closed' }),
    });
    expect(response.status).toBe(200);
    expect(service.get(id).calls.lastEndReason).toBe('tab_closed');
  });

  it('rejects a malformed end report', async () => {
    const { app, id } = setup([]);
    const response = await app.request(`/api/onboardings/${id}/call/end`, post({ callId: 'x', reason: 'bored' }));
    expect(response.status).toBe(400);
  });

  it('picks up on the next call without greeting again or losing state', async () => {
    const { app, id, service, model } = setup([
      { text: 'Hey, it is Persona. What should I call you?' },
      {
        text: 'Ana, did I get that right?',
        tools: [{ name: 'update_profile', input: { updates: [{ field: 'userName', op: 'set', value: 'Ana' }] } }],
      },
      { text: 'We got cut off. Want me to call back?' },
      { text: 'As I was asking, is it Ana?' },
    ]);
    const first = await startCall(app, id);
    await (await app.request(BRAIN_PATH, post(completion("it's Ana"), { authorization: brainToken(first) }))).text();
    await app.request(`/api/onboardings/${id}/call/end`, post({ callId: first.callId, reason: 'network_drop' }));

    const second = await startCall(app, id);
    expect(second.callId).not.toBe(first.callId);
    expect(second.greeting).toBe('As I was asking, is it Ana?');
    const sent = allText(model.requests.at(-1)!);
    expect(sent).toContain('<event type="call_connected" call_number="2" first_call="false"/>');
    expect(sent).toContain('userName = "Ana" (provisional, read back once to confirm)');
    expect(service.get(id).fields.userName).toMatchObject({ value: 'Ana', status: 'provisional' });

    const stale = await app.request(BRAIN_PATH, post(completion('hello'), { authorization: brainToken(first) }));
    expect(stale.status).toBe(409);
  });
});

describe('what the person heard', () => {
  it('cuts the last agent line to the part that was played', async () => {
    const { app, id, service } = setup([{ text: 'I can read your mail and draft replies for you.' }]);
    const start = await startCall(app, id);
    const response = await app.request(
      `/api/onboardings/${id}/call/heard`,
      post({ callId: start.callId, playedFraction: 0.4 }),
    );
    expect(await response.json()).toEqual({ applied: true });
    const line = service.transcript(id).at(-1)!;
    expect(line.interrupted).toBe(true);
    expect(line.fullText).toBe('I can read your mail and draft replies for you.');
    expect(line.text.length).toBeLessThan(line.fullText.length);
    expect(line.fullText.startsWith(line.text)).toBe(true);
  });

  it('ignores a report for a call with no agent line', async () => {
    const { app, id } = setup([]);
    const response = await app.request(
      `/api/onboardings/${id}/call/heard`,
      post({ callId: 'unknown-call', playedFraction: 0.5 }),
    );
    expect(await response.json()).toEqual({ applied: false });
  });
});

describe('silence on a call', () => {
  it('checks in twice, then ends the call and follows up by text', async () => {
    const { app, id, service, model } = setup([
      { text: 'Hey.' },
      { text: 'Still there?' },
      { text: 'Happy to carry on by text if that is easier.' },
      { text: 'I will leave it here. Text me whenever.' },
    ]);
    const start = await startCall(app, id);
    const path = `/api/onboardings/${id}/call/silence`;
    const first = (await (await app.request(path, post({ callId: start.callId }))).json()) as EndResponse;
    expect(first).toMatchObject({ ended: false, reply: { text: 'Still there?', spoken: true } });
    const second = (await (await app.request(path, post({ callId: start.callId }))).json()) as EndResponse;
    expect(second.reply?.spoken).toBe(true);
    const third = (await (await app.request(path, post({ callId: start.callId }))).json()) as EndResponse;
    expect(third).toMatchObject({ ended: true, reply: { spoken: false } });
    expect(service.get(id).calls).toMatchObject({
      activeCallId: null,
      lastEndReason: 'silence_timeout',
      unplannedHangups: 0,
    });
    expect(allText(model.requests[1]!)).toContain('<event type="silence">');
  });

  it('starts counting again once the person speaks', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      { text: 'Still there?' },
      { text: 'There you are.' },
      { text: 'Hello?' },
      { text: 'Text might be easier.' },
    ]);
    const start = await startCall(app, id);
    const path = `/api/onboardings/${id}/call/silence`;
    await app.request(path, post({ callId: start.callId }));
    await (await app.request(BRAIN_PATH, post(completion('sorry, here'), { authorization: brainToken(start) }))).text();
    await app.request(path, post({ callId: start.callId }));
    await app.request(path, post({ callId: start.callId }));
    expect(service.get(id).calls.activeCallId).toBe(start.callId);
  });
});

describe('the sample inbox during a call', () => {
  it('answers by voice', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'You are on the sample inbox now.' }]);
    const start = await startCall(app, id);
    const response = await app.request(`/api/onboardings/${id}/gmail/sample`, post());
    const body = (await response.json()) as { applied: boolean; reply: { text: string; spoken: boolean } };
    expect(body.applied).toBe(true);
    expect(body.reply).toMatchObject({ text: 'You are on the sample inbox now.', spoken: true });
    expect(service.transcript(id).at(-1)).toMatchObject({ channel: 'voice', callId: start.callId });
  });
});

describe('voice helpers', () => {
  it('reads the last user message from a completion request', () => {
    expect(lastUserUtterance(completion('  hello   there '))).toBe('hello there');
    expect(
      lastUserUtterance({ messages: [{ role: 'user', content: [{ type: 'text', text: 'typed parts' }] }] }),
    ).toBe('typed parts');
    expect(lastUserUtterance({ messages: [{ role: 'assistant', content: 'hi' }] })).toBeNull();
    expect(lastUserUtterance({ messages: 'nope' })).toBeNull();
    expect(lastUserUtterance(null)).toBeNull();
  });

  it('needs a key and a public https address', () => {
    expect(deepgramConfigFromEnv({})).toEqual({ ok: false, reason: 'missing_deepgram_key' });
    expect(deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'k' })).toEqual({ ok: false, reason: 'missing_public_url' });
    expect(deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'k', PUBLIC_URL: 'http://localhost:8787' })).toEqual({
      ok: false,
      reason: 'missing_public_url',
    });
  });

  it('cleans key terms', () => {
    expect(cleanKeyterms(['Max', 'max', ' <b>Jon</b> ', 'x', ''])).toEqual(['Max', 'b Jon b']);
  });
});

describe('being asked to wait', () => {
  it('does not count quiet waiting towards ending the call', async () => {
    const wait = { tools: [{ name: 'wait_quietly', input: { reason: 'they asked for a moment' } }] };
    const { app, id, service } = setup([{ text: 'Hey.' }, wait, wait, wait, wait, { text: 'Still there?' }]);
    const start = await startCall(app, id);
    const path = `/api/onboardings/${id}/call/silence`;
    for (let round = 0; round < 4; round += 1) {
      const body = (await (await app.request(path, post({ callId: start.callId }))).json()) as EndResponse;
      expect(body).toMatchObject({ ended: false, reply: null });
    }
    const spoken = (await (await app.request(path, post({ callId: start.callId }))).json()) as EndResponse;
    expect(spoken).toMatchObject({ ended: false, reply: { text: 'Still there?', spoken: true } });
    expect(service.get(id).calls.activeCallId).toBe(start.callId);
  });
});
