import type { Snapshot } from '../api/types.ts';
import { endReasonLabel, FIELD_LABELS, FIELD_ORDER } from './status.ts';

export interface ActivityItem {
  id: string;
  at: string;
  text: string;
}

export const ACTIVITY_LIMIT = 24;

function fieldValue(snapshot: Snapshot, field: string): { value: string; status: string } | null {
  const known = snapshot.state.known.find((entry) => entry.field === field);
  return known === undefined ? null : { value: known.value, status: known.status };
}

function missingStatus(snapshot: Snapshot, field: string): string {
  return snapshot.state.missing.find((entry) => entry.field === field)?.status ?? 'empty';
}

function quote(value: string): string {
  const short = value.length > 60 ? `${value.slice(0, 57)}...` : value;
  return `"${short}"`;
}

export function describeChanges(previous: Snapshot | null, next: Snapshot): string[] {
  const lines: string[] = [];
  if (previous === null) {
    const known = next.state.known.length;
    if (next.lastSeq === 0 && known === 0) {
      lines.push('Thread opened.');
    } else {
      lines.push(`Thread restored. ${known} saved ${known === 1 ? 'item' : 'items'} intact.`);
    }
    return lines;
  }
  if (previous.id !== next.id) {
    lines.push('Started a fresh thread.');
    return lines;
  }
  for (const field of FIELD_ORDER) {
    if (field === 'gmail') {
      continue;
    }
    const label = FIELD_LABELS[field];
    const before = fieldValue(previous, field);
    const after = fieldValue(next, field);
    if (after !== null && before === null) {
      lines.push(`${label} saved: ${quote(after.value)}${after.status === 'provisional' ? ', heard by voice' : ''}.`);
    } else if (after !== null && before !== null && after.value !== before.value) {
      lines.push(`${label} corrected to ${quote(after.value)}.`);
    } else if (after !== null && before !== null && before.status === 'provisional' && after.status === 'confirmed') {
      lines.push(`${label} confirmed.`);
    } else if (after === null && before !== null) {
      lines.push(`${label} cleared.`);
    } else if (after === null) {
      const was = missingStatus(previous, field);
      const now = missingStatus(next, field);
      if (was !== now && now === 'deferred') {
        lines.push(`${label} skipped for now.`);
      } else if (was !== now && now === 'declined') {
        lines.push(`${label} declined.`);
      }
    }
  }
  const gmailBefore = previous.state.gmail;
  const gmailAfter = next.state.gmail;
  if (gmailAfter.connected && (!gmailBefore.connected || gmailBefore.mode !== gmailAfter.mode)) {
    lines.push(gmailAfter.mode === 'sample' ? 'Switched to the sample inbox.' : 'Gmail connected, read only.');
  } else if (!gmailAfter.connected && gmailBefore.connected) {
    lines.push('Gmail disconnected.');
  } else if (!gmailAfter.connected) {
    if (gmailAfter.offered && !gmailBefore.offered) {
      lines.push('Connect Gmail button shown.');
    }
    const was = missingStatus(previous, 'gmail');
    const now = missingStatus(next, 'gmail');
    if (was !== now && now === 'declined') {
      lines.push('Gmail declined.');
    } else if (was !== now && now === 'deferred') {
      lines.push('Gmail skipped for now.');
    }
    if (gmailAfter.failureReason !== null && gmailAfter.failureReason !== gmailBefore.failureReason) {
      lines.push('Gmail connection did not complete.');
    }
  }
  const callsBefore = previous.state.calls;
  const callsAfter = next.state.calls;
  if (callsAfter.ringing && !callsBefore.ringing) {
    lines.push('Incoming call.');
  }
  if (callsAfter.declined > callsBefore.declined) {
    lines.push('Call declined. Carrying on in text.');
  }
  if (callsAfter.total > callsBefore.total) {
    lines.push(callsAfter.total === 1 ? 'Call connected.' : `Call ${callsAfter.total} connected. Picking up where it left off.`);
  }
  if (callsBefore.active && !callsAfter.active) {
    const reason = endReasonLabel(callsAfter.lastEndReason);
    const saved = next.state.known.length;
    lines.push(
      `Call ended${reason === null ? '' : `: ${reason.toLowerCase()}`}. ${saved} ${saved === 1 ? 'item' : 'items'} still saved.`,
    );
  }
  if (previous.phase !== next.phase && next.phase === 'graduated') {
    lines.push('Moved into the main experience.');
  }
  return lines;
}

export function appendActivity(
  feed: readonly ActivityItem[],
  previous: Snapshot | null,
  next: Snapshot,
  at: string,
): ActivityItem[] {
  const newest = feed[0]?.text ?? null;
  const lines = describeChanges(previous, next).filter((text) => !(previous === null && text === newest));
  if (lines.length === 0) {
    return feed as ActivityItem[];
  }
  const added = lines.map((text, index) => ({ id: `${next.version}-${next.lastSeq}-${index}-${at}`, at, text }));
  return [...added.reverse(), ...feed].slice(0, ACTIVITY_LIMIT);
}

export function isActivityFeed(value: unknown): value is ActivityItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ActivityItem).id === 'string' &&
        typeof (item as ActivityItem).at === 'string' &&
        typeof (item as ActivityItem).text === 'string',
    )
  );
}
