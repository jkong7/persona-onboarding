export interface SpokenLimitOptions {
  lead: number;
  max: number;
  bridge: string | null;
}

export interface SpokenResult {
  spoken: string;
  overflow: string;
}

export const THREAD_BRIDGE = 'The rest is in the thread.';
export const DEFAULT_SPOKEN_LIMIT: SpokenLimitOptions = { lead: 2, max: 3, bridge: null };

const BOUNDARY = /[.!?]+["')\]]*\s+/;

function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let rest = text;
  for (;;) {
    const match = BOUNDARY.exec(rest);
    if (match === null) {
      break;
    }
    const end = match.index + match[0].length;
    sentences.push(rest.slice(0, end).trim());
    rest = rest.slice(end);
  }
  if (rest.trim().length > 0) {
    sentences.push(rest.trim());
  }
  return sentences.filter(hasWords);
}

export class SpokenLimiter {
  readonly #emit: (text: string) => void;
  readonly #options: SpokenLimitOptions;
  #emitted = '';
  #current = '';
  #complete = 0;
  #held = '';
  #overflow: string[] = [];

  constructor(emit: (text: string) => void, options: Partial<SpokenLimitOptions> = {}) {
    this.#emit = emit;
    this.#options = { ...DEFAULT_SPOKEN_LIMIT, ...options };
  }

  #send(text: string): void {
    if (text.length === 0) {
      return;
    }
    this.#emitted += text;
    this.#emit(text);
  }

  #say(sentence: string): void {
    const lead = this.#emitted.length > 0 && !/\s$/.test(this.#emitted) ? ' ' : '';
    this.#send(`${lead}${flatten(sentence)}`);
  }

  #holding(): boolean {
    return this.#complete >= this.#options.lead;
  }

  #endSegment(): void {
    const said = this.#complete + (hasWords(this.#current) ? 1 : 0);
    const rest = splitSentences(this.#held);
    this.#held = '';
    this.#current = '';
    this.#complete = 0;
    const allowance = this.#options.max + (this.#options.bridge === null ? 0 : 1);
    if (said + rest.length <= allowance) {
      for (const sentence of rest) {
        this.#say(sentence);
      }
      return;
    }
    const last = rest.at(-1) ?? '';
    const closing = /\?["')\]]*$/.test(last) ? last : null;
    const moved = closing === null ? rest : rest.slice(0, -1);
    if (moved.length === 0) {
      if (closing !== null) {
        this.#say(closing);
      }
      return;
    }
    this.#overflow.push(...moved.map(flatten));
    if (this.#options.bridge !== null) {
      this.#say(this.#options.bridge);
    }
    if (closing !== null) {
      this.#say(closing);
    }
  }

  push(delta: string): void {
    let incoming = delta;
    while (incoming.length > 0) {
      if (this.#holding()) {
        this.#held += incoming;
        return;
      }
      const combined = this.#current + incoming;
      const match = BOUNDARY.exec(combined);
      if (match === null) {
        this.#send(incoming);
        this.#current = combined;
        return;
      }
      const end = match.index + match[0].length;
      const fresh = combined.slice(this.#current.length, end);
      const sentence = combined.slice(0, end);
      this.#send(fresh);
      if (hasWords(sentence)) {
        this.#complete += 1;
      }
      this.#current = '';
      incoming = combined.slice(end);
    }
  }

  breakBetweenReplies(): void {
    this.#endSegment();
    if (this.#emitted.length > 0 && !/\s$/.test(this.#emitted)) {
      this.#send(' ');
    }
  }

  spokenSoFar(): string {
    return flatten(this.#emitted);
  }

  finish(): SpokenResult {
    this.#endSegment();
    return { spoken: this.spokenSoFar(), overflow: this.#overflow.join(' ') };
  }
}
