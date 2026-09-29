import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const SPEAK_URL = 'https://api.deepgram.com/v1/speak';
const FRAME_MS = 20;
const SILENCE_AFTER_MS = 10_000;
const KEEP_ALIVE_MS = 8000;
const CACHE_DIR = join('eval-results', 'voice-cache');

export interface CallerOptions {
  baseUrl: string;
  deepgramKey: string;
  voice: string;
  noise: number;
  log: (line: string) => void;
}

export interface TimelineEntry {
  at: number;
  kind:
    | 'said'
    | 'heard_as'
    | 'agent'
    | 'event'
    | 'latency'
    | 'barge_in'
    | 'hangup'
    | 'server'
    | 'typed'
    | 'error';
  text: string;
  ms?: number;
}

interface StartResponse {
  callId: string;
  token: string;
  greeting: string;
  settings: {
    audio: { input: { sample_rate: number }; output: { sample_rate: number } };
    [key: string]: unknown;
  };
}

interface Reply {
  text: string;
  spoken?: boolean;
}

export interface Snapshot {
  id: string;
  phase: string;
  state: { text: string };
  transcript: { seq: number; role: string; channel: string; text: string; fullText: string; interrupted: boolean }[];
  interface: {
    gmailButtonShown: boolean;
    gmailConnected: boolean;
    gmailMode: string | null;
    ringing: boolean;
    activeCallId: string | null;
    hangupRequested: boolean;
    mayOfferCall: boolean;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Caller {
  readonly timeline: TimelineEntry[] = [];
  readonly latencies: number[] = [];
  readonly #options: CallerOptions;
  readonly #startedAt = performance.now();
  #id = '';
  #call: StartResponse | null = null;
  #socket: WebSocket | null = null;
  #ready = false;
  #speech: Buffer = Buffer.alloc(0);
  #pump: ReturnType<typeof setInterval> | null = null;
  #keepAlive: ReturnType<typeof setInterval> | null = null;
  #inputRate = 16000;
  #outputRate = 24000;
  #speechEndedAt: number | null = null;
  #awaitingReply = false;
  #playbackEndsAt = 0;
  #utteranceStartedAt = 0;
  #utteranceSeconds = 0;
  #audioDone = true;
  #lastSoundAt = performance.now();
  #silencePending = false;
  #silenceWatch = true;
  #agentLines = 0;
  #closedByUs = false;
  #pumpedAt = 0;

  constructor(options: CallerOptions) {
    this.#options = options;
  }

  get onboardingId(): string {
    return this.#id;
  }

  get inCall(): boolean {
    return this.#socket !== null && this.#ready;
  }

  get agentLineCount(): number {
    return this.#agentLines;
  }

  #now(): number {
    return Math.round(performance.now() - this.#startedAt);
  }

  #note(kind: TimelineEntry['kind'], text: string, ms?: number): void {
    const entry: TimelineEntry = { at: this.#now(), kind, text, ...(ms === undefined ? {} : { ms }) };
    this.timeline.push(entry);
    const stamp = (entry.at / 1000).toFixed(1).padStart(6);
    this.#options.log(`${stamp}s ${kind.padEnd(9)} ${text}${ms === undefined ? '' : ` (${ms} ms)`}`);
  }

  async #post<T>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const response = await fetch(`${this.#options.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as T };
  }

  async snapshot(): Promise<Snapshot> {
    const response = await fetch(`${this.#options.baseUrl}/api/onboardings/${this.#id}`);
    return (await response.json()) as Snapshot;
  }

  async create(): Promise<void> {
    const created = await this.#post<Snapshot>('/api/onboardings');
    this.#id = created.body.id;
    const opened = await this.#post<{ reply: Reply | null }>(`/api/onboardings/${this.#id}/open`);
    if (opened.body.reply !== null) {
      this.#note('agent', `[text] ${opened.body.reply.text}`);
    }
  }

  async reopen(): Promise<void> {
    const opened = await this.#post<{ opened: string; reply: Reply | null }>(`/api/onboardings/${this.#id}/open`);
    this.#note('event', `thread reopened (${opened.body.opened})`);
    if (opened.body.reply !== null) {
      this.#note('agent', `[text] ${opened.body.reply.text}`);
    }
  }

