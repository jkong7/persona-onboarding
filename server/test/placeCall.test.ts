import { describe, expect, it } from 'vitest';
import { declineCall, mayOfferCall, startCall } from '../src/domain/calls.ts';
import { describeState } from '../src/domain/describe.ts';
import { placeCall } from '../src/domain/tools/placeCall.ts';
import { ctx, freshRecord, memoryService, T1, T2 } from './helpers.ts';

describe('place_call', () => {
  it('rings when no call is active', () => {
    const outcome = placeCall(freshRecord(), { userRequested: false }, ctx('text'));
    expect(outcome.changed).toBe(true);
    expect(outcome.record.calls.ringing).toBe(true);
    expect(outcome.result).toMatchObject({ ok: true, ringing: true, reason: null });
  });

  it('does not ring twice', () => {
    const first = placeCall(freshRecord(), {}, ctx('text'));
    const second = placeCall(first.record, {}, ctx('text'));
    expect(second.changed).toBe(false);
    expect(second.result).toMatchObject({ ok: false, ringing: true, reason: 'already_ringing' });
  });

  it('refuses while a call is in progress', () => {
    const active = startCall(freshRecord(), 'call_1', T1).record;
    const outcome = placeCall(active, {}, ctx('text'));
    expect(outcome.result).toMatchObject({ ok: false, reason: 'call_in_progress' });
  });

  it('stops offering after two declines', () => {
    let record = freshRecord();
    for (let round = 0; round < 2; round += 1) {
      record = placeCall(record, {}, ctx('text')).record;
      record = declineCall(record, T2).record;
    }
    expect(record.calls.declined).toBe(2);
    expect(mayOfferCall(record)).toBe(false);
    const outcome = placeCall(record, { userRequested: false }, ctx('text'));
    expect(outcome.result).toMatchObject({ ok: false, reason: 'do_not_offer' });
    expect(describeState(record).text).toContain('do not offer a call unprompted');
  });

  it('still rings after declines when the user asks for the call', () => {
    let record = freshRecord();
    for (let round = 0; round < 2; round += 1) {
      record = placeCall(record, {}, ctx('text')).record;
      record = declineCall(record, T2).record;
    }
    const outcome = placeCall(record, { userRequested: true }, ctx('text'));
    expect(outcome.result).toMatchObject({ ok: true, ringing: true, userRequested: true });
  });

  it('ignores a decline when nothing is ringing', () => {
    const outcome = declineCall(freshRecord(), T1);
    expect(outcome.changed).toBe(false);
    expect(outcome.result.declined).toBe(false);
  });

  it('clears ringing when the call is answered', () => {
    const ringing = placeCall(freshRecord(), {}, ctx('text')).record;
    const answered = startCall(ringing, 'call_1', T2).record;
    expect(answered.calls.ringing).toBe(false);
    expect(answered.calls.activeCallId).toBe('call_1');
  });

  it('logs offer and decline events through the service', () => {
    const { service } = memoryService();
    const record = service.create();
    service.callTool(record.id, { name: 'place_call', input: { userRequested: false }, channel: 'text' });
    service.declineCall(record.id);
    service.logNote(record.id, 'thread_opened');
    const types = service.events(record.id).map((stored) => stored.event.type);
    expect(types).toEqual(['tool_call', 'call_offered', 'call_declined', 'note']);
    expect(service.get(record.id).calls.declined).toBe(1);
  });
});
