import type { CallEndReason, Channel, GmailFailureReason, GmailMode } from './types.ts';

export type MessageRole = 'user' | 'agent';

export interface MessageEvent {
  type: 'message';
  role: MessageRole;
  channel: Channel;
  text: string;
  heard: string | null;
  callId: string | null;
}

export interface MessageHeardEvent {
  type: 'message_heard';
  messageSeq: number;
  heard: string;
}

export interface MessageSupersededEvent {
  type: 'message_superseded';
  messageSeq: number;
}

export interface ToolCallEvent {
  type: 'tool_call';
  name: string;
  channel: Channel;
  input: unknown;
  result: unknown;
  changed: boolean;
  recordVersion: number;
}

export interface CallStartedEvent {
  type: 'call_started';
  callId: string;
  callNumber: number;
  supersededCallId: string | null;
}

export interface CallEndedEvent {
  type: 'call_ended';
  callId: string;
  reason: CallEndReason;
  unplanned: boolean;
  callbackRequested: boolean;
}

export interface CallOfferedEvent {
  type: 'call_offered';
  userRequested: boolean;
}

export interface CallDeclinedEvent {
  type: 'call_declined';
  declinedCount: number;
}

export interface NoteEvent {
  type: 'note';
  kind: string;
  detail: string | null;
}

export type OAuthAction = 'offered' | 'connected' | 'failed' | 'disconnected';

export interface OAuthEvent {
  type: 'oauth';
  action: OAuthAction;
  mode: GmailMode | null;
  reason: GmailFailureReason | null;
  recordVersion: number;
}

export type OnboardingEvent =
  | MessageEvent
  | MessageHeardEvent
  | MessageSupersededEvent
  | ToolCallEvent
  | CallStartedEvent
  | CallEndedEvent
  | CallOfferedEvent
  | CallDeclinedEvent
  | NoteEvent
  | OAuthEvent;

export type EventType = OnboardingEvent['type'];

export interface StoredEvent<E extends OnboardingEvent = OnboardingEvent> {
  seq: number;
  onboardingId: string;
  createdAt: string;
  event: E;
}

export interface TranscriptEntry {
  seq: number;
  role: MessageRole;
  channel: Channel;
  callId: string | null;
  text: string;
  fullText: string;
  interrupted: boolean;
  createdAt: string;
}

export function supersededSeqs(events: readonly StoredEvent[]): Set<number> {
  const seqs = new Set<number>();
  for (const stored of events) {
    if (stored.event.type === 'message_superseded') {
      seqs.add(stored.event.messageSeq);
    }
  }
  return seqs;
}

export function buildTranscript(events: readonly StoredEvent[]): TranscriptEntry[] {
  const heardBySeq = new Map<number, string>();
  const superseded = supersededSeqs(events);
  for (const stored of events) {
    if (stored.event.type === 'message_heard') {
      heardBySeq.set(stored.event.messageSeq, stored.event.heard);
    }
  }
  const entries: TranscriptEntry[] = [];
  for (const stored of events) {
    if (stored.event.type !== 'message' || superseded.has(stored.seq)) {
      continue;
    }
    const message = stored.event;
    const heard = message.role === 'agent' ? (heardBySeq.get(stored.seq) ?? message.heard) : null;
    const text = heard ?? message.text;
    entries.push({
      seq: stored.seq,
      role: message.role,
      channel: message.channel,
      callId: message.callId,
      text,
      fullText: message.text,
      interrupted: text !== message.text,
      createdAt: stored.createdAt,
    });
  }
  return entries;
}
