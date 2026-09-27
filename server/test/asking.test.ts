import { describe, expect, it } from 'vitest';
import { describeState } from '../src/domain/describe.ts';
import { applyGmailTransition } from '../src/domain/gmail.ts';
import { deferField } from '../src/domain/tools/deferField.ts';
import { offerGmailConnect } from '../src/domain/tools/offerGmailConnect.ts';
import { recordAsk } from '../src/domain/tools/recordAsk.ts';
import { updateProfile } from '../src/domain/tools/updateProfile.ts';
import { ctx, freshRecord, T1, T2 } from './helpers.ts';

describe('record_ask', () => {
  it('counts asks and flags the last one allowed', () => {
    const first = recordAsk(freshRecord(), { field: 'userName' }, ctx('voice'));
    const second = recordAsk(first.record, { field: 'userName' }, ctx('voice', T2));

    expect(first.result).toMatchObject({ ok: true, askCount: 1, asksRemaining: 1, lastAllowedAsk: false });
    expect(second.result).toMatchObject({ ok: true, askCount: 2, asksRemaining: 0, lastAllowedAsk: true });
    expect(second.record.fields.userName.status).toBe('empty');
  });

  it('refuses a third ask and marks the field as not to be asked again', () => {
    const first = recordAsk(freshRecord(), { field: 'userName' }, ctx('voice'));
    const second = recordAsk(first.record, { field: 'userName' }, ctx('voice'));
    const third = recordAsk(second.record, { field: 'userName' }, ctx('voice', T2));
    const fourth = recordAsk(third.record, { field: 'userName' }, ctx('voice', T2));

    expect(third.result).toMatchObject({ ok: false, reason: 'ask_budget_spent', askCount: 2, asksRemaining: 0 });
    expect(third.record.fields.userName.status).toBe('deferred');
    expect(third.record.fields.userName.askCount).toBe(2);
    expect(fourth.result).toMatchObject({ ok: false, reason: 'deferred' });
    expect(fourth.changed).toBe(false);
  });

  it('reports a spent budget as not askable before any third attempt', () => {
    const first = recordAsk(freshRecord(), { field: 'helpTopic' }, ctx('text'));
    const second = recordAsk(first.record, { field: 'helpTopic' }, ctx('text'));
    const state = describeState(second.record);
    const entry = state.missing.find((missing) => missing.field === 'helpTopic');

    expect(entry).toMatchObject({ mayAsk: false, doNotAskBecause: 'ask_budget_spent', asksRemaining: 0 });
    expect(state.askable).not.toContain('helpTopic');
  });

  it('refuses to ask for something already known', () => {
    const known = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'Jon' }] }, ctx('voice'));
    const outcome = recordAsk(known.record, { field: 'userName' }, ctx('voice'));

    expect(outcome.result).toMatchObject({ ok: false, reason: 'already_known' });
    expect(outcome.changed).toBe(false);
  });

  it('tracks each field budget separately', () => {
    const a = recordAsk(freshRecord(), { field: 'userName' }, ctx('voice'));
    const b = recordAsk(a.record, { field: 'userName' }, ctx('voice'));
    const c = recordAsk(b.record, { field: 'helpTopic' }, ctx('voice'));

    expect(c.result).toMatchObject({ ok: true, askCount: 1, asksRemaining: 1 });
  });

  it('rejects unknown fields and malformed input', () => {
    const record = freshRecord();
    expect(recordAsk(record, { field: 'shoeSize' }, ctx('text')).result.reason).toBe('unknown_field');
    expect(recordAsk(record, null, ctx('text')).result.reason).toBe('invalid_input');
    expect(recordAsk(record, 'userName', ctx('text')).result.reason).toBe('invalid_input');
  });
});

