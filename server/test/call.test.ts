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
    openingLine: () => null,
    reviewCalls: false,
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

function completion(text: string, stream = true, heard: string[] = ['Hey.']): unknown {
  return {
    model: 'persona-brain',
    stream,
    messages: [
      { role: 'system', content: 'Replies are produced by the endpoint.' },
      ...heard.map((line) => ({ role: 'assistant', content: line })),
      { role: 'user', content: text },
    ],
  };
}

function said(service: { transcript: (id: string) => { role: string; channel: string; text: string }[] }, id: string): string[] {
  return service
    .transcript(id)
    .filter((entry) => entry.role === 'agent' && entry.channel === 'voice')
    .map((entry) => entry.text);
}

function spokenText(sse: string): string {
  return sse
    .split('\n\n')
    .filter((block) => block.startsWith('data: {'))
    .map((block) => JSON.parse(block.slice('data: '.length)) as { choices: { delta: { content?: string } }[] })
    .map((payload) => payload.choices[0]?.delta.content ?? '')
    .join('')
    .trim();
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

  it('lets the agent ask to hang up, and ends the call once the page confirms', async () => {
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
    expect(service.get(id).calls).toMatchObject({ activeCallId: start.callId, hangupIntent: 'callback_later' });
    const snapshot = (await (await app.request(`/api/onboardings/${id}`)).json()) as Snapshot;
    expect(snapshot.interface.hangupRequested).toBe(true);

    const end = await app.request(
      `/api/onboardings/${id}/call/end`,
      post({ callId: start.callId, reason: 'agent_ended' }),
    );
    expect((await end.json()) as EndResponse).toMatchObject({ ended: true, reply: null });
    expect(service.get(id).calls).toMatchObject({
      activeCallId: null,
      callbackRequested: true,
      unplannedHangups: 0,
      lastEndReason: 'agent_ended',
    });
  });

  it('follows up by text when the agent ends the call to switch to text', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      { text: 'Sure, I will text you.', tools: [{ name: 'end_call', input: { intent: 'switch_to_text' } }] },
      { text: 'Here we are. What should I call you?' },
    ]);
    const start = await startCall(app, id);
    await (
      await app.request(BRAIN_PATH, post(completion('can we text instead'), { authorization: brainToken(start) }))
    ).text();
    const end = await app.request(
      `/api/onboardings/${id}/call/end`,
      post({ callId: start.callId, reason: 'agent_ended' }),
    );
    const body = (await end.json()) as EndResponse;
    expect(body).toMatchObject({ ended: true, reply: { spoken: false } });
    expect(body.reply?.text).toBe('Here we are. What should I call you?');
    expect(service.transcript(id).at(-1)).toMatchObject({ role: 'agent', channel: 'text' });
  });

  it('keeps the call going when the person speaks after the goodbye', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      { text: 'Bye for now.', tools: [{ name: 'end_call', input: { intent: 'completed' } }] },
      { text: 'Of course, go ahead.' },
    ]);
    const start = await startCall(app, id);
    const headers = { authorization: brainToken(start) };
    await (await app.request(BRAIN_PATH, post(completion('ok bye'), headers))).text();
    expect(service.get(id).calls.hangupIntent).toBe('completed');
    const more = await app.request(
      BRAIN_PATH,
      post(completion('wait, one more thing', true, ['Hey.', 'Bye for now.']), headers),
    );
    expect(spokenText(await more.text())).toBe('Of course, go ahead.');
    expect(service.get(id).calls).toMatchObject({ activeCallId: start.callId, hangupIntent: null });
  });

  it('will not hang up in silence', async () => {
    const { app, id, service, model } = setup([
      { text: 'Hey.' },
      { tools: [{ name: 'end_call', input: { intent: 'completed' } }] },
      { text: 'Bye for now.', tools: [{ name: 'end_call', input: { intent: 'completed' } }] },
    ]);
    const start = await startCall(app, id);
    const response = await app.request(BRAIN_PATH, post(completion('ok bye'), { authorization: brainToken(start) }));
    expect(spokenText(await response.text())).toBe('Bye for now.');
    expect(allText(model.requests.at(-1)!)).toContain('say_goodbye_first');
    expect(service.get(id).calls.hangupIntent).toBe('completed');
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

  it('does not count a question the hangup stopped them answering', async () => {
    const { app, id, service } = setup([
      { text: 'Hey, it is Persona.' },
      {
        text: 'Good to meet you, Marcus. What can I take off your plate?',
        tools: [
          { name: 'update_profile', input: { updates: [{ field: 'userName', value: 'Marcus' }] } },
          { name: 'record_ask', input: { field: 'helpTopic' } },
        ],
      },
      { text: 'We got cut off, Marcus. What were you about to say?' },
    ]);
    const start = await startCall(app, id);
    await (
      await app.request(BRAIN_PATH, post(completion('My name is Marcus.'), { authorization: brainToken(start) }))
    ).text();
    expect(service.get(id).fields.helpTopic.askCount).toBe(1);

    await app.request(`/api/onboardings/${id}/call/end`, post({ callId: start.callId, reason: 'network_drop' }));
    expect(service.get(id).fields.helpTopic.askCount).toBe(0);
    expect(service.events(id).some((stored) => stored.event.type === 'note' && stored.event.kind === 'ask_unanswered')).toBe(
      true,
    );
  });

  it('treats a name recorded after the call as heard, not typed', async () => {
    const { app, id, service } = setup([
      { text: 'Hey, it is Persona.' },
      { text: 'Sorry, I did not catch your name. Could you say it again?' },
      { tools: [{ name: 'update_profile', input: { updates: [{ field: 'userName', value: 'B', confirmed: false }] } }] },
      { text: 'The call cut out. Could you type your name for me?' },
    ]);
    const start = await startCall(app, id);
    await (
      await app.request(BRAIN_PATH, post(completion("I'm b and I need a dentist."), { authorization: brainToken(start) }))
    ).text();
    await app.request(`/api/onboardings/${id}/call/end`, post({ callId: start.callId, reason: 'user_hangup' }));
    expect(service.get(id).fields.userName).toMatchObject({ value: 'B', status: 'provisional', source: 'voice' });
    expect(service.describe(id).text).toContain('probably misheard');
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
    expect(sent).toContain('userName = "Ana" (heard on a call, use it once so they can correct it)');
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

describe('replies the person never heard', () => {
  it('drops a reply the voice service threw away and answers the full sentence', async () => {
    const { app, id, service, model } = setup([
      { text: 'Hey.' },
      {
        text: 'Yes to what, exactly?',
        tools: [{ name: 'update_profile', input: { updates: [{ field: 'helpTopic', op: 'set', value: 'yes' }] } }],
      },
      {
        text: 'Good, Jonathan it is.',
        tools: [{ name: 'update_profile', input: { updates: [{ field: 'helpTopic', op: 'clear', value: null }] } }],
      },
    ]);
    const start = await startCall(app, id);
    const headers = { authorization: brainToken(start) };
    await (await app.request(BRAIN_PATH, post(completion('Yes.'), headers))).text();
    expect(said(service, id)).toEqual(['Hey.', 'Yes to what, exactly?']);

    const second = await app.request(BRAIN_PATH, post(completion("Yes. That's right."), headers));
    expect(spokenText(await second.text())).toBe('Good, Jonathan it is.');
    expect(said(service, id)).toEqual(['Hey.', 'Good, Jonathan it is.']);
    const people = service.transcript(id).filter((entry) => entry.role === 'user');
    expect(people.map((entry) => entry.text)).toEqual(["Yes. That's right."]);
    const sent = allText(model.requests.at(-1)!);
    expect(sent).not.toContain('Yes to what, exactly?');
    expect(sent.match(/That's right/g)).toHaveLength(1);
  });

  it('keeps a reply the voice service did speak', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'Jon, did I get that right?' }, { text: 'Good.' }]);
    const start = await startCall(app, id);
    const headers = { authorization: brainToken(start) };
    await (await app.request(BRAIN_PATH, post(completion("I'm Jon"), headers))).text();
    await (
      await app.request(BRAIN_PATH, post(completion('yes', true, ['Hey.', 'Jon, did I get that right?']), headers))
    ).text();
    expect(said(service, id)).toEqual(['Hey.', 'Jon, did I get that right?', 'Good.']);
    expect(service.transcript(id).filter((entry) => entry.role === 'user').map((entry) => entry.text)).toEqual([
      "I'm Jon",
      'yes',
    ]);
  });

  it('records how much of a reply was heard when the voice service reports less', async () => {
    const { app, id, service } = setup([
      { text: 'Hey.' },
      { text: 'I can read your mail and draft replies for you to send.' },
      { text: 'Go ahead.' },
    ]);
    const start = await startCall(app, id);
    const headers = { authorization: brainToken(start) };
    await (await app.request(BRAIN_PATH, post(completion('what can you do'), headers))).text();
    await (
      await app.request(BRAIN_PATH, post(completion('wait', true, ['Hey.', 'I can read your mail']), headers))
    ).text();
    const line = service.transcript(id).find((entry) => entry.fullText.startsWith('I can read your mail'));
    expect(line).toMatchObject({ interrupted: true, text: 'I can read your mail' });
  });

  it('cancels the reply in progress when a newer request arrives', async () => {
    const { service } = memoryService();
    const gate: { release: () => void } = { release: () => undefined };
    const seen: string[] = [];
    const model = {
      async respond(request: { messages: unknown[]; signal?: AbortSignal; onText?: (delta: string) => void }) {
        const text = JSON.stringify(request.messages.at(-1));
        if (text.includes('call_connected') && !text.includes('user_message')) {
          return reply('Hey.', request.onText);
        }
        if (text.includes('>Yes.<')) {
          seen.push('partial started');
          await new Promise<void>((resolve, reject) => {
            gate.release = resolve;
            request.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          });
          seen.push('partial finished');
          return reply('This should never be heard.', request.onText);
        }
        seen.push('full started');
        return reply('Good, Jonathan it is.', request.onText);
      },
    };
    const app = createApp({
      service,
      models: { text: model, voice: model },
      now: () => new Date(NOW),
      tokens: new CallTokens('a-test-secret-that-is-long-enough'),
      openingLine: () => null,
      reviewCalls: false,
      voice: voice(),
    });
    const id = service.create().id;
    const start = await startCall(app, id);
    const headers = { authorization: brainToken(start) };
    const first = app.request(BRAIN_PATH, post(completion('Yes.'), headers));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await app.request(BRAIN_PATH, post(completion("Yes. That's right."), headers));
    expect(spokenText(await second.text())).toBe('Good, Jonathan it is.');
    expect(spokenText(await (await first).text())).toBe('');
    expect(seen).toEqual(['partial started', 'full started']);
    expect(said(service, id)).toEqual(['Hey.', 'Good, Jonathan it is.']);
  });
});

function reply(text: string, onText?: (delta: string) => void) {
  onText?.(text);
  return {
    content: [{ type: 'text', text, citations: null }] as never,
    stopReason: 'end_turn' as const,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    firstTextMs: 1,
    totalMs: 1,
  };
}

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

describe('when the voice service cannot reach the server', () => {
  it('refuses to start a call and leaves the record untouched', async () => {
    const { service } = memoryService();
    const result = deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'test-key', PUBLIC_URL: 'https://gone.example.com' });
    if (!result.ok) {
      throw new Error('test voice config is invalid');
    }
    const calls: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      calls.push(String(input));
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    const model = scriptedModel([{ text: 'The call would not connect on my side. We can carry on here.' }]);
    const app = createApp({
      service,
      models: { text: model, voice: scriptedModel([]) },
      voice: { ok: true, provider: new DeepgramVoice(result.config, fakeFetch) },
    });
    const id = service.create().id;
    service.callTool(id, { name: 'place_call', input: { userRequested: false }, channel: 'text' });
    const response = await app.request(`/api/onboardings/${id}/call/start`, post());
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; reason: string; reply: { text: string } };
    expect(body).toMatchObject({ error: 'call_unavailable', reason: 'public_url_unreachable' });
    expect(body.reply.text).toContain('would not connect');
    expect(calls).toEqual(['https://gone.example.com/api/health']);
    expect(service.get(id).calls).toMatchObject({ total: 0, activeCallId: null, ringing: false, declined: 0 });
    expect(allText(model.requests[0]!)).toContain('<event type="call_could_not_connect">');
  });

  it('reads the public address from a file that can change while running', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'persona-url-')), 'public-url.txt');
    writeFileSync(file, '');
    const result = deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'test-key', PUBLIC_URL_FILE: file });
    if (!result.ok) {
      throw new Error('a url file alone should be enough');
    }
    const fakeFetch = (async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;
    const provider = new DeepgramVoice(result.config, fakeFetch);
    expect(await provider.reachable()).toBe(false);
    writeFileSync(file, 'https://first.example.com\n');
    expect(await provider.reachable()).toBe(true);
    const first = provider.buildSettings({ brainToken: 't', greeting: 'hi', keyterms: [] }) as {
      agent: { think: { endpoint: { url: string } } };
    };
    expect(first.agent.think.endpoint.url).toBe(`https://first.example.com${BRAIN_PATH}`);
    writeFileSync(file, 'https://second.example.com/\n');
    const second = provider.buildSettings({ brainToken: 't', greeting: 'hi', keyterms: [] }) as {
      agent: { think: { endpoint: { url: string } } };
    };
    expect(second.agent.think.endpoint.url).toBe(`https://second.example.com${BRAIN_PATH}`);
  });
});

