import type { Hono } from 'hono';
import type { Snapshot } from '../src/http/snapshot.ts';
import type { OnboardingRecord } from '../src/domain/types.ts';
import type { TurnQueue } from '../src/http/turnQueue.ts';
import type { OnboardingService } from '../src/store/onboardingService.ts';
import { BRAIN_PATH } from '../src/voice/deepgram.ts';
import { sameFields } from './checks.ts';
import { DONE, type SimulatedPerson } from './people.ts';
import type { Beat, CallEnd, Finding, Line, Scenario } from './types.ts';

export interface Clock {
  ms: number;
}

interface ActiveCall {
  callId: string;
  authorization: string;
}

interface StartResponse {
  callId: string;
  greeting: string;
  settings: { agent: { think: { endpoint: { headers: { authorization: string } } } } };
}

function post(body?: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export class Driver {
  readonly lines: Line[] = [];
  readonly findings: Finding[] = [];
  readonly #app: Hono;
  readonly #service: OnboardingService;
  readonly #clock: Clock;
  readonly #scenario: Scenario;
  readonly #person: SimulatedPerson;
  readonly #turns: TurnQueue;
  #id = '';
  #call: ActiveCall | null = null;
  #seen = 0;

  constructor(
    app: Hono,
    service: OnboardingService,
    clock: Clock,
    scenario: Scenario,
    person: SimulatedPerson,
    turns: TurnQueue,
  ) {
    this.#turns = turns;
    this.#app = app;
    this.#service = service;
    this.#clock = clock;
    this.#scenario = scenario;
    this.#person = person;
  }

  get onboardingId(): string {
    return this.#id;
  }

  record(): OnboardingRecord {
    return this.#service.get(this.#id);
  }

  async run(): Promise<void> {
    const created = await this.#app.request('/api/onboardings', post());
    this.#id = ((await created.json()) as Snapshot).id;
    for (const beat of this.#scenario.beats) {
      await this.#play(beat);
    }
    if (this.#call !== null) {
      await this.#hangup('user_hangup', false);
    }
  }

  async #snapshot(): Promise<Snapshot> {
    const response = await this.#app.request(`/api/onboardings/${this.#id}`);
    return (await response.json()) as Snapshot;
  }

  #tick(): void {
    this.#clock.ms += 4000;
  }

  #say(who: Line['who'], channel: Line['channel'], text: string): void {
    if (text.trim().length > 0) {
      this.lines.push({ who, channel, text: text.trim() });
    }
  }

  async #settle(): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!this.#turns.pending(this.#id)) {
        return;
      }
    }
  }

  async #spokenSoFar(callId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const snapshot = await this.#snapshot();
    return snapshot.transcript
      .filter((entry) => entry.callId === callId && (entry.channel === 'voice' || entry.role === 'user'))
      .map((entry) => ({ role: entry.role === 'agent' ? 'assistant' : 'user', content: entry.text }));
  }

  async #collect(): Promise<void> {
    const snapshot = await this.#snapshot();
    for (const entry of snapshot.transcript) {
      if (entry.seq <= this.#seen) {
        continue;
      }
      this.#seen = entry.seq;
      if (entry.role === 'agent') {
        this.#say('agent', entry.channel === 'voice' ? 'voice' : 'text', entry.fullText);
      }
    }
  }

  async #afterAgentTurn(): Promise<void> {
    if (this.#call === null) {
      return;
    }
    const snapshot = await this.#snapshot();
    if (snapshot.interface.activeCallId === null || snapshot.interface.hangupRequested) {
      const callId = this.#call.callId;
      this.#call = null;
      this.#say('event', 'system', 'the assistant ended the call');
      await this.#app.request(`/api/onboardings/${this.#id}/call/end`, post({ callId, reason: 'agent_ended' }));
      await this.#settle();
      await this.#collect();
    }
  }

  async #speak(text: string, typed = false): Promise<void> {
    this.#tick();
    if (this.#call === null) {
      this.#say('user', 'text', text);
      const response = await this.#app.request(`/api/onboardings/${this.#id}/messages`, post({ text }));
      await response.text();
      await this.#collect();
      return;
    }
    const call = this.#call;
    if (typed) {
      await this.#app.request(`/api/onboardings/${this.#id}/call/typed`, post({ callId: call.callId, text }));
    }
    this.#say('user', typed ? 'text' : 'voice', typed ? `(typed during the call) ${text}` : text);
    const response = await this.#app.request(
      BRAIN_PATH,
      post(
        { model: 'persona-brain', stream: true, messages: [...(await this.#spokenSoFar(call.callId)), { role: 'user', content: text }] },
        { authorization: call.authorization },
      ),
    );
    if (response.status !== 200) {
      this.#say('event', 'system', `the call did not answer (status ${response.status})`);
      return;
    }
    await response.text();
    await this.#collect();
    await this.#afterAgentTurn();
  }

  async #accept(): Promise<void> {
    this.#tick();
    const response = await this.#app.request(`/api/onboardings/${this.#id}/call/start`, post());
    if (response.status !== 200) {
      this.#say('event', 'system', `the call could not start (status ${response.status})`);
      return;
    }
    const started = (await response.json()) as StartResponse;
    this.#call = {
      callId: started.callId,
      authorization: started.settings.agent.think.endpoint.headers.authorization,
    };
    this.#say('event', 'system', 'the person answered the call');
    await this.#collect();
    await this.#afterAgentTurn();
  }

  async #decline(): Promise<void> {
    this.#tick();
    const response = await this.#app.request(`/api/onboardings/${this.#id}/call/decline`, post());
    const body = (await response.json()) as { declined: boolean };
    if (body.declined) {
      this.#say('event', 'system', 'the person declined the call');
    }
    await this.#collect();
  }

  async #hangup(reason: CallEnd, record = true): Promise<void> {
    if (this.#call === null) {
      return;
    }
    this.#tick();
    const before = this.record();
    const callId = this.#call.callId;
    this.#call = null;
    await this.#app.request(`/api/onboardings/${this.#id}/call/end`, post({ callId, reason }));
    const words: Record<CallEnd, string> = {
      user_hangup: 'the person hung up',
      tab_closed: 'the person closed the tab mid-call',
      network_drop: 'the connection dropped',
    };
    this.#say('event', 'system', words[reason]);
    await this.#collect();
    if (record) {
      this.findings.push(sameFields(before, this.record()));
    }
  }

  async #handleRing(): Promise<boolean> {
    const snapshot = await this.#snapshot();
    if (!snapshot.interface.ringing || this.#call !== null) {
      return false;
    }
    if (this.#scenario.onRing === 'accept') {
      await this.#accept();
      return true;
    }
    if (this.#scenario.onRing === 'decline') {
      await this.#decline();
      return true;
    }
    return false;
  }

  async #screen(): Promise<string[]> {
    const snapshot = await this.#snapshot();
    const screen: string[] = [];
    if (snapshot.interface.ringing) {
      screen.push('an incoming call from the assistant, with accept and decline');
    }
    if (snapshot.interface.gmailButtonShown && !snapshot.interface.gmailConnected) {
      screen.push('a card with two buttons: Connect Gmail, and Use sample inbox');
    }
    if (snapshot.interface.gmailMode === 'sample') {
      screen.push('a label saying Sample inbox');
    }
    return screen;
  }

  async #reached(until: 'graduated' | 'ringing' | 'call_over' | undefined): Promise<boolean> {
    if (until === undefined) {
      return false;
    }
    const snapshot = await this.#snapshot();
    if (until === 'graduated') {
      return snapshot.phase === 'graduated';
    }
    if (until === 'ringing') {
      return snapshot.interface.ringing;
    }
    return this.#call === null;
  }

  async #converse(turns: number, until: 'graduated' | 'ringing' | 'call_over' | undefined): Promise<void> {
    for (let turn = 0; turn < turns; turn += 1) {
      if (await this.#reached(until)) {
        return;
      }
      if (until !== 'ringing') {
        await this.#handleRing();
      }
      const screen = await this.#screen();
      const wantsSample =
        screen.some((item) => item.includes('Use sample inbox')) &&
        /sample inbox|demo inbox/i.test(this.#scenario.persona) &&
        !/will not connect Gmail or use any inbox/i.test(this.#scenario.persona);
      const next = await this.#person.next(this.#scenario, this.lines, this.#call !== null, screen);
      if (next === DONE || next.includes(DONE)) {
        return;
      }
      await this.#speak(next);
      if (wantsSample && /sample|demo/i.test(next)) {
        const snapshot = await this.#snapshot();
        if (!snapshot.interface.gmailConnected) {
          await this.#play({ do: 'gmail_sample' });
        }
      }
    }
    if (until !== 'ringing') {
      await this.#handleRing();
    }
  }

  async #play(beat: Beat): Promise<void> {
    switch (beat.do) {
      case 'open': {
        this.#tick();
        const response = await this.#app.request(`/api/onboardings/${this.#id}/open`, post());
        const body = (await response.json()) as { opened: string };
        if (body.opened === 'returned') {
          this.#say('event', 'system', 'the person opened the thread again');
        }
        await this.#collect();
        return;
      }
      case 'say':
        await this.#speak(beat.text);
        if (this.#scenario.onRing !== 'ignore') {
          await this.#handleRing();
        }
        return;
      case 'converse':
        await this.#converse(beat.turns, beat.until);
        return;
      case 'accept_call':
        await this.#accept();
        return;
      case 'decline_call':
        await this.#decline();
        return;
      case 'hangup':
        await this.#hangup(beat.reason);
        return;
      case 'silence': {
        if (this.#call === null) {
          return;
        }
        this.#clock.ms += 12_000;
        const callId = this.#call.callId;
        const response = await this.#app.request(`/api/onboardings/${this.#id}/call/silence`, post({ callId }));
        const body = (await response.json()) as { ended: boolean };
        this.#say('event', 'system', 'the person has said nothing for a while');
        if (body.ended) {
          this.#call = null;
          this.#say('event', 'system', 'the call ended after the silence');
        }
        await this.#collect();
        await this.#afterAgentTurn();
        return;
      }
      case 'type_in_call':
        await this.#speak(beat.text, true);
        return;
      case 'gmail_sample': {
        this.#tick();
        const response = await this.#app.request(`/api/onboardings/${this.#id}/gmail/sample`, post());
        const body = (await response.json()) as { applied: boolean };
        if (body.applied) {
          this.#say('event', 'system', 'the person pressed Use sample inbox');
        }
        await this.#collect();
        await this.#afterAgentTurn();
        return;
      }
      case 'gmail_outcome': {
        this.#tick();
        const response = await this.#app.request(
          `/api/onboardings/${this.#id}/gmail/outcome`,
          post({ outcome: beat.outcome }),
        );
        await response.json();
        const words = {
          popup_closed: 'the person pressed Connect Gmail, then closed the Google window without connecting',
          popup_blocked: 'the browser blocked the Google window',
          access_denied: 'the person pressed Connect Gmail, then chose Deny on the Google screen',
        };
        this.#say('event', 'system', words[beat.outcome]);
        await this.#collect();
        await this.#afterAgentTurn();
        return;
      }
      case 'wait': {
        this.#clock.ms += beat.minutes * 60_000;
        const hours = Math.round(beat.minutes / 60);
        this.#say('event', 'system', hours >= 1 ? `${hours} hours pass` : `${beat.minutes} minutes pass`);
        return;
      }
    }
  }
}
