import { describe, expect, it } from 'vitest';
import { cancelHangup, endCall, mayOfferCall, startCall } from '../src/domain/calls.ts';
import { applyGmailTransition } from '../src/domain/gmail.ts';
import { endCallTool } from '../src/domain/tools/endCall.ts';
import { runTool, TOOL_NAMES } from '../src/domain/tools/index.ts';
import type { CallEndReason, GmailFailureReason } from '../src/domain/types.ts';
import { ctx, freshRecord, T1, T2 } from './helpers.ts';

describe('gmail transitions', () => {
  it('connects a real account', () => {
    const outcome = applyGmailTransition(
      freshRecord(),
      { type: 'connected', mode: 'real', account: ' jon@example.com ' },
      T1,
    );

    expect(outcome.result).toMatchObject({ applied: true, connected: true, mode: 'real', account: 'jon@example.com' });
    expect(outcome.record.fields.gmail).toMatchObject({
      value: 'jon@example.com',
      status: 'confirmed',
      source: 'system',
      mode: 'real',
      failureReason: null,
    });
  });

  it('connects the sample inbox with a labelled value', () => {
    const outcome = applyGmailTransition(freshRecord(), { type: 'connected', mode: 'sample' }, T1);

    expect(outcome.record.fields.gmail.mode).toBe('sample');
    expect(outcome.record.fields.gmail.value).toBe('Sample inbox');
    expect(outcome.record.fields.gmail.status).toBe('confirmed');
  });

  it('keeps each failure reason distinct and leaves gmail unconnected', () => {
    const reasons: GmailFailureReason[] = [
      'popup_closed',
      'popup_blocked',
      'not_allowlisted',
      'scope_missing',
      'exchange_failed',
    ];
    for (const reason of reasons) {
      const outcome = applyGmailTransition(freshRecord(), { type: 'failed', reason }, T1);
      expect(outcome.record.fields.gmail.failureReason).toBe(reason);
      expect(outcome.record.fields.gmail.status).toBe('empty');
      expect(outcome.result.connected).toBe(false);
    }
  });

  it('treats denied access as a refusal', () => {
    const outcome = applyGmailTransition(freshRecord(), { type: 'failed', reason: 'access_denied' }, T1);

    expect(outcome.record.fields.gmail.status).toBe('declined');
    expect(outcome.record.fields.gmail.failureReason).toBe('access_denied');
    expect(outcome.record.fields.gmail.value).toBeNull();
  });

  it('keeps the sample inbox when a later real attempt fails', () => {
    const sample = applyGmailTransition(freshRecord(), { type: 'connected', mode: 'sample' }, T1);
    const failed = applyGmailTransition(sample.record, { type: 'failed', reason: 'not_allowlisted' }, T2);

    expect(failed.result).toMatchObject({ connected: true, mode: 'sample', failureReason: 'not_allowlisted' });
    expect(failed.record.fields.gmail.status).toBe('confirmed');
  });

  it('moves the sample inbox to history when a real account connects', () => {
    const sample = applyGmailTransition(freshRecord(), { type: 'connected', mode: 'sample' }, T1);
    const real = applyGmailTransition(
      sample.record,
      { type: 'connected', mode: 'real', account: 'jon@example.com' },
      T2,
    );

    expect(real.record.fields.gmail.mode).toBe('real');
    expect(real.record.fields.gmail.history.map((entry) => entry.value)).toEqual(['Sample inbox']);
  });

  it('disconnects and records what was connected', () => {
    const connected = applyGmailTransition(
      freshRecord(),
      { type: 'connected', mode: 'real', account: 'jon@example.com' },
      T1,
    );
    const disconnected = applyGmailTransition(connected.record, { type: 'disconnected' }, T2);

    expect(disconnected.record.fields.gmail).toMatchObject({ value: null, status: 'empty', mode: null });
    expect(disconnected.record.fields.gmail.history.map((entry) => entry.value)).toEqual(['jon@example.com']);
  });

  it('rejects an empty account and a disconnect with nothing connected', () => {
    const empty = applyGmailTransition(freshRecord(), { type: 'connected', mode: 'real', account: '  ' }, T1);
    const none = applyGmailTransition(freshRecord(), { type: 'disconnected' }, T1);

    expect(empty.result).toMatchObject({ applied: false, rejectedBecause: 'invalid_account' });
    expect(none.result).toMatchObject({ applied: false, rejectedBecause: 'not_connected' });
    expect(empty.changed).toBe(false);
  });

  it('cannot be connected to a real account through any model tool', () => {
    const record = freshRecord();
    const hostile = {
      field: 'gmail',
      value: 'connected',
      status: 'confirmed',
      mode: 'real',
      account: 'jon@example.com',
      userRequested: true,
      userRequestedSkip: true,
      updates: [{ field: 'gmail', value: 'jon@example.com' }],
    };
    for (const name of TOOL_NAMES) {
      const outcome = runTool(record, name, hostile, ctx('voice'));
      const gmail = outcome.record.fields.gmail;
      expect(gmail.mode).not.toBe('real');
      if (name === 'use_sample_inbox') {
        expect(gmail).toMatchObject({ value: 'Sample inbox', mode: 'sample', status: 'confirmed' });
      } else {
        expect(gmail.value).toBeNull();
        expect(gmail.mode).toBeNull();
        expect(gmail.status).not.toBe('confirmed');
        expect(gmail.status).not.toBe('provisional');
      }
    }
  });

  it('lets the model switch to the sample inbox but never over a real account', () => {
    const sample = runTool(freshRecord(), 'use_sample_inbox', {}, ctx('voice'));
    expect(sample.result).toMatchObject({ ok: true, mode: 'sample' });
    const again = runTool(sample.record, 'use_sample_inbox', {}, ctx('voice'));
    expect(again.changed).toBe(false);

    const real = applyGmailTransition(
      freshRecord(),
      { type: 'connected', mode: 'real', account: 'jon@example.com' },
      T1,
    ).record;
    const blocked = runTool(real, 'use_sample_inbox', {}, ctx('voice'));
    expect(blocked.changed).toBe(false);
    expect(blocked.result).toMatchObject({ ok: false, reason: 'real_account_connected' });
    expect(blocked.record.fields.gmail).toMatchObject({ value: 'jon@example.com', mode: 'real' });
  });
});