describe('sentences the voice service sends more than once', () => {
  it('replaces an unanswered sentence with its fuller version', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'Lee, did I get that right?' }]);
    const start = await startCall(app, id);
    service.logMessage(id, { role: 'user', channel: 'voice', text: "It's Lee", callId: start.callId });
    const response = await app.request(BRAIN_PATH, post(completion("It's Lee."), { authorization: brainToken(start) }));
    await response.text();
    const said = service.transcript(id).filter((entry) => entry.role === 'user');
    expect(said.map((entry) => entry.text)).toEqual(["It's Lee"]);
  });

  it('joins two halves of a thought when the first was never answered', async () => {
    const { app, id, service, model } = setup([{ text: 'Hey.' }, { text: 'Got it.' }]);
    const start = await startCall(app, id);
    service.logMessage(id, { role: 'user', channel: 'voice', text: 'My name is Jon', callId: start.callId });
    const response = await app.request(
      BRAIN_PATH,
      post(completion('and I need help with email'), { authorization: brainToken(start) }),
    );
    await response.text();
    const said = service.transcript(id).filter((entry) => entry.role === 'user');
    expect(said.map((entry) => entry.text)).toEqual(['My name is Jon and I need help with email']);
    const sent = allText(model.requests.at(-1)!);
    expect(sent.match(/My name is Jon/g)).toHaveLength(1);
  });

  it('keeps a longer restatement and drops the shorter one', async () => {
    const { app, id, service } = setup([{ text: 'Hey.' }, { text: 'Sure.' }]);
    const start = await startCall(app, id);
    service.logMessage(id, { role: 'user', channel: 'voice', text: 'I need help', callId: start.callId });
    const response = await app.request(
      BRAIN_PATH,
      post(completion('I need help with my lease.'), { authorization: brainToken(start) }),
    );
    await response.text();
    const said = service.transcript(id).filter((entry) => entry.role === 'user');
    expect(said.map((entry) => entry.text)).toEqual(['I need help with my lease.']);
  });
});

