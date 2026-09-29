import { readFileSync } from 'node:fs';

export interface VoiceSettingsInput {
  brainToken: string;
  greeting: string;
  keyterms: string[];
}

export interface GrantedToken {
  token: string;
  expiresIn: number;
}

export interface VoiceProvider {
  grantToken(): Promise<GrantedToken>;
  buildSettings(input: VoiceSettingsInput): Record<string, unknown>;
  reachable?(): Promise<boolean>;
}

export interface DeepgramConfig {
  apiKey: string;
  publicUrl: string;
  publicUrlFile: string | null;
  listenModel: string;
  speakModel: string;
  speakVersion: string | null;
  speakSpeed: number | null;
  endOfTurnThreshold: number;
  eagerEndOfTurnThreshold: number | null;
  endOfTurnTimeoutMs: number;
  inputSampleRate: number;
  outputSampleRate: number;
  tokenTtlSeconds: number;
}

export type VoiceUnavailable = 'missing_deepgram_key' | 'missing_public_url';

const REACHABLE_FOR_MS = 20_000;
const HEALTH_PATH = '/api/health';

export function cleanPublicUrl(value: string | undefined): string | null {
  const url = (value?.trim() ?? '').replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+/.test(url) ? url : null;
}

export type DeepgramConfigResult =
  | { ok: true; config: DeepgramConfig }
  | { ok: false; reason: VoiceUnavailable };

export const BRAIN_PATH = '/api/voice/chat/completions';
export const BRAIN_MODEL = 'persona-brain';
const GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const MAX_KEYTERMS = 20;

function numberFrom(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function deepgramConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeepgramConfigResult {
  const apiKey = env['DEEPGRAM_API_KEY']?.trim() ?? '';
  if (apiKey.length === 0) {
    return { ok: false, reason: 'missing_deepgram_key' };
  }
  const publicUrlFile = env['PUBLIC_URL_FILE']?.trim() || null;
  const fixedUrl = cleanPublicUrl(env['PUBLIC_URL']);
  if (fixedUrl === null && publicUrlFile === null) {
    return { ok: false, reason: 'missing_public_url' };
  }
  const publicUrl = fixedUrl ?? '';
  const speakModel = env['DEEPGRAM_SPEAK_MODEL']?.trim() || 'flux-kit-en';
  const speakVersion = env['DEEPGRAM_SPEAK_VERSION']?.trim() || (speakModel.startsWith('flux') ? 'v2' : '');
  return {
    ok: true,
    config: {
      apiKey,
      publicUrl,
      publicUrlFile: fixedUrl === null ? publicUrlFile : null,
      listenModel: env['DEEPGRAM_LISTEN_MODEL']?.trim() || 'flux-general-en',
      speakModel,
      speakVersion: speakVersion.length > 0 ? speakVersion : null,
      speakSpeed: env['DEEPGRAM_SPEAK_SPEED'] === undefined ? null : numberFrom(env['DEEPGRAM_SPEAK_SPEED'], 1, 0.7, 1.5),
      endOfTurnThreshold: numberFrom(env['DEEPGRAM_EOT_THRESHOLD'], 0.7, 0.5, 1),
      eagerEndOfTurnThreshold:
        env['DEEPGRAM_EAGER_EOT_THRESHOLD']?.trim()
          ? numberFrom(env['DEEPGRAM_EAGER_EOT_THRESHOLD'], 0.5, 0.3, 0.9)
          : null,
      endOfTurnTimeoutMs: numberFrom(env['DEEPGRAM_EOT_TIMEOUT_MS'], 5000, 500, 20000),
      inputSampleRate: numberFrom(env['VOICE_INPUT_SAMPLE_RATE'], 16000, 8000, 48000),
      outputSampleRate: numberFrom(env['VOICE_OUTPUT_SAMPLE_RATE'], 24000, 8000, 48000),
      tokenTtlSeconds: numberFrom(env['DEEPGRAM_TOKEN_TTL_SECONDS'], 120, 30, 3600),
    },
  };
}

export function readPublicUrl(file: string): string | null {
  try {
    return cleanPublicUrl(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function cleanKeyterms(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = value.replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = term.toLowerCase();
    if (term.length > 1 && !seen.has(key)) {
      seen.add(key);
      terms.push(term);
    }
  }
  return terms.slice(0, MAX_KEYTERMS);
}

export class DeepgramVoice implements VoiceProvider {
  readonly #config: DeepgramConfig;
  readonly #fetch: typeof fetch;

  #checkedAt = 0;
  #checkedUrl = '';
  #wasReachable = false;

  constructor(config: DeepgramConfig, fetchImpl: typeof fetch = fetch) {
    this.#config = config;
    this.#fetch = fetchImpl;
  }

  publicUrl(): string {
    const file = this.#config.publicUrlFile;
    return (file === null ? null : readPublicUrl(file)) ?? this.#config.publicUrl;
  }

  async reachable(): Promise<boolean> {
    const url = this.publicUrl();
    if (url.length === 0) {
      return false;
    }
    const now = Date.now();
    if (url === this.#checkedUrl && this.#wasReachable && now - this.#checkedAt < REACHABLE_FOR_MS) {
      return true;
    }
    let ok = false;
    try {
      const response = await this.#fetch(`${url}${HEALTH_PATH}`, { signal: AbortSignal.timeout(4000) });
      ok = response.ok;
    } catch {
      ok = false;
    }
    this.#checkedAt = now;
    this.#checkedUrl = url;
    this.#wasReachable = ok;
    return ok;
  }

  async grantToken(): Promise<GrantedToken> {
    const response = await this.#fetch(GRANT_URL, {
      method: 'POST',
      headers: { authorization: `Token ${this.#config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: this.#config.tokenTtlSeconds }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      throw new Error(`deepgram token grant failed with status ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error('deepgram token grant returned no token');
    }
    return {
      token: body.access_token,
      expiresIn: typeof body.expires_in === 'number' ? body.expires_in : this.#config.tokenTtlSeconds,
    };
  }

  buildSettings(input: VoiceSettingsInput): Record<string, unknown> {
    const config = this.#config;
    const flux = config.listenModel.startsWith('flux');
    const keyterms = cleanKeyterms(input.keyterms);
    return {
      type: 'Settings',
      audio: {
        input: { encoding: 'linear16', sample_rate: config.inputSampleRate },
        output: { encoding: 'linear16', sample_rate: config.outputSampleRate, container: 'none' },
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: config.listenModel,
            ...(flux
              ? {
                  version: 'v2',
                  eot_threshold: config.endOfTurnThreshold,
                  ...(config.eagerEndOfTurnThreshold === null
                    ? {}
                    : { eager_eot_threshold: Math.min(config.eagerEndOfTurnThreshold, config.endOfTurnThreshold) }),
                  eot_timeout_ms: config.endOfTurnTimeoutMs,
                }
              : {}),
            ...(keyterms.length > 0 ? { keyterms } : {}),
          },
        },
        think: {
          provider: { type: 'open_ai', model: BRAIN_MODEL },
          endpoint: {
            url: `${this.publicUrl()}${BRAIN_PATH}`,
            headers: { authorization: `Bearer ${input.brainToken}` },
          },
          prompt: 'Replies are produced by the endpoint.',
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: config.speakModel,
            ...(config.speakVersion === null ? {} : { version: config.speakVersion }),
            ...(config.speakSpeed === null ? {} : { speed: config.speakSpeed }),
          },
        },
        greeting: input.greeting,
      },
    };
  }
}