describe('defer_field', () => {
  it('defers a field and stops further asks', () => {
    const deferred = deferField(freshRecord(), { field: 'agentName', kind: 'deferred' }, ctx('text'));
    const ask = recordAsk(deferred.record, { field: 'agentName' }, ctx('text', T2));

    expect(deferred.result).toMatchObject({ ok: true, status: 'deferred', mayAskAgain: false });
    expect(deferred.record.fields.agentName.status).toBe('deferred');
    expect(ask.result).toMatchObject({ ok: false, reason: 'deferred' });
    expect(ask.record.fields.agentName.askCount).toBe(0);
  });

  it('records a refusal as declined and stops further asks', () => {
    const declined = deferField(freshRecord(), { field: 'userName', kind: 'declined' }, ctx('voice'));
    const ask = recordAsk(declined.record, { field: 'userName' }, ctx('voice', T2));
    const state = describeState(declined.record);

    expect(declined.record.fields.userName.status).toBe('declined');
    expect(declined.record.fields.userName.source).toBe('voice');
    expect(ask.result).toMatchObject({ ok: false, reason: 'declined' });
    expect(state.missing.find((entry) => entry.field === 'userName')).toMatchObject({
      mayAsk: false,
      doNotAskBecause: 'declined',
    });
  });

  it('defaults to deferred when no kind is given', () => {
    const outcome = deferField(freshRecord(), { field: 'helpTopic' }, ctx('text'));
    expect(outcome.record.fields.helpTopic.status).toBe('deferred');
  });

  it('lets the user decline gmail without marking it connected', () => {
    const outcome = deferField(freshRecord(), { field: 'gmail', kind: 'declined' }, ctx('voice'));

    expect(outcome.record.fields.gmail.status).toBe('declined');
    expect(outcome.record.fields.gmail.value).toBeNull();
    expect(outcome.record.fields.gmail.mode).toBeNull();
  });

  it('will not defer a field that already has a value', () => {
    const known = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'Jon' }] }, ctx('text'));
    const outcome = deferField(known.record, { field: 'userName', kind: 'declined' }, ctx('text'));

    expect(outcome.result).toMatchObject({ ok: false, reason: 'already_has_value' });
    expect(outcome.record.fields.userName.value).toBe('Jon');
  });

  it('is idempotent', () => {
    const first = deferField(freshRecord(), { field: 'userName', kind: 'declined' }, ctx('voice'));
    const second = deferField(first.record, { field: 'userName', kind: 'declined' }, ctx('voice', T2));
    expect(second.changed).toBe(false);
    expect(second.result.ok).toBe(true);
  });

  it('rejects unknown fields and kinds', () => {
    const record = freshRecord();
    expect(deferField(record, { field: 'shoeSize' }, ctx('text')).result.reason).toBe('unknown_field');
    expect(deferField(record, { field: 'userName', kind: 'confirmed' }, ctx('text')).result.reason).toBe(
      'invalid_kind',
    );
    expect(deferField(record, undefined, ctx('text')).result.reason).toBe('invalid_input');
  });
});

describe('offer_gmail_connect', () => {
  it('marks gmail as offered and never as connected', () => {
    const outcome = offerGmailConnect(freshRecord(), {}, ctx('voice'));

    expect(outcome.result).toMatchObject({ ok: true, showConnectButton: true, connected: false });
    expect(outcome.record.fields.gmail.offered).toBe(true);
    expect(outcome.record.fields.gmail.status).toBe('empty');
    expect(outcome.record.fields.gmail.value).toBeNull();
    expect(outcome.record.fields.gmail.askCount).toBe(1);
  });

  it('stops offering once the ask budget is spent', () => {
    const first = offerGmailConnect(freshRecord(), {}, ctx('voice'));
    const second = offerGmailConnect(first.record, {}, ctx('voice'));
    const third = offerGmailConnect(second.record, {}, ctx('voice', T2));

    expect(second.result.ok).toBe(true);
    expect(third.result).toMatchObject({ ok: false, showConnectButton: false, reason: 'ask_budget_spent' });
    expect(third.record.fields.gmail.status).toBe('deferred');
    expect(third.record.fields.gmail.value).toBeNull();
  });

  it('does not offer after a refusal unless the user asks for it', () => {
    const declined = deferField(freshRecord(), { field: 'gmail', kind: 'declined' }, ctx('voice'));
    const unprompted = offerGmailConnect(declined.record, {}, ctx('voice'));
    const requested = offerGmailConnect(declined.record, { userRequested: true }, ctx('voice', T2));

    expect(unprompted.result).toMatchObject({ ok: false, reason: 'declined' });
    expect(requested.result).toMatchObject({ ok: true, showConnectButton: true, connected: false });
    expect(requested.record.fields.gmail.status).toBe('empty');
    expect(requested.record.fields.gmail.askCount).toBe(0);
  });

  it('reports an existing real connection instead of offering again', () => {
    const connected = applyGmailTransition(
      freshRecord(),
      { type: 'connected', mode: 'real', account: 'jon@example.com' },
      T1,
    );
    const outcome = offerGmailConnect(connected.record, { userRequested: true }, ctx('text', T2));

    expect(outcome.result).toMatchObject({ ok: false, reason: 'already_connected', connected: true, mode: 'real' });
    expect(outcome.changed).toBe(false);
  });

  it('lets a sample-inbox user ask to connect a real account', () => {
    const sample = applyGmailTransition(freshRecord(), { type: 'connected', mode: 'sample' }, T1);
    const unprompted = offerGmailConnect(sample.record, {}, ctx('text'));
    const requested = offerGmailConnect(sample.record, { userRequested: true }, ctx('text', T2));

    expect(unprompted.result).toMatchObject({ ok: false, reason: 'already_connected' });
    expect(requested.result).toMatchObject({ ok: true, connected: true, mode: 'sample' });
    expect(requested.record.fields.gmail.mode).toBe('sample');
  });
});