describe('the opening line of a first call', () => {
  function app(steps: ScriptedStep[]) {
    const { service } = memoryService();
    const model = scriptedModel(steps);
    const built = createApp({
      service,
      models: { text: model, voice: model },
      now: () => new Date(NOW),
      tokens: new CallTokens('a-test-secret-that-is-long-enough'),
      reviewCalls: false,
      voice: voice(),
    });
    return { app: built, service, model, id: service.create().id };
  }

  it('is instant, uses the chosen name, and asks for theirs', async () => {
    const { app: built, service, model, id } = app([]);
    service.callTool(id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Max', confirmed: true }] },
      channel: 'text',
    });
    const start = await startCall(built, id);
    expect(start.greeting).toMatch(/Max/);
    expect(start.greeting).toMatch(/\?$/);
    expect(start.greeting.match(/\?/g)).toHaveLength(1);
    expect(model.requests).toHaveLength(0);
    expect(service.get(id).fields.userName.askCount).toBe(1);
    expect(service.transcript(id).at(-1)).toMatchObject({ role: 'agent', channel: 'voice', text: start.greeting });
  });

  it('falls back to Persona when no name was chosen', async () => {
    const { app: built, id } = app([]);
    const start = await startCall(built, id);
    expect(start.greeting).toMatch(/Persona/);
  });

  it('asks what to help with when the name is already known', async () => {
    const { app: built, service, id } = app([]);
    service.callTool(id, {
      name: 'update_profile',
      input: { updates: [{ field: 'userName', value: 'Dana', confirmed: true }] },
      channel: 'text',
    });
    const start = await startCall(built, id);
    expect(start.greeting).toMatch(/Dana/);
    expect(service.get(id).fields.helpTopic.askCount).toBe(1);
  });

  it('lets the agent choose its own words when it already knows both', async () => {
    const { app: built, service, model, id } = app([{ text: 'Hey Dana, about those invoices.' }]);
    service.callTool(id, {
      name: 'update_profile',
      input: {
        updates: [
          { field: 'userName', value: 'Dana', confirmed: true },
          { field: 'helpTopic', value: 'unpaid invoices', confirmed: true },
        ],
      },
      channel: 'text',
    });
    const start = await startCall(built, id);
    expect(start.greeting).toBe('Hey Dana, about those invoices.');
    expect(model.requests).toHaveLength(1);
  });

  it('leaves a resumed call to the agent', async () => {
    const { app: built, model, id } = app([{ text: 'We got cut off.' }, { text: 'As I was saying.' }]);
    const first = await startCall(built, id);
    await built.request(`/api/onboardings/${id}/call/end`, post({ callId: first.callId, reason: 'network_drop' }));
    const second = await startCall(built, id);
    expect(second.greeting).toBe('As I was saying.');
    expect(model.requests).toHaveLength(2);
  });
});

