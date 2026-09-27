import type { VoiceSettings } from '../api/types.ts';

export const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
export const KEEP_ALIVE_MS = 8000;
export const OPEN_TIMEOUT_MS = 10000;
export const SETTINGS_FALLBACK_MS = 1500;
export const MAX_QUEUED_FRAMES = 200;

export type AgentMessageBehavior = 'default' | 'queue' | 'interrupt';
export type CloseCause = 'client' | 'remote';

export interface ServerMessage {
  type: string;
  role?: string;
  content?: string;
  code?: string;
  description?: string;
  [key: string]: unknown;
}

export interface VoiceSocketHandlers {
  onReady: () => void;
  onAudio: (chunk: ArrayBuffer) => void;
  onMessage: (message: ServerMessage) => void;
  onClose: (cause: CloseCause, detail: string) => void;
}

export interface SocketLike {
  binaryType: string;
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send: (data: string | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
}

export type SocketFactory = (url: string, protocols: string[]) => SocketLike;

export interface VoiceSocketOptions {
  token: string;
  settings: VoiceSettings;
  handlers: VoiceSocketHandlers;
  url?: string;
  keepAliveMs?: number;
  openTimeoutMs?: number;
  createSocket?: SocketFactory;
}

const OPEN = 1;

function isServerMessage(value: unknown): value is ServerMessage {
  return typeof value === 'object' && value !== null && typeof (value as ServerMessage).type === 'string';
}

export class VoiceSocket {
  readonly #options: VoiceSocketOptions;
  #socket: SocketLike | null = null;
  #ready = false;
  #closed = false;
  #settingsSent = false;
  #queue: ArrayBuffer[] = [];
  #keepAlive: ReturnType<typeof setInterval> | null = null;
  #openTimer: ReturnType<typeof setTimeout> | null = null;
  #settingsTimer: ReturnType<typeof setTimeout> | null = null;
  #lastError: string | null = null;

  constructor(options: VoiceSocketOptions) {
    this.#options = options;
  }

  get ready(): boolean {
    return this.#ready && !this.#closed;
  }

  get closed(): boolean {
    return this.#closed;
  }

  connect(): void {
    if (this.#socket !== null || this.#closed) {
      return;
    }
    const factory: SocketFactory =
      this.#options.createSocket ?? ((url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike);
    let socket: SocketLike;
    try {
      socket = factory(this.#options.url ?? DEEPGRAM_AGENT_URL, ['bearer', this.#options.token]);
    } catch (error) {
      this.#finish('remote', error instanceof Error ? error.message : 'could not open the connection');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.#socket = socket;
    this.#openTimer = setTimeout(
      () => this.#fail('the connection took too long to open'),
      this.#options.openTimeoutMs ?? OPEN_TIMEOUT_MS,
    );

    socket.onopen = () => {
      this.#settingsTimer = setTimeout(() => this.#sendSettings(), SETTINGS_FALLBACK_MS);
    };
    socket.onmessage = (event) => this.#receive(event.data);
    socket.onerror = () => {
      this.#lastError = this.#lastError ?? 'connection error';
    };
    socket.onclose = (event) => {
      const reason = typeof event.reason === 'string' && event.reason.length > 0 ? event.reason : null;
      const detail = this.#lastError ?? reason ?? `closed with code ${event.code ?? 'unknown'}`;
      this.#finish('remote', detail);
    };
  }

  sendAudio(data: ArrayBuffer): void {
    if (this.#closed) {
      return;
    }
    if (!this.#ready) {
      this.#queue.push(data);
      if (this.#queue.length > MAX_QUEUED_FRAMES) {
        this.#queue.shift();
      }
      return;
    }
    this.#write(data);
  }

  injectUserMessage(content: string): boolean {
    return this.#writeJson({ type: 'InjectUserMessage', content });
  }

  injectAgentMessage(message: string, behavior: AgentMessageBehavior = 'queue'): boolean {
    return this.#writeJson({ type: 'InjectAgentMessage', behavior, message });
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    const socket = this.#socket;
    this.#finish('client', 'closed by the client');
    try {
      socket?.close(1000, 'client closed');
    } catch {
      return;
    }
  }

  #fail(detail: string): void {
    if (this.#closed) {
      return;
    }
    const socket = this.#socket;
    this.#finish('remote', detail);
    try {
      socket?.close();
    } catch {
      return;
    }
  }

  #sendSettings(): void {
    if (this.#settingsSent || this.#closed) {
      return;
    }
    this.#settingsSent = true;
    if (this.#settingsTimer !== null) {
      clearTimeout(this.#settingsTimer);
      this.#settingsTimer = null;
    }
    this.#write(JSON.stringify(this.#options.settings));
  }

  #receive(data: unknown): void {
    if (this.#closed) {
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.#options.handlers.onAudio(data);
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const view = data;
      const copy = new Uint8Array(view.byteLength);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      this.#options.handlers.onAudio(copy.buffer);
      return;
    }
    if (typeof data !== 'string') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (!isServerMessage(parsed)) {
      return;
    }
    if (parsed.type === 'Welcome') {
      this.#sendSettings();
    } else if (parsed.type === 'SettingsApplied') {
      this.#becomeReady();
    } else if (parsed.type === 'Error') {
      const code = typeof parsed.code === 'string' ? parsed.code : 'error';
      const description = typeof parsed.description === 'string' ? parsed.description : '';
      this.#lastError = description.length > 0 ? `${code}: ${description}` : code;
    }
    this.#options.handlers.onMessage(parsed);
  }

  #becomeReady(): void {
    if (this.#ready || this.#closed) {
      return;
    }
    this.#ready = true;
    if (this.#openTimer !== null) {
      clearTimeout(this.#openTimer);
      this.#openTimer = null;
    }
    const queued = this.#queue;
    this.#queue = [];
    for (const frame of queued) {
      this.#write(frame);
    }
    this.#keepAlive = setInterval(
      () => this.#writeJson({ type: 'KeepAlive' }),
      this.#options.keepAliveMs ?? KEEP_ALIVE_MS,
    );
    this.#options.handlers.onReady();
  }

  #writeJson(message: Record<string, unknown>): boolean {
    if (!this.#ready || this.#closed) {
      return false;
    }
    return this.#write(JSON.stringify(message));
  }

  #write(data: string | ArrayBuffer): boolean {
    const socket = this.#socket;
    if (socket === null || socket.readyState !== OPEN) {
      return false;
    }
    try {
      socket.send(data);
      return true;
    } catch {
      return false;
    }
  }

  #finish(cause: CloseCause, detail: string): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#ready = false;
    this.#queue = [];
    if (this.#keepAlive !== null) {
      clearInterval(this.#keepAlive);
      this.#keepAlive = null;
    }
    if (this.#openTimer !== null) {
      clearTimeout(this.#openTimer);
      this.#openTimer = null;
    }
    if (this.#settingsTimer !== null) {
      clearTimeout(this.#settingsTimer);
      this.#settingsTimer = null;
    }
    const socket = this.#socket;
    if (socket !== null) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    this.#socket = null;
    this.#options.handlers.onClose(cause, detail);
  }
}

export function audioRates(settings: VoiceSettings): { input: number; output: number; playable: boolean } {
  const input = settings.audio?.input?.sample_rate;
  const output = settings.audio?.output?.sample_rate;
  const encoding = settings.audio?.output?.encoding;
  return {
    input: typeof input === 'number' && input > 0 ? input : 16000,
    output: typeof output === 'number' && output > 0 ? output : 24000,
    playable: encoding === undefined || encoding === 'linear16',
  };
}
