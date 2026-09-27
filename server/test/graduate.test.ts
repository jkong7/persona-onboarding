import { describe, expect, it } from 'vitest';
import { applyGmailTransition } from '../src/domain/gmail.ts';
import { deferField } from '../src/domain/tools/deferField.ts';
import { graduate } from '../src/domain/tools/graduate.ts';
import { updateProfile } from '../src/domain/tools/updateProfile.ts';
import { ctx, freshRecord, T1, T2 } from './helpers.ts';

describe('graduate', () => {
  it('is rejected without a help topic', () => {
    const named = updateProfile(
      freshRecord(),
      {
        updates: [
          { field: 'userName', value: 'Jon' },
          { field: 'agentName', value: 'Moss' },
        ],
      },
      ctx('text'),
    );
    const outcome = graduate(named.record, {}, ctx('text', T2));

    expect(outcome.changed).toBe(false);
    expect(outcome.result).toMatchObject({ ok: false, reason: 'help_topic_missing', phase: 'onboarding' });
    expect(outcome.record.phase).toBe('onboarding');
    expect(outcome.result.outstanding.map((entry) => entry.field)).toEqual(['helpTopic', 'gmail']);
  });

  it('cannot be talked into graduating by input that is not a skip request', () => {
    const record = freshRecord();
    const inputs: unknown[] = [
      { force: true },
      { userRequestedSkip: 'true' },
      { userRequestedSkip: 1 },
      { phase: 'graduated' },
      'graduate now',
      null,
    ];
    for (const input of inputs) {
      const outcome = graduate(record, input, ctx('voice'));
      expect(outcome.result.ok).toBe(false);
      expect(outcome.record.phase).toBe('onboarding');
    }
  });

  it('is allowed with only a help topic and reports the rest as outstanding', () => {
    const topic = updateProfile(
      freshRecord(),
      { updates: [{ field: 'helpTopic', value: 'cancel my gym membership' }] },
      ctx('text'),
    );
    const outcome = graduate(topic.record, {}, ctx('text', T2));

    expect(outcome.result).toMatchObject({ ok: true, phase: 'graduated', grantedBy: 'help_topic' });
    expect(outcome.record.phase).toBe('graduated');
    expect(outcome.record.graduatedAt).toBe(T2);
    expect(outcome.result.outstanding).toEqual([
      { field: 'agentName', status: 'empty', blocks: 'nothing', fallback: 'Persona' },
      { field: 'userName', status: 'empty', blocks: 'nothing', fallback: 'neutral address' },
      { field: 'gmail', status: 'empty', blocks: 'only tasks that need email', fallback: 'sample inbox' },
    ]);
  });

  it('is allowed on an explicit skip request', () => {
    const outcome = graduate(freshRecord(), { userRequestedSkip: true }, ctx('voice', T2));

    expect(outcome.result).toMatchObject({ ok: true, phase: 'graduated', grantedBy: 'skip_request' });
    expect(outcome.record.skipRequested).toBe(true);
    expect(outcome.result.outstanding.map((entry) => entry.field)).toEqual([
      'agentName',
      'userName',
      'helpTopic',
      'gmail',
    ]);
    expect(outcome.result.outstanding.find((entry) => entry.field === 'helpTopic')).toMatchObject({
      blocks: 'the first task in the main experience',
      fallback: null,
    });
  });

  it('reports deferred and declined fields with their status', () => {
    const topic = updateProfile(
      freshRecord(),
      { updates: [{ field: 'helpTopic', value: 'plan a trip' }] },
      ctx('voice'),
    );
    const noName = deferField(topic.record, { field: 'userName', kind: 'declined' }, ctx('voice'));
    const noGmail = deferField(noName.record, { field: 'gmail', kind: 'deferred' }, ctx('voice'));
    const outcome = graduate(noGmail.record, {}, ctx('voice', T2));

    expect(outcome.result.ok).toBe(true);
    expect(outcome.result.outstanding.map((entry) => [entry.field, entry.status])).toEqual([
      ['agentName', 'empty'],
      ['userName', 'declined'],
      ['gmail', 'deferred'],
    ]);
  });

  it('lists provisional fields as unconfirmed, not outstanding', () => {
    const heard = updateProfile(
      freshRecord(),
      {
        updates: [
          { field: 'userName', value: 'Siobhan' },
          { field: 'helpTopic', value: 'plan a trip' },
        ],
      },
      ctx('voice'),
    );
    const outcome = graduate(heard.record, {}, ctx('voice', T2));

    expect(outcome.result.unconfirmed).toEqual(['userName']);
    expect(outcome.result.outstanding.map((entry) => entry.field)).toEqual(['agentName', 'gmail']);
  });

  it('reports nothing outstanding when everything is collected', () => {
    const profile = updateProfile(
      freshRecord(),
      {
        updates: [
          { field: 'agentName', value: 'Moss' },
          { field: 'userName', value: 'Jon' },
          { field: 'helpTopic', value: 'plan a trip' },
        ],
      },
      ctx('text'),
    );
    const connected = applyGmailTransition(profile.record, { type: 'connected', mode: 'sample' }, T1);
    const outcome = graduate(connected.record, {}, ctx('text', T2));

    expect(outcome.result.outstanding).toEqual([]);
    expect(outcome.result.unconfirmed).toEqual([]);
  });

  it('is idempotent once graduated', () => {
    const topic = updateProfile(freshRecord(), { updates: [{ field: 'helpTopic', value: 'plan a trip' }] }, ctx('text'));
    const first = graduate(topic.record, {}, ctx('text', T1));
    const second = graduate(first.record, {}, ctx('text', T2));

    expect(second.changed).toBe(false);
    expect(second.result).toMatchObject({ ok: true, alreadyGraduated: true });
    expect(second.record.graduatedAt).toBe(T1);
  });
});