describe('reviewing a call once it is over', () => {
  it('saves what the call missed, and says nothing', async () => {
    const { service } = memoryService();
    const model = scriptedModel([
      { text: 'Hey.' },
      { text: 'Jon, nice. Bye for now.', tools: [{ name: 'end_call', input: { intent: 'completed' } }] },
      {
        text: 'This text must never reach the person.',
        tools: [
          {
            name: 'update_profile',
            input: { updates: [{ field: 'userName', value: 'Jon', confirmed: false }] },
          },
        ],
      },
    ]);
    const built = createApp({
      service,
      models: { text: model, voice: model },
      now: () => new Date(NOW),
      tokens: new CallTokens('a-test-secret-that-is-long-enough'),
      openingLine: () => null,
      voice: voice(),
    });
    const id = service.create().id;
    const start = await startCall(built, id);
    await (
      await built.request(BRAIN_PATH, post(completion("I'm Jon, bye"), { authorization: brainToken(start) }))
    ).text();
    const end = await built.request(
      `/api/onboardings/${id}/call/end`,
      post({ callId: start.callId, reason: 'agent_ended' }),
    );
    expect((await end.json()) as EndResponse).toMatchObject({ ended: true, reply: null });
    expect(service.get(id).fields.userName.value).toBe('Jon');
    expect(service.transcript(id).map((entry) => entry.text)).not.toContain('This text must never reach the person.');
    expect(allText(model.requests.at(-1)!)).toContain('<event type="call_review">');
  });
});

describe('eager end of turn', () => {
  function listen(env: Record<string, string>): Record<string, unknown> {
    const result = deepgramConfigFromEnv({ DEEPGRAM_API_KEY: 'k', PUBLIC_URL: 'https://demo.example.com', ...env });
    if (!result.ok) {
      throw new Error('config should load');
    }
    const settings = new DeepgramVoice(result.config).buildSettings({
      brainToken: 'token',
      greeting: 'Hey.',
      keyterms: [],
    }) as { agent: { listen: { provider: Record<string, unknown> } } };
    return settings.agent.listen.provider;
  }

  it('is off unless it is set', () => {
    expect(listen({})).not.toHaveProperty('eager_eot_threshold');
  });

  it('is passed through when set, and never above the end of turn threshold', () => {
    expect(listen({ DEEPGRAM_EAGER_EOT_THRESHOLD: '0.5' })).toMatchObject({ eager_eot_threshold: 0.5, eot_threshold: 0.7 });
    expect(listen({ DEEPGRAM_EAGER_EOT_THRESHOLD: '0.9', DEEPGRAM_EOT_THRESHOLD: '0.6' })).toMatchObject({
      eager_eot_threshold: 0.6,
    });
  });
});
