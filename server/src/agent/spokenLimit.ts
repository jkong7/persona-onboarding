export interface SpokenLimitOptions {
  lead: number;
  max: number;
  maxWords: number;
  bridge: string | null;
  quietAboutInbox: boolean;
  quietAboutRealInbox: boolean;
  agentName: string | null;
}

export interface SpokenResult {
  spoken: string;
  overflow: string;
}

export const THREAD_BRIDGE = 'The rest is in the thread.';
export const CALL_WORD_BUDGET = 50;
export const DEFAULT_SPOKEN_LIMIT: SpokenLimitOptions = {
  lead: 2,
  max: 3,
  maxWords: Number.POSITIVE_INFINITY,
  bridge: null,
  quietAboutInbox: false,
  quietAboutRealInbox: false,
  agentName: null,
};

const BOUNDARY = /[.!?]+["')\]]*\s+/;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function isQuestion(sentence: string): boolean {
  return /\?["')\]]*\s*$/.test(sentence);
}

const FILLER =
  /^(?:ok(?:ay)?|got it|found it|perfect|great|alright|all right|sure|done|right|here we go|there we go|one sec|one moment|fair enough|no rush|no worries|no problem|sounds good|understood)(?:,? (?:then|so|now))?(?:,? \p{Lu}\p{L}+)?[.!,]*$/iu;
const PRAISE =
  /^(?:(?:that's|that is|what) a? ?)?(?:good|great|nice|excellent|smart|solid|fair) (?:one|question|choice|call|idea|thinking|point)(?:,? \p{Lu}\p{L}+)?[.!]*$/iu;
const SECOND_ASK = /^(.{8,}?),? and (?=(?:what|who|how|which|where|when|why)\b)/i;

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function withoutSelfAddress(sentence: string, agentName: string | null): string {
  const name = agentName?.trim() ?? '';
  if (name.length === 0) {
    return sentence;
  }
  const escaped = escapeForPattern(name);
  const trailing = new RegExp(`,\\s*${escaped}(?=[.?!]*\\s*$)`, 'i');
  const leading = new RegExp(`^((?:hey|hi|hello|okay|ok|thanks|sorry|no worries|sure|got it|good)),?\\s+${escaped}\\s*([,.!?])`, 'i');
  return sentence.replace(trailing, '').replace(leading, '$1$2');
}

export function singleQuestion(sentence: string): string {
  if (!isQuestion(sentence)) {
    return sentence;
  }
  const match = SECOND_ASK.exec(sentence.trim());
  if (match === null || match[1] === undefined) {
    return sentence;
  }
  return `${match[1].replace(/[,;:]\s*$/, '')}?`;
}
const NARRATION =
  /^(?:ok(?:ay)?,? |so,? |alright,? )?(?:let me|i'll|i will|i'm going to|i am going to|i've|i have|i'm|i am)\b[^.?!]*\b(?:load(?:ed|ing)?|pull(?:ed|ing)?|look(?:ed|ing)?|check(?:ed|ing)?|open(?:ed|ing)?)\b/i;
const INTERNAL = /\b(?:main experience|onboarding|graduat\w*|[a-z]+_[a-z_]+)\b/i;
const SPELLED = /(?:^|[\s"'(])\p{L}(?:[-.]\p{L}){2,}(?=$|[\s"').,!?])/u;

export function isFiller(sentence: string): boolean {
  return FILLER.test(sentence.trim());
}

const ARRIVED =
  /^(?:(?:ok(?:ay)?|so|alright|all right|right|got it|great|perfect|done)[,.]? )?(?:\p{Lu}\p{L}+, )?(?:i'm|i am|we're|we are|you're|you are)\s+(?:now\s+)?(?:in|into|on|all set|set up)\b[^.?!]{0,40}[.!]*$/iu;

export function isPraise(sentence: string): boolean {
  return PRAISE.test(sentence.trim());
}

export function isNarration(sentence: string): boolean {
  const text = sentence.trim();
  return NARRATION.test(text) || ARRIVED.test(text);
}

const INBOX_NUDGE = /\b(?:connect(?:ed|ing|s)?|button|gmail|sample inbox|your inbox|your email)\b/i;

export function isInboxNudge(sentence: string): boolean {
  return INBOX_NUDGE.test(sentence);
}

const REAL_INBOX_NUDGE =
  /\bconnect(?:ed|ing|s)?\b|\b(?:actual|real|own) (?:gmail|e-?mail|inbox|account|mail|pile)\b|\byour gmail\b/i;

export function isRealInboxNudge(sentence: string): boolean {
  return REAL_INBOX_NUDGE.test(sentence);
}

export function isInternal(sentence: string): boolean {
  return INTERNAL.test(sentence) || SPELLED.test(sentence);
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
  #buffer = '';
  #said = 0;
  #words = 0;
  #overBudget = false;
  #nudges = 0;
  #saidKeys = new Set<string>();
  #saidBefore = 0;
  #held: string[] = [];
  #overflow: string[] = [];
  #dropped: string[] = [];
  #asked = false;
  #bridged = false;
  #afterLookup = false;

  constructor(emit: (text: string) => void, options: Partial<SpokenLimitOptions> = {}) {
    this.#emit = emit;
    this.#options = { ...DEFAULT_SPOKEN_LIMIT, ...options };
  }

  get askedQuestion(): boolean {
    return this.#asked;
  }

  get droppedNudges(): number {
    return this.#nudges;
  }

  #say(raw: string, counted = true): void {
    const sentence = withoutSelfAddress(singleQuestion(raw), this.#options.agentName);
    const key = sentence.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (key.length > 0 && this.#saidKeys.has(key)) {
      return;
    }
    this.#saidKeys.add(key);
    const text = `${flatten(sentence)} `;
    this.#emitted += text;
    this.#said += 1;
    if (counted) {
      this.#words += countWords(sentence);
    }
    this.#asked = this.#asked || isQuestion(sentence);
    this.#emit(text);
  }

  #unwanted(sentence: string): boolean {
    if (this.#asked) {
      return true;
    }
    if (isPraise(sentence)) {
      return true;
    }
    if (this.#options.quietAboutRealInbox && isRealInboxNudge(sentence)) {
      this.#dropped.push(flatten(sentence));
      this.#nudges += 1;
      return true;
    }
    if (this.#options.quietAboutInbox && isInboxNudge(sentence)) {
      this.#dropped.push(flatten(sentence));
      this.#nudges += 1;
      return true;
    }
    if (isInternal(sentence)) {
      this.#dropped.push(flatten(sentence));
      return true;
    }
    if (this.#afterLookup && this.#said === this.#saidBefore && (isFiller(sentence) || isNarration(sentence))) {
      this.#dropped.push(flatten(sentence));
      return true;
    }
    return false;
  }

  #take(sentence: string): void {
    if (!hasWords(sentence)) {
      return;
    }
    if (this.#bridged || this.#overBudget || this.#said >= this.#options.lead) {
      this.#held.push(sentence);
      return;
    }
    if (this.#unwanted(sentence)) {
      return;
    }
    if (this.#said > 0 && !isQuestion(sentence) && this.#words + countWords(sentence) > this.#options.maxWords) {
      this.#overBudget = true;
      this.#held.push(sentence);
      return;
    }
    this.#say(sentence);
  }

  #drain(): void {
    for (;;) {
      const match = BOUNDARY.exec(this.#buffer);
      if (match === null) {
        return;
      }
      const end = match.index + match[0].length;
      const sentence = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end);
      this.#take(sentence);
    }
  }

  push(delta: string): void {
    this.#buffer += delta;
    this.#drain();
  }

  settle(): void {
    this.#drain();
    const last = this.#buffer;
    this.#buffer = '';
    this.#take(last);
    this.#release(this.#said === this.#saidBefore);
    this.#saidBefore = this.#said;
  }

  #release(fresh: boolean): void {
    const rest = this.#held.filter((sentence) => {
      if (isQuestion(sentence)) {
        return true;
      }
      return !this.#unwanted(sentence);
    });
    this.#held = [];
    const questions = rest.filter(isQuestion);
    const keptQuestion = this.#asked ? null : (questions.at(-1) ?? null);
    const kept = rest.filter((sentence) => !isQuestion(sentence) || sentence === keptQuestion);
    if (kept.length === 0) {
      return;
    }
    if (this.#bridged) {
      this.#overflow.push(...kept.map(flatten));
      return;
    }
    const allowance = this.#options.max + (this.#options.bridge === null ? 0 : 1);
    const last = kept.at(-1) ?? '';
    const closing = isQuestion(last) ? last : null;
    const body = closing === null ? kept : kept.slice(0, -1);
    const budget = this.#options.maxWords - (closing === null ? 0 : countWords(closing));
    const total = body.reduce((sum, sentence) => sum + countWords(sentence), this.#words);
    if (this.#said + kept.length <= allowance && total <= budget) {
      for (const sentence of kept) {
        this.#say(sentence);
      }
      return;
    }
    const reserved = (this.#options.bridge === null ? 0 : 1) + (closing === null ? 0 : 1);
    const room = Math.max(fresh ? 1 : 0, allowance - this.#said - reserved);
    let spoken = 0;
    for (const sentence of body.slice(0, room)) {
      const guaranteed = fresh && spoken === 0;
      if (!guaranteed && this.#words + countWords(sentence) > budget) {
        break;
      }
      this.#say(sentence);
      spoken += 1;
    }
    const moved = body.slice(spoken);
    if (moved.length > 0) {
      this.#overflow.push(...moved.map(flatten));
      this.#bridged = true;
      if (this.#options.bridge !== null) {
        this.#say(this.#options.bridge, false);
      }
    }
    if (closing !== null) {
      this.#say(closing);
    }
  }

  afterLookup(): void {
    this.#afterLookup = true;
    this.#saidBefore = this.#said;
  }

  breakBetweenReplies(): void {
    this.settle();
    this.#words = 0;
    this.#said = Math.min(this.#said, 1);
    this.#saidBefore = this.#said;
    this.#afterLookup = true;
  }

  spokenSoFar(): string {
    return flatten(this.#emitted);
  }

  finish(): SpokenResult {
    this.settle();
    if (this.#emitted.length === 0) {
      const rescued = this.#dropped.find((sentence) => !SPELLED.test(sentence));
      if (rescued !== undefined) {
        this.#say(rescued);
      }
    }
    return { spoken: this.spokenSoFar(), overflow: this.#overflow.join(' ') };
  }
}
