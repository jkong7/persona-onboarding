import { GMAIL_ACCOUNT_LIMIT, SAMPLE_INBOX_LABEL } from './fields.ts';
import { hasValue, historyWithCurrent, withField } from './record.ts';
import { sanitizeValue } from './sanitize.ts';
import type {
  FieldStatus,
  GmailFailureReason,
  GmailFieldState,
  GmailMode,
  OnboardingRecord,
  Outcome,
} from './types.ts';

export type GmailTransition =
  | { type: 'connected'; mode: 'real'; account: string }
  | { type: 'connected'; mode: 'sample' }
  | { type: 'failed'; reason: GmailFailureReason }
  | { type: 'disconnected' };

export interface GmailTransitionResult {
  applied: boolean;
  connected: boolean;
  mode: GmailMode | null;
  account: string | null;
  status: FieldStatus;
  failureReason: GmailFailureReason | null;
  rejectedBecause: 'invalid_account' | 'not_connected' | null;
}

function summarize(
  gmail: GmailFieldState,
  applied: boolean,
  rejectedBecause: GmailTransitionResult['rejectedBecause'],
): GmailTransitionResult {
  return {
    applied,
    connected: hasValue(gmail),
    mode: gmail.mode,
    account: gmail.value,
    status: gmail.status,
    failureReason: gmail.failureReason,
    rejectedBecause,
  };
}

function connect(gmail: GmailFieldState, value: string, mode: GmailMode, now: string): GmailFieldState {
  const replacing = gmail.value !== null && (gmail.value !== value || gmail.mode !== mode);
  return {
    ...gmail,
    value,
    status: 'confirmed',
    source: 'system',
    mode,
    failureReason: null,
    history: replacing ? historyWithCurrent(gmail, now) : gmail.history,
  };
}

function fail(gmail: GmailFieldState, reason: GmailFailureReason): GmailFieldState {
  if (hasValue(gmail)) {
    return { ...gmail, failureReason: reason };
  }
  return {
    ...gmail,
    status: reason === 'access_denied' ? 'declined' : gmail.status,
    source: reason === 'access_denied' ? 'system' : gmail.source,
    failureReason: reason,
  };
}

export function applyGmailTransition(
  record: OnboardingRecord,
  transition: GmailTransition,
  now: string,
): Outcome<GmailTransitionResult> {
  const gmail = record.fields.gmail;
  if (transition.type === 'connected' && transition.mode === 'real') {
    const account = sanitizeValue(transition.account, GMAIL_ACCOUNT_LIMIT);
    if (!account.ok || account.truncated) {
      return { record, changed: false, result: summarize(gmail, false, 'invalid_account') };
    }
    const next = withField(record, 'gmail', connect(gmail, account.value, 'real', now), now);
    return { record: next, changed: true, result: summarize(next.fields.gmail, true, null) };
  }
  if (transition.type === 'connected') {
    const next = withField(record, 'gmail', connect(gmail, SAMPLE_INBOX_LABEL, 'sample', now), now);
    return { record: next, changed: true, result: summarize(next.fields.gmail, true, null) };
  }
  if (transition.type === 'failed') {
    const next = withField(record, 'gmail', fail(gmail, transition.reason), now);
    return { record: next, changed: true, result: summarize(next.fields.gmail, true, null) };
  }
  if (!hasValue(gmail)) {
    return { record, changed: false, result: summarize(gmail, false, 'not_connected') };
  }
  const cleared: GmailFieldState = {
    ...gmail,
    value: null,
    status: 'empty',
    source: null,
    mode: null,
    failureReason: null,
    history: historyWithCurrent(gmail, now),
  };
  const next = withField(record, 'gmail', cleared, now);
  return { record: next, changed: true, result: summarize(next.fields.gmail, true, null) };
}