  async text(message: string): Promise<string> {
    this.#note('typed', message);
    const started = performance.now();
    const response = await fetch(`${this.#options.baseUrl}/api/onboardings/${this.#id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    const raw = await response.text();
    let reply = '';
    for (const block of raw.split('\n\n')) {
      if (block.startsWith('event: done')) {
        const data = block.split('\n')[1]?.slice('data: '.length) ?? '{}';
        reply = (JSON.parse(data) as { text?: string }).text ?? '';
      }
    }
    this.#note('agent', `[text] ${reply}`, Math.round(performance.now() - started));
    return reply;
  }

  async decline(): Promise<void> {
    const response = await this.#post<{ declined: boolean; reply: Reply | null }>(
      `/api/onboardings/${this.#id}/call/decline`,
    );
    this.#note('event', `declined the call (${String(response.body.declined)})`);
    if (response.body.reply !== null) {
      this.#note('agent', `[text] ${response.body.reply.text}`);
    }
  }

  async pressSample(): Promise<void> {
    const response = await this.#post<{ applied: boolean; reply: Reply | null }>(
      `/api/onboardings/${this.#id}/gmail/sample`,
    );
    this.#note('event', `pressed Use sample inbox (${String(response.body.applied)})`);
    await this.#deliver(response.body.reply);
  }

  async gmailOutcome(outcome: 'popup_closed' | 'popup_blocked' | 'access_denied'): Promise<void> {
    const response = await this.#post<{ applied: boolean; reply: Reply | null }>(
      `/api/onboardings/${this.#id}/gmail/outcome`,
      { outcome },
    );
    this.#note('event', `Google window: ${outcome}`);
    await this.#deliver(response.body.reply);
  }

