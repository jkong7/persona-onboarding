import type { TranscriptEntry } from '../api/types.ts';
import { splitBubbles } from './bubbles.ts';

export interface BubbleItem {
  kind: 'bubble';
  key: string;
  role: 'user' | 'agent';
  text: string;
  seq: number;
  createdAt: string;
  lastOfGroup: boolean;
}

export interface CallLine {
  key: string;
  seq: number;
  role: 'user' | 'agent';
  text: string;
  interrupted: boolean;
  typed: boolean;
}

export interface CallBlockItem {
  kind: 'call';
  key: string;
  callId: string | null;
  lines: CallLine[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  live: boolean;
}

export type ThreadItem = BubbleItem | CallBlockItem;

function belongsToCall(entry: TranscriptEntry): boolean {
  return entry.callId !== null || entry.channel === 'voice';
}

function sameCall(block: CallBlockItem, entry: TranscriptEntry): boolean {
  if (block.callId !== null || entry.callId !== null) {
    return block.callId === entry.callId;
  }
  return true;
}

function elapsed(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.max(0, end - start);
}

export function buildThread(transcript: readonly TranscriptEntry[], activeCallId: string | null): ThreadItem[] {
  const items: ThreadItem[] = [];
  for (const entry of transcript) {
    if (belongsToCall(entry)) {
      const last = items.at(-1);
      const line: CallLine = {
        key: `line-${entry.seq}`,
        seq: entry.seq,
        role: entry.role,
        text: entry.text,
        interrupted: entry.interrupted,
        typed: entry.channel === 'text',
      };
      if (last !== undefined && last.kind === 'call' && sameCall(last, entry)) {
        last.lines.push(line);
        last.endedAt = entry.createdAt;
        last.durationMs = elapsed(last.startedAt, last.endedAt);
        continue;
      }
      items.push({
        kind: 'call',
        key: `call-${entry.callId ?? entry.seq}-${entry.seq}`,
        callId: entry.callId,
        lines: [line],
        startedAt: entry.createdAt,
        endedAt: entry.createdAt,
        durationMs: 0,
        live: entry.callId !== null && entry.callId === activeCallId,
      });
      continue;
    }
    const parts = entry.role === 'agent' ? splitBubbles(entry.text) : [entry.text.trim()];
    const kept = parts.filter((part) => part.length > 0);
    kept.forEach((text, index) => {
      items.push({
        kind: 'bubble',
        key: `msg-${entry.seq}-${index}`,
        role: entry.role,
        text,
        seq: entry.seq,
        createdAt: entry.createdAt,
        lastOfGroup: false,
      });
    });
  }
  items.forEach((item, index) => {
    if (item.kind !== 'bubble') {
      return;
    }
    const next = items[index + 1];
    item.lastOfGroup = next === undefined || next.kind !== 'bubble' || next.role !== item.role;
  });
  return items;
}

export function durationLabel(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return 'under a minute';
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function callHeader(block: CallBlockItem): string {
  return block.live ? 'Call in progress' : `Call, ${durationLabel(block.durationMs)}`;
}

export function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface PendingMessage {
  localId: string;
  text: string;
  baseSeq: number;
}

export function unconfirmedPending<T extends PendingMessage>(
  pending: readonly T[],
  transcript: readonly TranscriptEntry[],
): T[] {
  const claimed = new Set<number>();
  const remaining: T[] = [];
  for (const message of pending) {
    const match = transcript.find(
      (entry) =>
        entry.role === 'user' &&
        entry.seq > message.baseSeq &&
        !claimed.has(entry.seq) &&
        entry.fullText.trim() === message.text.trim(),
    );
    if (match === undefined) {
      remaining.push(message);
    } else {
      claimed.add(match.seq);
    }
  }
  return remaining;
}

export function agentRepliedAfter(transcript: readonly TranscriptEntry[], seq: number): boolean {
  return transcript.some((entry) => entry.role === 'agent' && entry.seq > seq && entry.channel !== 'voice');
}
