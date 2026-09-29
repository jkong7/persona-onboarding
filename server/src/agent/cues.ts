interface Cue {
  pattern: RegExp;
  hint: string;
  onlyWithoutQuestion?: boolean;
}

const CUES: Cue[] = [
  {
    pattern:
      /\b(?:just let me in|let me in|skip (?:this|it|that|ahead|setup|the setup|all this)|(?:don't|do not) want to answer|no more questions|stop asking|can i just (?:start|use)|just (?:start|get started)|nothing specific)\b/i,
    hint: 'they want to skip setup. Tell them they are in, in a few words, call graduate with userRequestedSkip true in this same reply, and ask nothing.',
  },
  {
    pattern:
      /\b(?:bye|goodbye|good night|talk (?:to you )?(?:soon|later)|see you|(?:gotta|got to|have to|need to) (?:go|run)|that's all|that is all|that's it for now|i'm done|we're done)\b/i,
    hint: 'they may be ending the call. If so, say goodbye in a few words and call end_call with intent completed in this same reply.',
  },
  {
    pattern:
      /\b(?:call (?:me )?back|call me later|try me later|(?:bad|not a good) time|i'm driving|i am driving)\b/i,
    hint: 'they may want a call back later. If so, say what you have so far, say goodbye, and call end_call with intent callback_later in this same reply.',
  },
  {
    pattern:
      /\b(?:text (?:me|instead)|(?:over|by|via) text|(?:rather|just) (?:type|text)|type instead|can't talk|cannot talk|in a meeting)\b/i,
    hint: 'they may want to switch to text. If so, say you will carry on by text and call end_call with intent switch_to_text in this same reply.',
  },
  {
    pattern:
      /\b(?:hold on|hang on|(?:one|a|just a|give me a) (?:sec|second|moment|minute)|be right back|let me (?:check|find|look|grab|see))\b/i,
    hint: 'they may be asking for a moment. If so, say "Take your time" and nothing else.',
    onlyWithoutQuestion: true,
  },
];

export const MAX_CUES = 2;

const REFUSES_CALL =
  /\b(?:no|not|don't|dont|do not|can't|cant|cannot|won't|wont|rather not|stop|never)\b[^.?!]{0,40}\b(?:calls?|calling|phone|ring(?:ing)?|talk(?:ing)?|voice|speak)\b|\b(?:just|only|rather|prefer(?: to)?|let's|lets|keep) (?:text|type|typing|texting)\b|\b(?:text|typing) (?:only|instead|is fine|works)\b/i;

export function refusesCall(utterance: string): boolean {
  return REFUSES_CALL.test(utterance);
}

const SAMPLE_WORDS = /\b(?:sample|demo|made[- ]up|fake|example|pretend|ejemplo|muestra|prueba|exemple|beispiel)\b/i;
const REFUSES_EVERYTHING =
  /\bnot even\b|\b(?:don't|dont|do not|won't|wont) (?:want to )?(?:connect|use|open|try) (?:anything|any of|either)\b|\bnothing connected\b|\bno inbox(?:es)?\b/i;

export function askedForSample(utterance: string): boolean {
  if (REFUSES_EVERYTHING.test(utterance)) {
    return false;
  }
  if (SAMPLE_WORDS.test(utterance)) {
    return true;
  }
  return !/[?\u00bf]/.test(utterance);
}

const ABOUT_REAL_INBOX = /\b(?:gmail|g mail|google|connect\w*|real|actual|own|my (?:e-?mail|inbox|account|mail))\b/i;

export const SAMPLE_CHOSEN_HINT =
  'they chose the sample inbox. Work with the sample mail and do not suggest connecting their own account unless they bring it up.';

export function staysOnSample(utterance: string, mode: 'real' | 'sample' | null): boolean {
  return mode === 'sample' && !ABOUT_REAL_INBOX.test(utterance);
}

export const ASK_NAME_HINT =
  'you still do not know what to call them and have never asked. Answer what they said first, then ask their name in a few words as the last thing in this reply, and call record_ask for userName.';

export function shouldAskName(input: { known: boolean; asks: number; mayAsk: boolean; userTurns: number }): boolean {
  return !input.known && input.mayAsk && input.asks === 0 && input.userTurns >= 3;
}

const ABOUT_INBOX = /\b(?:gmail|g mail|e-?mails?|mail|inbox|connect\w*|button|google|sample|account|privacy|access)\b/i;
const ASKS_WHAT_NEXT = /\b(?:what (?:should|do|can) (?:i|we) do|what now|what next|what's next|next step|where (?:do|should) (?:i|we) (?:start|begin)|how (?:do|should) (?:i|we) (?:start|begin)|what do you need)\b/i;
const SHORT_ANSWER = /\b(?:yes|yeah|yep|yup|sure|ok|okay|fine|alright|go ahead|do it|please|no|nope|nah|not now|not yet|later|real|mine)\b/i;
const SHORT_ANSWER_WORDS = 5;

export const INBOX_QUIET_HINT =
  'they did not bring up email or the inbox this turn, and you have already offered it. Do not mention Gmail, the inbox, the button or connecting. Work from what they just told you, and ask about that.';

export interface InboxTalk {
  utterance: string;
  replies: readonly string[];
  offered: boolean;
  connected: boolean;
}

export function staysQuietAboutInbox(talk: InboxTalk): boolean {
  const raised = talk.offered || talk.replies.some((reply) => ABOUT_INBOX.test(reply));
  if (!raised || talk.connected || ABOUT_INBOX.test(talk.utterance) || ASKS_WHAT_NEXT.test(talk.utterance)) {
    return false;
  }
  const last = talk.replies.at(-1) ?? '';
  const askedAboutInbox = last.includes('?') && ABOUT_INBOX.test(last);
  if (!askedAboutInbox) {
    return true;
  }
  const words = talk.utterance.split(/\s+/).filter((word) => word.length > 0).length;
  return words > SHORT_ANSWER_WORDS && !SHORT_ANSWER.test(talk.utterance);
}

const GIVEN_NAME = /\b(?:i'm|i am|my name is|my name's|name's|it's|it is|this is|call me)\s+(\p{L}{1,2})(?=$|[\s.,!?])/iu;
const SHORT_WORDS = new Set(['a', 'an', 'in', 'on', 'at', 'ok', 'so', 'no', 'me', 'my', 'up', 'to', 'it', 'is']);

export function misheardNameCue(utterance: string): string | null {
  const match = GIVEN_NAME.exec(utterance);
  const heard = match?.[1];
  if (heard === undefined || SHORT_WORDS.has(heard.toLowerCase())) {
    return null;
  }
  if (heard.length === 2 && heard === heard.toUpperCase()) {
    return null;
  }
  return `they seem to have given their name, but what was heard ("${heard}") is too short to be a name, so it was probably misheard. Do not use it and do not record it. Ask them to say their name again or spell it.`;
}

export function cuesFor(utterance: string): string[] {
  const name = misheardNameCue(utterance);
  const asksSomething = utterance.includes('?') || /\b(?:what|why|how|who|which|can you|could you|do you|is it|are you)\b/i.test(utterance);
  const cues = CUES.filter((cue) => cue.pattern.test(utterance))
    .filter((cue) => cue.onlyWithoutQuestion !== true || !asksSomething)
    .map((cue) => cue.hint);
  return [...(name === null ? [] : [name]), ...cues].slice(0, MAX_CUES);
}