describe('call bookkeeping', () => {
  it('counts calls and tracks the active one', () => {
    const started = startCall(freshRecord(), 'call_1', T1);

    expect(started.result).toMatchObject({ started: true, callNumber: 1, supersededCallId: null });
    expect(started.record.calls).toMatchObject({ total: 1, activeCallId: 'call_1', unplannedHangups: 0 });
  });

  it('counts only unplanned endings as hangups', () => {
    const cases: Array<[CallEndReason, number]> = [
      ['user_hangup', 1],
      ['tab_closed', 1],
      ['network_drop', 1],
      ['silence_timeout', 0],
      ['agent_ended', 0],
    ];
    for (const [reason, expected] of cases) {
      const started = startCall(freshRecord(), 'call_1', T1);
      const ended = endCall(started.record, { callId: 'call_1', reason }, T2);
      expect(ended.result.ended).toBe(true);
      expect(ended.record.calls.unplannedHangups).toBe(expected);
      expect(ended.record.calls.activeCallId).toBeNull();
      expect(ended.record.calls.lastEndReason).toBe(reason);
    }
  });

  it('ignores a second end signal for the same call', () => {
    const started = startCall(freshRecord(), 'call_1', T1);
    const first = endCall(started.record, { callId: 'call_1', reason: 'tab_closed' }, T2);
    const second = endCall(first.record, { callId: 'call_1', reason: 'network_drop' }, T2);

    expect(second.changed).toBe(false);
    expect(second.result).toMatchObject({ ended: false, ignoredBecause: 'no_active_call' });
    expect(second.record.calls.unplannedHangups).toBe(1);
    expect(second.record.calls.lastEndReason).toBe('tab_closed');
  });

  it('ignores an end signal for a call that is no longer the active one', () => {
    const first = startCall(freshRecord(), 'call_1', T1);
    const ended = endCall(first.record, { callId: 'call_1', reason: 'user_hangup' }, T1);
    const second = startCall(ended.record, 'call_2', T2);
    const late = endCall(second.record, { callId: 'call_1', reason: 'network_drop' }, T2);

    expect(late.changed).toBe(false);
    expect(late.result.ignoredBecause).toBe('stale_call');
    expect(late.record.calls.activeCallId).toBe('call_2');
  });

  it('lets a new call supersede one whose end was never reported', () => {
    const first = startCall(freshRecord(), 'call_1', T1);
    const second = startCall(first.record, 'call_2', T2);

    expect(second.result).toMatchObject({ started: true, supersededCallId: 'call_1', callNumber: 2 });
    expect(second.record.calls).toMatchObject({ total: 2, activeCallId: 'call_2', unplannedHangups: 1 });
  });

  it('stops offering calls after two unplanned hangups', () => {
    let record = freshRecord();
    expect(mayOfferCall(record)).toBe(true);
    record = startCall(record, 'call_1', T1).record;
    record = endCall(record, { callId: 'call_1', reason: 'user_hangup' }, T1).record;
    expect(mayOfferCall(record)).toBe(true);
    record = startCall(record, 'call_2', T2).record;
    record = endCall(record, { callId: 'call_2', reason: 'network_drop' }, T2).record;
    expect(mayOfferCall(record)).toBe(false);
  });

  it('asks for the call to end without ending it, and records a callback request once it does', () => {
    const started = startCall(freshRecord(), 'call_1', T1);
    const asked = endCallTool(started.record, { intent: 'callback_later' }, ctx('voice', T2));

    expect(asked.result).toMatchObject({ ok: true, intent: 'callback_later', callId: 'call_1', callbackRequested: true });
    expect(asked.record.calls).toMatchObject({ activeCallId: 'call_1', hangupIntent: 'callback_later' });

    const ended = endCall(asked.record, { callId: 'call_1', reason: 'agent_ended' }, T2);
    expect(ended.record.calls).toMatchObject({
      activeCallId: null,
      hangupIntent: null,
      lastEndReason: 'agent_ended',
      unplannedHangups: 0,
      callbackRequested: true,
    });
  });

  it('can take back a request to end the call', () => {
    const started = startCall(freshRecord(), 'call_1', T1);
    const asked = endCallTool(started.record, { intent: 'completed' }, ctx('voice', T2));
    const kept = cancelHangup(asked.record, T2);
    expect(kept.record.calls).toMatchObject({ activeCallId: 'call_1', hangupIntent: null });
    expect(cancelHangup(kept.record, T2).changed).toBe(false);
  });

  it('forgets a request to end the call when the person hangs up first', () => {
    const started = startCall(freshRecord(), 'call_1', T1);
    const asked = endCallTool(started.record, { intent: 'callback_later' }, ctx('voice', T2));
    const ended = endCall(asked.record, { callId: 'call_1', reason: 'user_hangup' }, T2);
    expect(ended.record.calls).toMatchObject({ hangupIntent: null, callbackRequested: false, unplannedHangups: 1 });
  });

  it('reports no active call when end_call is used outside a call', () => {
    const outcome = endCallTool(freshRecord(), {}, ctx('text'));
    expect(outcome.result).toMatchObject({ ok: false, reason: 'no_active_call' });
    expect(outcome.changed).toBe(false);
  });
});

describe('tool dispatch', () => {
  it('rejects an unknown tool without touching the record', () => {
    const record = freshRecord();
    const outcome = runTool(record, 'set_gmail_connected', { value: true }, ctx('voice'));

    expect(outcome.result).toEqual({ tool: 'set_gmail_connected', ok: false, reason: 'unknown_tool' });
    expect(outcome.record).toBe(record);
    expect(outcome.changed).toBe(false);
  });
});
