import { CALL_DECLINE_LIMIT, UNPLANNED_END_REASONS, UNPLANNED_HANGUP_LIMIT } from './fields.ts';
import type { CallEndReason, HangupIntent, OnboardingRecord, Outcome } from './types.ts';

export interface StartCallResult {
  started: boolean;
  callId: string;
  supersededCallId: string | null;
  callNumber: number;
}

export interface EndCallOutcome {
  ended: boolean;
  callId: string | null;
  reason: CallEndReason | null;
  unplanned: boolean;
  unplannedHangups: number;
  callbackRequested: boolean;
  ignoredBecause: 'no_active_call' | 'stale_call' | null;
}

export function isUnplanned(reason: CallEndReason): boolean {
  return UNPLANNED_END_REASONS.includes(reason);
}

export function mayOfferCall(record: OnboardingRecord): boolean {
  return (
    record.calls.unplannedHangups < UNPLANNED_HANGUP_LIMIT && record.calls.declined < CALL_DECLINE_LIMIT
  );
}

export type RingRejection = 'call_in_progress' | 'already_ringing' | 'do_not_offer';

export interface RingResult {
  ringing: boolean;
  reason: RingRejection | null;
}

export function ringCall(record: OnboardingRecord, userRequested: boolean, now: string): Outcome<RingResult> {
  if (record.calls.activeCallId !== null) {
    return { record, changed: false, result: { ringing: false, reason: 'call_in_progress' } };
  }
  if (record.calls.ringing) {
    return { record, changed: false, result: { ringing: true, reason: 'already_ringing' } };
  }
  if (!userRequested && !mayOfferCall(record)) {
    return { record, changed: false, result: { ringing: false, reason: 'do_not_offer' } };
  }
  const next: OnboardingRecord = {
    ...record,
    calls: { ...record.calls, ringing: true, callbackRequested: false },
    updatedAt: now,
  };
  return { record: next, changed: true, result: { ringing: true, reason: null } };
}

export function cancelRing(record: OnboardingRecord, now: string): Outcome<{ cancelled: boolean }> {
  if (!record.calls.ringing) {
    return { record, changed: false, result: { cancelled: false } };
  }
  return {
    record: { ...record, calls: { ...record.calls, ringing: false }, updatedAt: now },
    changed: true,
    result: { cancelled: true },
  };
}

export interface HangupRequest {
  requested: boolean;
  callId: string | null;
  intent: HangupIntent | null;
}

export function requestHangup(record: OnboardingRecord, intent: HangupIntent, now: string): Outcome<HangupRequest> {
  const callId = record.calls.activeCallId;
  if (callId === null) {
    return { record, changed: false, result: { requested: false, callId: null, intent: null } };
  }
  if (record.calls.hangupIntent === intent) {
    return { record, changed: false, result: { requested: true, callId, intent } };
  }
  return {
    record: { ...record, calls: { ...record.calls, hangupIntent: intent }, updatedAt: now },
    changed: true,
    result: { requested: true, callId, intent },
  };
}

export function cancelHangup(record: OnboardingRecord, now: string): Outcome<{ cancelled: boolean }> {
  if (record.calls.hangupIntent === null) {
    return { record, changed: false, result: { cancelled: false } };
  }
  return {
    record: { ...record, calls: { ...record.calls, hangupIntent: null }, updatedAt: now },
    changed: true,
    result: { cancelled: true },
  };
}

export interface DeclineResult {
  declined: boolean;
  declinedCount: number;
  mayOfferAgain: boolean;
}

export function declineCall(record: OnboardingRecord, now: string): Outcome<DeclineResult> {
  if (!record.calls.ringing) {
    return {
      record,
      changed: false,
      result: { declined: false, declinedCount: record.calls.declined, mayOfferAgain: mayOfferCall(record) },
    };
  }
  const next: OnboardingRecord = {
    ...record,
    calls: { ...record.calls, ringing: false, declined: record.calls.declined + 1 },
    updatedAt: now,
  };
  return {
    record: next,
    changed: true,
    result: { declined: true, declinedCount: next.calls.declined, mayOfferAgain: mayOfferCall(next) },
  };
}

export function startCall(record: OnboardingRecord, callId: string, now: string): Outcome<StartCallResult> {
  const active = record.calls.activeCallId;
  if (active === callId) {
    return {
      record,
      changed: false,
      result: { started: false, callId, supersededCallId: null, callNumber: record.calls.total },
    };
  }
  const superseded = active !== null;
  const next: OnboardingRecord = {
    ...record,
    calls: {
      ...record.calls,
      total: record.calls.total + 1,
      unplannedHangups: record.calls.unplannedHangups + (superseded ? 1 : 0),
      ringing: false,
      hangupIntent: null,
      activeCallId: callId,
      lastEndReason: superseded ? 'network_drop' : record.calls.lastEndReason,
      callbackRequested: false,
    },
    updatedAt: now,
  };
  return {
    record: next,
    changed: true,
    result: { started: true, callId, supersededCallId: active, callNumber: next.calls.total },
  };
}

export interface EndCallInput {
  callId: string | null;
  reason: CallEndReason;
  callbackRequested?: boolean;
}

export function endCall(record: OnboardingRecord, input: EndCallInput, now: string): Outcome<EndCallOutcome> {
  const active = record.calls.activeCallId;
  if (active === null || (input.callId !== null && input.callId !== active)) {
    return {
      record,
      changed: false,
      result: {
        ended: false,
        callId: input.callId,
        reason: null,
        unplanned: false,
        unplannedHangups: record.calls.unplannedHangups,
        callbackRequested: record.calls.callbackRequested,
        ignoredBecause: active === null ? 'no_active_call' : 'stale_call',
      },
    };
  }
  const unplanned = isUnplanned(input.reason);
  const callbackRequested =
    input.callbackRequested === true ||
    (input.reason === 'agent_ended' && record.calls.hangupIntent === 'callback_later');
  const next: OnboardingRecord = {
    ...record,
    calls: {
      ...record.calls,
      unplannedHangups: record.calls.unplannedHangups + (unplanned ? 1 : 0),
      activeCallId: null,
      hangupIntent: null,
      lastEndReason: input.reason,
      callbackRequested,
    },
    updatedAt: now,
  };
  return {
    record: next,
    changed: true,
    result: {
      ended: true,
      callId: active,
      reason: input.reason,
      unplanned,
      unplannedHangups: next.calls.unplannedHangups,
      callbackRequested,
      ignoredBecause: null,
    },
  };
}
