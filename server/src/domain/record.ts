import { ASK_BUDGET } from './fields.ts';
import type {
  FieldHistoryEntry,
  FieldName,
  FieldState,
  GmailFieldState,
  OnboardingFields,
  OnboardingRecord,
} from './types.ts';

export function emptyField(): FieldState {
  return { value: null, status: 'empty', source: null, askCount: 0, history: [], updatedAt: null };
}

export function emptyGmailField(): GmailFieldState {
  return { ...emptyField(), mode: null, failureReason: null, offered: false };
}

export function createRecord(id: string, now: string): OnboardingRecord {
  return {
    id,
    version: 0,
    phase: 'onboarding',
    skipRequested: false,
    fields: {
      agentName: emptyField(),
      userName: emptyField(),
      helpTopic: emptyField(),
      gmail: emptyGmailField(),
    },
    calls: {
      total: 0,
      unplannedHangups: 0,
      declined: 0,
      ringing: false,
      activeCallId: null,
      lastEndReason: null,
      callbackRequested: false,
    },
    createdAt: now,
    updatedAt: now,
    graduatedAt: null,
  };
}

export function hasValue(field: FieldState): field is FieldState & { value: string } {
  return field.value !== null && (field.status === 'provisional' || field.status === 'confirmed');
}

export function isSettled(field: FieldState): boolean {
  return field.status === 'deferred' || field.status === 'declined';
}

export function asksRemaining(field: FieldState): number {
  return Math.max(0, ASK_BUDGET - field.askCount);
}

export function historyWithCurrent(field: FieldState, now: string): FieldHistoryEntry[] {
  if (field.value === null) {
    return field.history;
  }
  return [
    ...field.history,
    { value: field.value, status: field.status, source: field.source, replacedAt: now },
  ];
}

export function withField<K extends FieldName>(
  record: OnboardingRecord,
  name: K,
  next: OnboardingFields[K],
  now: string,
): OnboardingRecord {
  return {
    ...record,
    fields: { ...record.fields, [name]: { ...next, updatedAt: now } },
    updatedAt: now,
  };
}
