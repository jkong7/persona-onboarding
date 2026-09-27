const RANGE = /(\d)\s*[‒–—―]\s*(\d)/g;
const DASH = /\s*[‒–—―]+\s*/g;
const SPACED_HYPHENS = /\s+-{1,3}\s+/g;
const TAIL = /(?:\d\s*[\u2012\u2013\u2014\u2015]+\s*)?\d?(?:\s|[\u2012\u2013\u2014\u2015]|-)*$/;

export function plainPunctuation(text: string): string {
  return text
    .replace(RANGE, '$1-$2')
    .replace(DASH, ', ')
    .replace(SPACED_HYPHENS, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/([.!?]),\s*/g, '$1 ')
    .replace(/^,\s*/, '');
}

export class PunctuationStream {
  readonly #emit: (text: string) => void;
  #pending = '';
  #started = false;

  constructor(emit: (text: string) => void) {
    this.#emit = emit;
  }

  #send(text: string): void {
    if (text.length === 0) {
      return;
    }
    this.#started = true;
    this.#emit(text);
  }

  push(delta: string): void {
    const combined = this.#pending + delta;
    const tail = TAIL.exec(combined);
    const ready = combined.slice(0, tail === null ? combined.length : tail.index);
    this.#pending = combined.slice(ready.length);
    const cleaned = plainPunctuation(this.#started ? `x${ready}` : ready);
    this.#send(this.#started ? cleaned.slice(1) : cleaned);
  }

  flush(): void {
    const rest = this.#pending;
    this.#pending = '';
    const cleaned = plainPunctuation(`x${rest}`).slice(1).replace(/,\s*$/, '').replace(/\s+$/, '');
    this.#send(cleaned);
  }
}
