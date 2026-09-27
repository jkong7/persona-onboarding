import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceSettings } from '../api/types.ts';
import { audioRates, VoiceSocket, type CloseCause, type ServerMessage, type SocketLike } from './voiceSocket.ts';

class FakeSocket implements SocketLike {
  binaryType = 'blob';
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  closedWith: number | undefined;

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code ?? 1005;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  receiveAudio(bytes: number): void {
    this.onmessage?.({ data: new ArrayBuffer(bytes) });
  }

  drop(code = 1006, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  json(): Record<string, unknown>[] {
    return this.sent.filter((item): item is string => typeof item === 'string').map((item) => JSON.parse(item));
  }
}

const SETTINGS: VoiceSettings = {
  type: 'Settings',
  tags: ['onboarding'],
  mip_opt_out: true,
  flags: { history: true },
  audio: {
    input: { encoding: 'linear16', sample_rate: 16000 },
    output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
  },
  agent: {
    greeting: 'Hey, it is Max.',
    think: { endpoint: { url: 'https://example.test/brain', headers: { authorization: 'Bearer signed' } } },
  },
};

interface Harness {
  fake: FakeSocket;
  socket: VoiceSocket;
  ready: number;
  audio: ArrayBuffer[];
  messages: ServerMessage[];
  closes: [CloseCause, string][];
  opened: { url: string; protocols: string[] }[];
}

function harness(): Harness {
  const fake = new FakeSocket();
  const state: Harness = {
    fake,
    socket: null as unknown as VoiceSocket,
    ready: 0,
    audio: [],
    messages: [],
    closes: [],
    opened: [],
  };
  state.socket = new VoiceSocket({
    token: 'short-lived',
    settings: SETTINGS,
    createSocket: (url, protocols) => {
      state.opened.push({ url, protocols });
      return fake;
    },
    handlers: {
      onReady: () => {
        state.ready += 1;
      },
      onAudio: (chunk) => state.audio.push(chunk),
      onMessage: (message) => state.messages.push(message),
      onClose: (cause, detail) => state.closes.push([cause, detail]),
    },
  });
  return state;
}

function goLive(state: Harness): void {
  state.socket.connect();
  state.fake.open();
  state.fake.receive({ type: 'Welcome', request_id: 'r1' });
  state.fake.receive({ type: 'SettingsApplied' });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VoiceSocket', () => {
  it('authenticates with the short-lived token as a bearer protocol', () => {
    const state = harness();
    state.socket.connect();
    expect(state.opened).toEqual([
      { url: 'wss://agent.deepgram.com/v1/agent/converse', protocols: ['bearer', 'short-lived'] },
    ]);
    expect(state.fake.binaryType).toBe('arraybuffer');
  });

  it('sends the server settings unchanged, once, after the welcome', () => {
    const state = harness();
    state.socket.connect();
    state.fake.open();
    expect(state.fake.sent).toEqual([]);
    state.fake.receive({ type: 'Welcome' });
    state.fake.receive({ type: 'Welcome' });
    vi.advanceTimersByTime(5000);
    expect(state.fake.json()).toEqual([SETTINGS]);
  });

  it('sends the settings anyway if no welcome arrives', () => {
    const state = harness();
    state.socket.connect();
    state.fake.open();
    vi.advanceTimersByTime(1600);
    expect(state.fake.json()).toEqual([SETTINGS]);
  });

  it('holds microphone audio until the settings are applied, then sends it in order', () => {
    const state = harness();
    state.socket.connect();
    state.fake.open();
    state.fake.receive({ type: 'Welcome' });
    state.socket.sendAudio(new ArrayBuffer(10));
    state.socket.sendAudio(new ArrayBuffer(20));
    expect(state.fake.sent.filter((item) => item instanceof ArrayBuffer)).toHaveLength(0);
    state.fake.receive({ type: 'SettingsApplied' });
    expect(state.ready).toBe(1);
    const frames = state.fake.sent.filter((item): item is ArrayBuffer => item instanceof ArrayBuffer);
    expect(frames.map((item) => item.byteLength)).toEqual([10, 20]);
    state.socket.sendAudio(new ArrayBuffer(30));
    expect(state.fake.sent.at(-1)).toBeInstanceOf(ArrayBuffer);
  });

  it('passes agent audio and messages to the handlers', () => {
    const state = harness();
    goLive(state);
    state.fake.receiveAudio(480);
    state.fake.receive({ type: 'ConversationText', role: 'assistant', content: 'Hey' });
    state.fake.receive({ type: 'UserStartedSpeaking' });
    state.fake.receive('not json');
    expect(state.audio.map((chunk) => chunk.byteLength)).toEqual([480]);
    expect(state.messages.map((message) => message.type)).toEqual([
      'Welcome',
      'SettingsApplied',
      'ConversationText',
      'UserStartedSpeaking',
    ]);
  });

  it('sends a keep-alive every eight seconds once live', () => {
    const state = harness();
    goLive(state);
    vi.advanceTimersByTime(8000 * 3 + 10);
    expect(state.fake.json().filter((message) => message['type'] === 'KeepAlive')).toHaveLength(3);
  });

  it('injects typed text and spoken replies with the documented message shapes', () => {
    const state = harness();
    goLive(state);
    expect(state.socket.injectUserMessage('Jonathan')).toBe(true);
    expect(state.socket.injectAgentMessage('You are on the sample inbox.')).toBe(true);
    expect(state.fake.json().slice(-2)).toEqual([
      { type: 'InjectUserMessage', content: 'Jonathan' },
      { type: 'InjectAgentMessage', behavior: 'queue', message: 'You are on the sample inbox.' },
    ]);
  });

  it('refuses to inject before the call is live', () => {
    const state = harness();
    state.socket.connect();
    state.fake.open();
    expect(state.socket.injectUserMessage('too early')).toBe(false);
  });

  it('reports a drop as remote, once, with the server error when there is one', () => {
    const state = harness();
    goLive(state);
    state.fake.receive({ type: 'Error', code: 'CLIENT_MESSAGE_TIMEOUT', description: 'waited too long' });
    state.fake.drop(1011);
    state.fake.drop(1011);
    expect(state.closes).toEqual([['remote', 'CLIENT_MESSAGE_TIMEOUT: waited too long']]);
    expect(state.socket.closed).toBe(true);
  });

  it('reports a close the client asked for as its own, once', () => {
    const state = harness();
    goLive(state);
    state.socket.close();
    state.fake.drop(1000);
    state.socket.close();
    expect(state.closes).toEqual([['client', 'closed by the client']]);
    expect(state.fake.closedWith).toBe(1000);
  });

  it('stops sending after it has closed', () => {
    const state = harness();
    goLive(state);
    const before = state.fake.sent.length;
    state.socket.close();
    state.socket.sendAudio(new ArrayBuffer(8));
    vi.advanceTimersByTime(20000);
    expect(state.fake.sent).toHaveLength(before);
  });

  it('gives up when the connection never becomes ready', () => {
    const state = harness();
    state.socket.connect();
    vi.advanceTimersByTime(10001);
    expect(state.closes).toEqual([['remote', 'the connection took too long to open']]);
  });

  it('reports a failure to open at all', () => {
    const closes: [CloseCause, string][] = [];
    const socket = new VoiceSocket({
      token: 't',
      settings: SETTINGS,
      createSocket: () => {
        throw new Error('blocked');
      },
      handlers: {
        onReady: () => undefined,
        onAudio: () => undefined,
        onMessage: () => undefined,
        onClose: (cause, detail) => closes.push([cause, detail]),
      },
    });
    socket.connect();
    expect(closes).toEqual([['remote', 'blocked']]);
  });
});

describe('audioRates', () => {
  it('reads the sample rates from the server settings', () => {
    expect(audioRates(SETTINGS)).toEqual({ input: 16000, output: 24000, playable: true });
  });

  it('falls back to the documented defaults', () => {
    expect(audioRates({ type: 'Settings' })).toEqual({ input: 16000, output: 24000, playable: true });
  });

  it('flags an output format the player cannot decode', () => {
    expect(audioRates({ type: 'Settings', audio: { output: { encoding: 'mp3', sample_rate: 24000 } } }).playable).toBe(
      false,
    );
  });
});
