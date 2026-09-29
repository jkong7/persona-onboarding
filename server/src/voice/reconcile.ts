import { supersededSeqs, type StoredEvent } from '../domain/events.ts';
import { isPlainObject } from '../domain/tools/input.ts';

export interface HeardTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface Reconciliation {
  supersede: number[];
  heard: { seq: number; text: string }[];
  discardedReply: boolean;
  utterance: string | null;
  alreadyLogged: boolean;
}

interface CallMessage {
  seq: number;
  role: 'user' | 'agent';
  spoken: boolean;
  typed: boolean;
  text: string;
}

const MAX_UTTERANCE = 4000;
const MAX_DISCARDS = 6;

export function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => (isPlainObject(part) && typeof part['text'] === 'string' ? part['text'] : ''))
    .join(' ');
}

export function parseConversation(body: unknown): HeardTurn[] {
  if (!isPlainObject(body) || !Array.isArray(body['messages'])) {
    return [];
  }
  const turns: HeardTurn[] = [];
  for (const message of body['messages'] as unknown[]) {
    if (!isPlainObject(message)) {
      continue;
    }
    const role = message['role'];
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }
    const text = contentText(message['content']).replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      turns.push({ role, text });
    }
  }
  return turns;
}

export function trailingUtterance(conversation: readonly HeardTurn[]): string | null {
  const parts: string[] = [];
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index]!;
    if (turn.role !== 'user') {
      break;
    }
    parts.unshift(turn.text);
  }
  const joined = parts.join(' ').trim();
  return joined.length === 0 ? null : joined.slice(0, MAX_UTTERANCE);
}

export function spokenReplies(conversation: readonly HeardTurn[]): string[] {
  let end = conversation.length;
  while (end > 0 && conversation[end - 1]!.role === 'user') {
    end -= 1;
  }
  const replies: string[] = [];
  let run: string[] = [];
  const close = (): void => {
    if (run.length > 1) {
      replies.push(run.join(' '));
    }
    run = [];
  };
  for (const turn of conversation.slice(0, end)) {
    if (turn.role !== 'assistant') {
      close();
      continue;
    }
    replies.push(turn.text);
    run.push(turn.text);
  }
  close();
  return replies;
}

function callMessages(events: readonly StoredEvent[], callId: string): CallMessage[] {
  const superseded = supersededSeqs(events);
  const messages: CallMessage[] = [];
  let inCall = false;
  for (const stored of events) {
    const event = stored.event;
    if (event.type === 'call_started') {
      inCall = event.callId === callId;
      if (inCall) {
        messages.length = 0;
      }
      continue;
    }
    if (event.type === 'call_ended' && event.callId === callId) {
      inCall = false;
      continue;
    }
    if (!inCall || event.type !== 'message' || superseded.has(stored.seq)) {
      continue;
    }
    messages.push({
      seq: stored.seq,
      role: event.role,
      spoken: event.channel === 'voice',
      typed: event.role === 'user' && event.channel === 'text',
      text: event.text,
    });
  }
  return messages;
}

function wasSpoken(reply: string, spoken: readonly string[]): string | null {
  const mine = plain(reply);
  if (mine.length === 0) {
    return null;
  }
  for (let index = spoken.length - 1; index >= 0; index -= 1) {
    const theirs = plain(spoken[index]!);
    if (theirs.length === 0) {
      continue;
    }
    const partOfMine = theirs.length >= 12 && mine.includes(theirs);
    if (mine === theirs || mine.startsWith(theirs) || theirs.includes(mine) || partOfMine) {
      return spoken[index]!;
    }
  }
  return null;
}

function lastSpokenReply(messages: readonly CallMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === 'agent' && message.spoken) {
      return index;
    }
  }
  return -1;
}

export function reconcile(
  events: readonly StoredEvent[],
  callId: string,
  conversation: readonly HeardTurn[],
): Reconciliation {
  const utterance = trailingUtterance(conversation);
  const spoken = spokenReplies(conversation);
  let messages = callMessages(events, callId);
  const supersede: number[] = [];
  const heard: { seq: number; text: string }[] = [];
  let discardedReply = false;

  if (conversation.length > 0) {
    for (let round = 0; round < MAX_DISCARDS; round += 1) {
      const at = lastSpokenReply(messages);
      if (at < 0) {
        break;
      }
      const reply = messages[at]!;
      const match = wasSpoken(reply.text, spoken);
      if (match !== null) {
        const mine = plain(reply.text);
        const theirs = plain(match);
        if (theirs.length < mine.length && mine.startsWith(theirs)) {
          heard.push({ seq: reply.seq, text: match });
        }
        break;
      }
      let from = at;
      while (from > 0 && !(messages[from - 1]!.role === 'agent' && messages[from - 1]!.spoken)) {
        from -= 1;
      }
      supersede.push(...messages.slice(from).map((message) => message.seq));
      messages = messages.slice(0, from);
      discardedReply = true;
    }
  }

  const at = lastSpokenReply(messages);
  const unanswered = messages.slice(at + 1).filter((message) => message.role === 'user');
  if (utterance === null) {
    return { supersede, heard, discardedReply, utterance: null, alreadyLogged: false };
  }
  const wanted = plain(utterance);
  if (unanswered.length === 1 && plain(unanswered[0]!.text) === wanted) {
    return { supersede, heard, discardedReply, utterance, alreadyLogged: true };
  }
  supersede.push(...unanswered.map((message) => message.seq));
  const covered = unanswered.every((message) => wanted.includes(plain(message.text)));
  const text = covered
    ? utterance
    : [...unanswered.map((message) => message.text), utterance].join(' ').slice(0, MAX_UTTERANCE);
  return { supersede, heard, discardedReply, utterance: text, alreadyLogged: false };
}