  async #deliver(reply: Reply | null): Promise<void> {
    if (reply === null || reply.text.trim().length === 0) {
      return;
    }
    if (reply.spoken === true && this.#socket !== null && this.#ready) {
      this.#awaitingReply = true;
      this.#speechEndedAt = performance.now();
      this.#socket.send(JSON.stringify({ type: 'InjectAgentMessage', behavior: 'queue', message: reply.text }));
      this.#note('server', `asked the call to speak: ${reply.text}`);
      await this.waitForReply(20_000);
      return;
    }
    this.#note('agent', `[text] ${reply.text}`);
  }

  async #synthesize(text: string): Promise<Buffer> {
    mkdirSync(CACHE_DIR, { recursive: true });
    const key = createHash('sha1').update(`${this.#options.voice}|${this.#inputRate}|${text}`).digest('hex');
    const file = join(CACHE_DIR, `${key}.pcm`);
    if (existsSync(file)) {
      return readFileSync(file);
    }
    const url = `${SPEAK_URL}?model=${this.#options.voice}&encoding=linear16&sample_rate=${this.#inputRate}&container=none`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Token ${this.#options.deepgramKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(`speech synthesis failed with status ${response.status}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, audio);
    return audio;
  }

  #frameBytes(): number {
    return Math.round((this.#inputRate * FRAME_MS) / 1000) * 2;
  }

  #silenceFrame(): Buffer {
    const frame = Buffer.alloc(this.#frameBytes());
    if (this.#options.noise > 0) {
      for (let offset = 0; offset < frame.length; offset += 2) {
        frame.writeInt16LE(Math.round((Math.random() * 2 - 1) * this.#options.noise), offset);
      }
    }
    return frame;
  }

  #pumpOnce(): void {
    const socket = this.#socket;
    if (socket === null || !this.#ready || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const now = performance.now();
    if (this.#pumpedAt === 0) {
      this.#pumpedAt = now;
    }
    const size = this.#frameBytes();
    let sent = 0;
    while (this.#pumpedAt <= now && sent < 10) {
      this.#pumpedAt += FRAME_MS;
      sent += 1;
      if (this.#speech.length > 0) {
        const frame = Buffer.alloc(size);
        this.#speech.copy(frame, 0, 0, Math.min(size, this.#speech.length));
        this.#speech = this.#speech.subarray(Math.min(size, this.#speech.length));
        socket.send(frame);
        this.#lastSoundAt = now;
        if (this.#speech.length === 0) {
          this.#speechEndedAt = performance.now();
          this.#awaitingReply = true;
        }
      } else {
        socket.send(this.#silenceFrame());
      }
    }
    if (this.#pumpedAt < now - 500) {
      this.#pumpedAt = now;
    }
    this.#watchSilence(now);
  }

  #watchSilence(now: number): void {
    if (!this.#silenceWatch || this.#silencePending || this.#call === null) {
      return;
    }
    if (now < this.#playbackEndsAt || this.#speech.length > 0 || this.#awaitingReply) {
      this.#lastSoundAt = now;
      return;
    }
    if (now - this.#lastSoundAt < SILENCE_AFTER_MS) {
      return;
    }
    this.#silencePending = true;
    const callId = this.#call.callId;
    this.#note('event', 'ten seconds of silence, telling the server');
    void this.#post<{ ended: boolean; reply: Reply | null }>(`/api/onboardings/${this.#id}/call/silence`, { callId })
      .then(async (response) => {
        if (response.body.ended) {
          this.#note('server', 'the server ended the call after the silence');
          if (response.body.reply !== null) {
            this.#note('agent', `[text] ${response.body.reply.text}`);
          }
          this.#close();
          return;
        }
        if (response.body.reply === null) {
          this.#note('server', 'the agent chose to wait quietly');
          return;
        }
        if (this.#socket !== null && this.#ready) {
          this.#socket.send(
            JSON.stringify({ type: 'InjectAgentMessage', behavior: 'queue', message: response.body.reply.text }),
          );
          this.#note('server', `asked the call to speak: ${response.body.reply.text}`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.#lastSoundAt = performance.now();
        this.#silencePending = false;
      });
  }

  #onAudio(bytes: number): void {
    const now = performance.now();
    const seconds = bytes / (this.#outputRate * 2);
    if (this.#awaitingReply && this.#speechEndedAt !== null) {
      const latency = Math.round(now - this.#speechEndedAt);
      this.latencies.push(latency);
      this.#note('latency', 'first reply audio', latency);
      this.#awaitingReply = false;
    }
    if (this.#audioDone || now > this.#playbackEndsAt + 1500) {
      this.#audioDone = false;
      this.#utteranceStartedAt = Math.max(now, this.#playbackEndsAt);
      this.#utteranceSeconds = 0;
    }
    this.#utteranceSeconds += seconds;
    this.#playbackEndsAt = Math.max(now, this.#playbackEndsAt) + seconds * 1000;
    this.#lastSoundAt = now;
  }

  #onMessage(message: Record<string, unknown>): void {
    const type = String(message['type']);
    if (type === 'Welcome') {
      this.#socket?.send(JSON.stringify(this.#call?.settings));
      return;
    }
    if (type === 'SettingsApplied') {
      this.#ready = true;
      this.#note('event', 'call connected');
      return;
    }
    if (type === 'ConversationText') {
      const role = String(message['role']);
      const content = String(message['content']);
      if (role === 'user') {
        this.#note('heard_as', content);
      } else {
        this.#agentLines += 1;
        this.#note('agent', content);
      }
      return;
    }
    if (type === 'UserStartedSpeaking') {
      const now = performance.now();
      if (now < this.#playbackEndsAt && this.#call !== null) {
        const played = Math.max(0, (now - this.#utteranceStartedAt) / 1000);
        const fraction = this.#utteranceSeconds <= 0 ? 0 : Math.min(1, played / this.#utteranceSeconds);
        this.#note('barge_in', `cut the agent off after ${played.toFixed(1)}s of ${this.#utteranceSeconds.toFixed(1)}s`);
        this.#playbackEndsAt = now;
        this.#audioDone = true;
        void this.#post(`/api/onboardings/${this.#id}/call/heard`, {
          callId: this.#call.callId,
          playedFraction: fraction,
        }).catch(() => undefined);
      }
      return;
    }
    if (type === 'AgentAudioDone') {
      this.#audioDone = true;
      return;
    }
    if (type === 'LatencyReport') {
      if (typeof message['total_latency'] === 'number') {
        this.#note('event', `voice service measured ${Math.round(message['total_latency'] * 1000)} ms in total`);
      }
      return;
    }
    if (type === 'Error' || type === 'Warning' || type === 'InjectionRefused') {
      this.#note('error', JSON.stringify(message));
    }
  }

  async accept(): Promise<boolean> {
    const started = await this.#post<StartResponse | { error: string; reason: string }>(
      `/api/onboardings/${this.#id}/call/start`,
    );
    if (started.status !== 200 || !('callId' in started.body)) {
      this.#note('error', `the call could not start: ${JSON.stringify(started.body)}`);
      return false;
    }
    this.#call = started.body;
    this.#inputRate = started.body.settings.audio.input.sample_rate;
    this.#outputRate = started.body.settings.audio.output.sample_rate;
    this.#closedByUs = false;
    this.#ready = false;
    this.#pumpedAt = 0;
    this.#speech = Buffer.alloc(0);
    this.#awaitingReply = true;
    this.#speechEndedAt = performance.now();
    this.#note('event', 'answered the call');

    const socket = new WebSocket(AGENT_URL, ['bearer', started.body.token]);
    socket.binaryType = 'arraybuffer';
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.#onMessage(JSON.parse(event.data) as Record<string, unknown>);
      } else {
        this.#onAudio((event.data as ArrayBuffer).byteLength);
      }
    });
    socket.addEventListener('close', (event) => {
      if (!this.#closedByUs) {
        this.#note('error', `the voice service closed the call: ${event.code} ${event.reason}`);
      }
      this.#stopTimers();
      this.#ready = false;
    });
    this.#pump = setInterval(() => this.#pumpOnce(), FRAME_MS / 2);
    this.#keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, KEEP_ALIVE_MS);

    const deadline = performance.now() + 10_000;
    while (!this.#ready && performance.now() < deadline) {
      await sleep(50);
    }
    return this.#ready;
  }

  async waitForReply(timeoutMs = 60_000): Promise<void> {
    const deadline = performance.now() + timeoutMs;
    const linesBefore = this.#agentLines;
    while (performance.now() < deadline) {
      await sleep(100);
      if (this.#socket === null || !this.#ready) {
        return;
      }
      const spoke = this.#agentLines > linesBefore || !this.#awaitingReply;
      if (spoke && this.#audioDone && performance.now() > this.#playbackEndsAt + 400) {
        return;
      }
      if (!spoke && performance.now() > deadline - timeoutMs + 20_000) {
        break;
      }
    }
    this.#awaitingReply = false;
    this.#note('event', 'no spoken reply arrived in time');
  }

  async waitForSpeaking(timeoutMs = 20_000): Promise<boolean> {
    const deadline = performance.now() + timeoutMs;
    const before = this.#playbackEndsAt;
    while (performance.now() < deadline) {
      await sleep(50);
      if (this.#playbackEndsAt > before && performance.now() < this.#playbackEndsAt) {
        return true;
      }
    }
    return false;
  }

  async say(text: string, options: { wait?: boolean } = {}): Promise<void> {
    if (this.#socket === null || !this.#ready) {
      this.#note('error', `could not say "${text}" because no call is connected`);
      return;
    }
    const audio = await this.#synthesize(text);
    this.#note('said', text);
    this.#speech = Buffer.concat([this.#speech, audio]);
    while (this.#speech.length > 0 && this.#ready) {
      await sleep(40);
    }
    if (options.wait !== false) {
      await this.waitForReply();
    }
  }

  async interrupt(text: string, afterMs: number): Promise<void> {
    const speaking = await this.waitForSpeaking();
    if (!speaking) {
      this.#note('event', 'the agent never started speaking, so there was nothing to interrupt');
    }
    await sleep(afterMs);
    await this.say(text);
  }

  async sayAndHangUp(text: string, fraction: number, reason: 'user_hangup' | 'tab_closed' | 'network_drop'): Promise<void> {
    const audio = await this.#synthesize(text);
    this.#note('said', `${text} [hanging up ${Math.round(fraction * 100)}% of the way through]`);
    const cut = Math.floor((audio.length * fraction) / 2) * 2;
    this.#speech = Buffer.concat([this.#speech, audio.subarray(0, cut)]);
    while (this.#speech.length > 0 && this.#ready) {
      await sleep(40);
    }
    await this.hangUp(reason);
  }

  async quiet(ms: number): Promise<void> {
    this.#note('event', `staying quiet for ${Math.round(ms / 1000)}s`);
    const deadline = performance.now() + ms;
    while (performance.now() < deadline && this.#socket !== null) {
      await sleep(100);
    }
  }

  async typeInCall(text: string): Promise<void> {
    if (this.#call === null || this.#socket === null) {
      return;
    }
    await this.#post(`/api/onboardings/${this.#id}/call/typed`, { callId: this.#call.callId, text });
    this.#note('typed', `${text} [during the call]`);
    this.#awaitingReply = true;
    this.#speechEndedAt = performance.now();
    this.#socket.send(JSON.stringify({ type: 'InjectUserMessage', content: text }));
    await this.waitForReply();
  }

  setSilenceWatch(on: boolean): void {
    this.#silenceWatch = on;
  }

  #stopTimers(): void {
    if (this.#pump !== null) {
      clearInterval(this.#pump);
      this.#pump = null;
    }
    if (this.#keepAlive !== null) {
      clearInterval(this.#keepAlive);
      this.#keepAlive = null;
    }
  }

  #close(): void {
    this.#closedByUs = true;
    this.#stopTimers();
    try {
      this.#socket?.close();
    } catch {
      this.#socket = null;
    }
    this.#socket = null;
    this.#ready = false;
    this.#call = null;
  }

  async hangUp(reason: 'user_hangup' | 'tab_closed' | 'network_drop' | 'agent_ended' = 'user_hangup'): Promise<void> {
    const call = this.#call;
    if (call === null) {
      return;
    }
    this.#close();
    this.#note('hangup', reason);
    const response = await this.#post<{ ended: boolean; reply: Reply | null }>(
      `/api/onboardings/${this.#id}/call/end`,
      { callId: call.callId, reason },
    );
    if (response.body.reply !== null) {
      this.#note('agent', `[text] ${response.body.reply.text}`);
    }
  }

  async followAgentHangup(): Promise<boolean> {
    if (this.#call === null) {
      return false;
    }
    const snapshot = await this.snapshot();
    if (snapshot.interface.activeCallId !== null && !snapshot.interface.hangupRequested) {
      return false;
    }
    await sleep(Math.max(0, this.#playbackEndsAt - performance.now()) + 300);
    this.#note('event', 'the agent ended the call');
    await this.hangUp('agent_ended');
    return true;
  }
}
