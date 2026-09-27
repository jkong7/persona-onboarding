import type { FieldName, FieldStatus, Snapshot, StateDescription } from '../api/types.ts';

export type StatusTone = 'good' | 'pending' | 'muted' | 'warn';

export interface FieldRow {
  field: FieldName;
  label: string;
  value: string | null;
  status: string;
  tone: StatusTone;
  note: string | null;
}

export const FIELD_ORDER: readonly FieldName[] = ['agentName', 'userName', 'helpTopic', 'gmail'];

export const FIELD_LABELS: Record<FieldName, string> = {
  agentName: 'Agent name',
  userName: 'Your name',
  helpTopic: 'What you want help with',
  gmail: 'Gmail',
};

export const DEFAULT_AGENT_NAME = 'Persona';

export function statusLabel(status: FieldStatus): string {
  switch (status) {
    case 'provisional':
      return 'Heard';
    case 'confirmed':
      return 'Confirmed';
    case 'deferred':
      return 'Skipped';
    case 'declined':
      return 'Declined';
    case 'empty':
      return 'Not yet';
  }
}

export function statusTone(status: FieldStatus): StatusTone {
  switch (status) {
    case 'confirmed':
      return 'good';
    case 'provisional':
      return 'pending';
    case 'declined':
      return 'warn';
    case 'deferred':
    case 'empty':
      return 'muted';
  }
}

function gmailRow(state: StateDescription): FieldRow {
  const gmail = state.gmail;
  const known = state.known.find((entry) => entry.field === 'gmail');
  const missing = state.missing.find((entry) => entry.field === 'gmail');
  if (gmail.connected) {
    const sample = gmail.mode === 'sample';
    return {
      field: 'gmail',
      label: FIELD_LABELS.gmail,
      value: sample ? 'Sample inbox' : (known?.value ?? 'Connected'),
      status: sample ? 'In use' : 'Connected',
      tone: 'good',
      note: sample ? 'Made-up emails. Your own mail is not connected.' : 'Read only.',
    };
  }
  const status = missing?.status ?? 'empty';
  const base = statusLabel(status);
  let note: string | null = null;
  if (status === 'empty' && gmail.offered) {
    note = 'Connect button is on screen.';
  }
  if (gmail.failureReason !== null) {
    note = failureNote(gmail.failureReason);
  }
  return {
    field: 'gmail',
    label: FIELD_LABELS.gmail,
    value: null,
    status: status === 'empty' && gmail.offered ? 'Offered' : base,
    tone: status === 'empty' && gmail.offered ? 'pending' : statusTone(status),
    note,
  };
}

export function failureNote(reason: string): string {
  switch (reason) {
    case 'popup_closed':
      return 'The Google window was closed.';
    case 'popup_blocked':
      return 'The browser blocked the Google window.';
    case 'access_denied':
      return 'Access was declined.';
    case 'not_allowlisted':
      return 'That Google account is not on the demo list.';
    case 'scope_missing':
      return 'Google did not grant read access.';
    case 'exchange_failed':
      return 'The connection did not complete.';
    default:
      return 'The last attempt did not complete.';
  }
}

export function fieldRows(state: StateDescription): FieldRow[] {
  return FIELD_ORDER.map((field): FieldRow => {
    if (field === 'gmail') {
      return gmailRow(state);
    }
    const known = state.known.find((entry) => entry.field === field);
    if (known !== undefined) {
      return {
        field,
        label: FIELD_LABELS[field],
        value: known.value,
        status: statusLabel(known.status),
        tone: statusTone(known.status),
        note: known.status === 'provisional' ? 'Waiting to be read back.' : null,
      };
    }
    const missing = state.missing.find((entry) => entry.field === field);
    const status = missing?.status ?? 'empty';
    const fallback = field === 'agentName' ? `Going by ${DEFAULT_AGENT_NAME} for now.` : null;
    return {
      field,
      label: FIELD_LABELS[field],
      value: null,
      status: statusLabel(status),
      tone: statusTone(status),
      note: fallback,
    };
  });
}

export function agentName(snapshot: Snapshot | null): string {
  const known = snapshot?.state.known.find((entry) => entry.field === 'agentName');
  return known?.value ?? DEFAULT_AGENT_NAME;
}

export function userName(snapshot: Snapshot | null): string | null {
  return snapshot?.state.known.find((entry) => entry.field === 'userName')?.value ?? null;
}

export function phaseLabel(phase: Snapshot['phase']): string {
  return phase === 'graduated' ? 'Main experience' : 'Getting set up';
}

export function endReasonLabel(reason: string | null): string | null {
  switch (reason) {
    case 'user_hangup':
      return 'You hung up';
    case 'tab_closed':
      return 'The tab was closed';
    case 'network_drop':
      return 'The connection dropped';
    case 'silence_timeout':
      return 'The line went quiet';
    case 'agent_ended':
      return 'The call was wrapped up';
    default:
      return null;
  }
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
