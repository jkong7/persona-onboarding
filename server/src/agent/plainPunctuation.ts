const RANGE = /(\d)\s*[‒–—―]\s*(\d)/g;
const DASH = /\s*[‒–—―]+\s*/g;
const SPACED_HYPHENS = /(?<=\S)[^\S\n]+-{1,3}[^\S\n]+/g;
const TAIL = /(?:\d\s*[\u2012\u2013\u2014\u2015]+\s*)?\d?(?:\s|[\u2012\u2013\u2014\u2015]|-)*$/;

const HIDDEN = 'reasoning|thinking|thought|thoughts|scratchpad|analysis|plan|notes?|reflection|commentary';
const HIDDEN_BLOCK = new RegExp(`<(${HIDDEN})>[\\s\\S]*?<\\/\\1>\\s*`, 'gi');
const HIDDEN_OPEN = new RegExp(`<(?:${HIDDEN})>`, 'i');
const HIDDEN_UNCLOSED = new RegExp(`<(?:${HIDDEN})>[\\s\\S]*$`, 'i');
const TAG = /<\/?[a-zA-Z][\w-]*\s*\/?>/g;
const OPEN_TAG = /<\/?[a-zA-Z]?[\w-]*\s*\/?$/;
const TAG_HOLD_LIMIT = 40;

export function plainPunctuation(text: string): string {
  return text
    .replace(HIDDEN_BLOCK, '')
    .replace(HIDDEN_UNCLOSED, '')
    .replace(TAG, '')
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
    const open = OPEN_TAG.exec(combined);
    const holdTag = open !== null && combined.length - open.index <= TAG_HOLD_LIMIT ? open.index : combined.length;
    const hidden = HIDDEN_OPEN.exec(combined.replace(HIDDEN_BLOCK, (block) => ' '.repeat(block.length)));
    const holdHidden = hidden === null ? combined.length : hidden.index;
    const ready = combined.slice(
      0,
      Math.min(tail === null ? combined.length : tail.index, holdTag, holdHidden),
    );
    this.#pending = combined.slice(ready.length);
    const cleaned = plainPunctuation(this.#started ? `x${ready}` : ready);
    const text = this.#started ? cleaned.slice(1) : cleaned.replace(/^\s+/, '');
    this.#send(text);
  }

  flush(): void {
    const rest = this.#pending;
    this.#pending = '';
    const cleaned = plainPunctuation(`x${rest}`).slice(1).replace(/,\s*$/, '').replace(/\s+$/, '');
    this.#send(cleaned);
  }
}
