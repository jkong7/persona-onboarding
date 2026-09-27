import type { StoredEvent } from '../domain/events.ts';
import type { OnboardingRecord } from '../domain/types.ts';

export const RETURN_GAP_MS = 30 * 60 * 1000;

export type OpenDecision =
  | { type: 'none'; reason: 'recent_activity' | 'already_greeted' | 'call_in_progress' }
  | { type: 'first_visit' }
  | { type: 'returned'; detail: string; gapMs: number };

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function describeGap(gapMs: number): string {
  const minutes = Math.round(gapMs / 60_000);
  if (minutes < 90) {
    return `about ${plural(Math.max(1, minutes), 'minute')}`;
  }
  const hours = Math.round(gapMs / 3_600_000);
  if (hours < 36) {
    return `about ${plural(hours, 'hour')}`;
  }
  return `about ${plural(Math.round(gapMs / 86_400_000), 'day')}`;
}

function isAgentOnly(stored: StoredEvent): boolean {
  const event = stored.event;
  if (event.type === 'message') {
    return event.role === 'agent';
  }
  if (event.type === 'note') {
    return event.kind === 'returned' || event.kind === 'model_error';
  }
  return event.type === 'tool_call' || event.type === 'message_heard' || event.type === 'call_offered';
}

function greetedSinceLastActivity(events: readonly StoredEvent[]): boolean {
  let lastReturn = -1;
  events.forEach((stored, index) => {
    if (stored.event.type === 'note' && stored.event.kind === 'returned') {
      lastReturn = index;
    }
  });
  if (lastReturn < 0) {
    return false;
  }
  return events.slice(lastReturn + 1).every(isAgentOnly);
}

export function decideOpening(
  events: readonly StoredEvent[],
  record: OnboardingRecord,
  now: Date,
): OpenDecision {
  const greeted = events.some((stored) => stored.event.type === 'message' && stored.event.role === 'agent');
  if (!greeted) {
    return { type: 'first_visit' };
  }
  if (record.calls.activeCallId !== null) {
    return { type: 'none', reason: 'call_in_progress' };
  }
  const last = events.at(-1);
  const lastAt = last === undefined ? Number.NaN : Date.parse(last.createdAt);
  const gapMs = now.getTime() - lastAt;
  if (!Number.isFinite(gapMs) || gapMs <= RETURN_GAP_MS) {
    return { type: 'none', reason: 'recent_activity' };
  }
  if (greetedSinceLastActivity(events)) {
    return { type: 'none', reason: 'already_greeted' };
  }
  return { type: 'returned', detail: `The person is back after ${describeGap(gapMs)} away.`, gapMs };
}
